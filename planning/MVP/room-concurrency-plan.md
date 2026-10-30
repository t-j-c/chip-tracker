## Plan: Room Revisions & Optimistic Concurrency (Serverless Prerequisite 1)

Give every room a monotonic `Revision` and make room saves conditional on it. This is the first prerequisite for the serverless deployment in [deployment-plan.md](./deployment-plan.md). It has no dependencies and ships safely on today's SignalR app.

### Why

- **Lost updates on Lambda.** `DynamoDbRoomRepository.SaveAsync` is an unconditional `PutItem` (last write wins). With one long-lived server this was a low risk. On Lambda, every request can run in a different execution environment, so two commands for the same room can load the same item, and the later save silently discards the earlier one. Example pairs:
  - two lobby joins
  - an action racing an undo approval
  - a double-tapped button
- **Event ordering.** The realtime layer ([realtime-rewrite-plan.md](./realtime-rewrite-plan.md)) needs a per-room counter that only goes up, so clients can drop stale or out-of-order pushes. `GameState.StateVersion` can't be used: it goes backward on undo.

### Design

**1. `GameRoom.Revision` (`long`, persisted).**
- Room creation writes `Revision = 1`.
- Every successful save writes exactly `loaded + 1`.
- A stored item without the attribute loads as `0`, so legacy items still work. Rooms have a 1-day TTL, so legacy items disappear quickly anyway.

**2. Conditional save.**
- `SaveAsync(room)`:
  1. Remember `expected = room.Revision`.
  2. Set `room.Revision = expected + 1`.
  3. `PutItem` with condition `attribute_not_exists(#rev) OR #rev = :expected`.
- On `ConditionalCheckFailedException`, restore `room.Revision` and throw `RoomConcurrencyException`. This new exception type lives in `ChipTracker.Application`, so handlers and endpoints never see AWS types.
- `TryCreateAsync` keeps its existing create-or-replace-expired condition and writes `Revision = 1`.

**3. Strongly consistent reads.**
- `GetByRoomCodeAsync` uses `ConsistentRead = true`, so a command never starts from a stale copy. Without it, every command right after another would risk a conflict.
- Cost is 2× read units on a few hundred reads per game, which is negligible.

**4. Retry pipeline behavior.**
- Add a marker interface `IRoomCommand` to every state-changing command:
  - `JoinRoom`, `StartGame`
  - `ProcessAction`
  - `RequestUndo`, `ClearUndoRequest`, `UndoAction`
  - `ResolveShowdown`
  - `Rebuy`, `DeclineRebuy`
- `CreateRoom` already has its own collision retry, so it is excluded.
- Add `RoomConcurrencyRetryBehavior<TRequest, TResponse>` (MediatR `IPipelineBehavior`):
  - It catches `RoomConcurrencyException` and re-runs the whole handler up to **3 attempts**, with 10–50 ms jittered delays.
  - Each attempt reloads the room and re-validates against domain rules. A command that is no longer valid (e.g. "not your turn" after the opponent acted) becomes a normal validation failure, not a conflict.
  - After the last attempt it rethrows. The Presentation layer maps `RoomConcurrencyException` to **HTTP 409** with `{ success: false, error: "The game changed while processing your request. Please try again." }`.
- **Handler rule (enforce in review):** handlers must load the room at the start of `Handle` and publish notifications only **after** `SaveAsync` succeeds. Both are true today. The retry behavior depends on handlers being side-effect free until the save.

**5. Expose the revision.**
- Every response that returns room state also returns `revision`:
  - `GET /api/rooms/{code}`
  - `POST /join`
  - `POST /start`
  - the command results
- Add `Revision` to the Application result types. The frontend ignores it until the realtime rewrite starts using it.

### Steps

1. **Domain.** Add `Revision` to `GameRoom`. The default `0` comes through JSON round-tripping in `RoomDocumentSerializer` with no other changes.
2. **Application.**
   - Add `RoomConcurrencyException` and `IRoomCommand`.
   - Add `RoomConcurrencyRetryBehavior` and register it in `Application/DependencyInjection.cs`.
   - Mark the commands listed in Design §4.
   - Add `Revision` to result types and `GetRoomQuery`.
3. **Infrastructure.** Make `DynamoDbRoomRepository.SaveAsync` conditional, make `GetByRoomCodeAsync` consistent, and set `Revision = 1` in `TryCreateAsync`.
4. **Presentation.**
   - Map `RoomConcurrencyException` to 409 for REST endpoints.
   - For the SignalR hub (until it is removed), push an `Error` to the caller with the same message.
   - Add `revision` to REST responses.
5. **Frontend:** no change required. Optionally show the 409 message via the existing error toast.

### Tests

- **Integration (Testcontainers DynamoDB, `DynamoDbRoomRepositoryTests`):**
  - Load the same room twice, save copy A, then save copy B. B throws `RoomConcurrencyException` and A's change persists.
  - A legacy item without `Revision` loads as `0` and saves as `1`.
  - `TryCreateAsync` writes `Revision = 1`.
- **Unit (Application.Tests):**
  - The retry behavior succeeds when the handler conflicts once and then succeeds.
  - It rethrows after 3 conflicts.
  - It doesn't retry non-room commands or other exceptions.
- **Integration (WebApplicationFactory):**
  - Fire 8 concurrent `POST /api/rooms/{code}/join` calls. All 8 players are in the room and `revision` = 1 + 8.
  - A forced conflict surfaces as 409.
- **Regression:** the existing domain, application, frontend and e2e suites pass unchanged.

### Acceptance Criteria

- No code path writes a room with an unconditional `PutItem`.
- Concurrent commands on one room never lose an update. Each command either applies on top of the latest state or fails cleanly (validation error, or 409 after retries).
- `revision` increases by exactly 1 per successful state-changing command and is returned to clients.
