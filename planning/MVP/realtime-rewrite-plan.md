## Plan: Replace SignalR with REST Commands + API Gateway WebSocket Push (Serverless Prerequisite 2)

SignalR needs a long-lived server process that holds connections and room groups in memory. Lambda can't provide that. This plan splits real-time into two parts:

- **Commands** become plain REST calls: HTTP API → Lambda.
- **Push** uses **API Gateway WebSocket APIs**. Connections are tracked in DynamoDB and fanned out with `PostToConnection`.

Local dev and e2e keep working with no AWS dependency, via an in-process WebSocket endpoint that speaks the same wire protocol.

- **Depends on:** [room-concurrency-plan.md](./room-concurrency-plan.md). Event ordering uses `GameRoom.Revision`.
- **Consumed by:** [deployment-plan.md](./deployment-plan.md).
- **Related:** [lambda-hosting-plan.md](./lambda-hosting-plan.md). That plan is independent and can run in parallel.

**Unchanged:**
- domain engine
- MediatR handlers (beyond publishing)
- DynamoDB room model
- UI components
- Zustand store shape (mostly)

**Non-goals:**
- authentication
- spectators
- guaranteed or replayable delivery (correctness comes from resync; see the rules below)

---

### Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Push transport | **API Gateway WebSocket API** | User choice. Mature, widely documented, CDK L2 support. AppSync Events was the cheaper and simpler alternative. |
| Command transport | **REST (`POST /api/rooms/{code}/…`)** | Synchronous result per command. Errors come back as HTTP status and body instead of a pushed `Error`. Keeps the WebSocket path free of business logic. |
| Event content | **Full room snapshot + revision + cause** in every event | Any missed event is healed by the next one, so clients never need to replay deltas. A snapshot is ~3–8 KB, under the 32 KB billing frame. |
| Ordering | **`revision` (room-level, from Prerequisite 1)** | Pushes from concurrent Lambdas can arrive out of order. Clients apply only newer revisions. |
| "GroupExcept" semantics | **Broadcast to everyone; client filters by `actorPlayerId`** | API Gateway has no groups, and filtering on the client is trivial. |
| Connection → room mapping | **`$connect` Lambda writes `(RoomCode, ConnectionId)` to a DynamoDB table** | Strongly consistent `Query` by room at fan-out time. |
| `$disconnect` | **Not routed.** Stale rows are removed when `PostToConnection` returns `410 Gone`, and by TTL. | AWS documents `$disconnect` as best-effort anyway. One less Lambda and route. |
| Keep-alive | **Client sends `{"action":"ping"}` every 5 min → `$default` route with a MOCK integration** | API Gateway closes idle connections after 10 min. A MOCK integration means no Lambda invocation; it only costs $1/M messages. |
| Local/e2e transport | **In-process `/ws` endpoint in the ASP.NET app (`Realtime:Mode=InProcess`)** | The browser code path is identical in every environment. No AWS emulator needed. |

---

### Architecture

```
PROD
 Browser ── POST /api/rooms/{code}/actions ──► CloudFront ─► HTTP API ─► Lambda: ASP.NET Core app
                                                                         1. handler: load → apply → conditional save (rev N+1)
                                                                         2. IRoomEventPublisher:
                                                                            Query Connections(RoomCode) → PostToConnection × k
                                                                            (410 Gone → delete row)
                                                                         3. HTTP 200 { revision N+1, roomInfo, gameState }
 Browser ◄═══ wss://<domain>/ws?room=ABC123 ═══ CloudFront ─► API Gateway WebSocket API (stage "ws")
                                                               $connect → Lambda ChipTracker.WsConnect:
                                                                          validate room → PutItem Connections
                                                               $default → MOCK (keep-alive; no Lambda)

LOCAL (docker compose, e2e, vite dev)
 Browser ── /api/* ──► nginx ─► Kestrel (same app)
 Browser ══ /ws ═════► nginx ─► Kestrel /ws  (in-memory room → sockets registry; same JSON frames)
```

---

### Wire Protocol

**Connect:** `wss://<host>/ws?room=<CODE>&playerId=<id>`
- `room` is required and must match `^[A-Z0-9]{6}$`, and the room must exist. Otherwise the connection is rejected (HTTP 400/404 during the upgrade).
- `playerId` is optional. It is used only for logging and is never trusted for authorization.

**Client → server:** only `{"action":"ping"}`, sent every 5 min while the socket is open. The server ignores any other frame. All commands go over REST.

**Server → client:** JSON text frames. Serialize with the same `System.Text.Json` options as the HTTP API (camelCase, `JsonStringEnumConverter`).

```json
{
  "type": "gameStateUpdated",
  "roomCode": "ABC123",
  "revision": 42,
  "actorPlayerId": "p_123",
  "roomInfo": { "...": "same shape as GET /api/rooms/{code}" },
  "gameState": { "...": "GameStateDto, null in the lobby" }
}
```

If a serialized event would exceed **30 KB**, send the envelope without `roomInfo`/`gameState` plus `"stale": true`. The client then resyncs via GET. This shouldn't happen: a 9-player room with 20 recent activity entries is ~8 KB. A unit test guards it.

**Event types** (exactly one event per successful command):

| `type` | Replaces SignalR | Raised by | Client side effect (beyond applying the snapshot) |
|---|---|---|---|
| `playerJoined` | `PlayerJoined` | `JoinRoomCommand` | Lobby list updates from the snapshot. |
| `gameStarted` | `GameStarted` | `StartGameCommand` | The lobby navigates to `/room/{code}`. This already happens when `gameState` becomes non-null. |
| `gameStateUpdated` | `GameStateUpdated` | `ProcessAction`, `UndoAction` (approve), `ResolveShowdown`, `Rebuy`, `DeclineRebuy` | None. |
| `undoRequested` | `UndoRequested` (GroupExcept) | `RequestUndo` | None. The undo prompt is derived from `gameState.pendingUndoRequestBy`. |
| `undoDeclined` | `UndoDeclined` (GroupExcept) | `ClearUndoRequest` (`IsCancel=false`) | Every client except the actor (the decliner) shows the transient "declined" notice, as today. |
| `undoCancelled` | `UndoCancelled` (GroupExcept) | `ClearUndoRequest` (`IsCancel=true`) | None. The prompt disappears via the snapshot. |
| *(removed)* | `UndoApproved` | — | The server never sent it. `gameStateUpdated` covers it. |
| *(removed)* | `Error` | — | Errors are HTTP responses to the caller. |

**Client application rules:**
1. Keep `lastRevision`. Apply an event's snapshot only if `event.revision > lastRevision`, then set `lastRevision`. Because every event is a full snapshot, gaps need no special handling.
2. Command responses carry the same `{ revision, roomInfo, gameState }`. The caller applies them immediately under the same rule, so its own push later arrives as a no-op.
3. On every (re)connect, on `visibilitychange` → visible, and on any `stale` event, **resync**: `GET /api/rooms/{code}`, then apply under the same rule. The order is: open the socket first, then GET. So any event committed after the GET is still delivered, and anything earlier is in the GET.
4. Undo UI state is derived from `gameState.pendingUndoRequestBy`, which is now added to `GameStateDto`. A resync therefore restores a pending undo prompt; today it is lost if the `UndoRequested` push is missed.

---

### REST Command Endpoints

All live under `/api/rooms/{roomCode}` with JSON bodies. Every success returns `200 { success: true, revision, roomInfo, gameState }`.

| Hub method today | New endpoint | Body |
|---|---|---|
| `JoinRoom(roomCode, playerId)` | *(removed)*: WebSocket connect + `GET /api/rooms/{code}` | — |
| `SubmitAction` | `POST /actions` | `{ playerId, action, amount? }` |
| `RequestUndo` | `POST /undo/request` | `{ playerId }` |
| `ApproveUndo` | `POST /undo/approve` | `{ playerId }` |
| `DeclineUndo` | `POST /undo/decline` | `{ playerId }` |
| `CancelUndo` | `POST /undo/cancel` | `{ playerId }` |
| `ResolveShowdown` + `ResolveShowdownWithAwards` | `POST /showdown` | `{ winnerPlayerId }` or `{ isSplit: true }` or `{ awards: [{ potIndex, winnerPlayerIds }] }` |
| `Rebuy` | `POST /rebuy` | `{ playerId }` |
| `DeclineRebuy` | `POST /decline-rebuy` | `{ playerId }` |

Existing endpoints stay, and their responses gain `revision`:
- `POST /api/rooms`
- `GET /api/rooms/{code}`
- `POST /join`
- `POST /start`
- `GET /activity`

Add `GET /api/health`; see the Lambda plan.

**Errors** (`{ success: false, error }`):
- **400:** domain or validation failure, including an unknown action.
- **404:** room not found or expired.
- **409:** concurrency retries exhausted.
- **429:** rate limited.

**Rate limiting:** a new per-IP `command` token-bucket policy (burst 20, 5/s) replaces `HubRateLimitFilter`. Remove the `hub-connect` policy and the `HubConnectPerMinute`/`HubInvocation*` options. In prod, WebSocket connects are capped by API Gateway stage throttling (deployment plan).

---

### Backend Changes

**Application**
- Replace `IGameNotifier` with `IRoomEventPublisher.PublishAsync(RoomEvent evt, CancellationToken ct)`.
  - `RoomEvent` = `(Type, RoomCode, Revision, ActorPlayerId, RoomSnapshot)`.
  - Remove `NotifyError` and its dead `NotifyError("", …)` calls.
- Add `RoomSnapshot.From(GameRoom)` → `{ revision, roomInfo, gameState }`. It is the **single** mapping used by:
  - `GetRoomQuery`
  - every command result
  - every event
- Add `PendingUndoRequestBy` to `GameStateDto`.
- Every `IRoomCommand` handler:
  1. Saves.
  2. Publishes exactly one event (table above).
  3. Returns the snapshot.
  - Publishing happens only after a successful save, so a concurrency retry never publishes twice.
- Publishing is awaited, but a publish failure **never fails the command** (the state is already committed). Log a warning; clients heal on their next resync.

**Infrastructure**
- `IConnectionRepository` + `DynamoDbConnectionRepository`. Table `ChipTracker_Connections`:
  - PK `RoomCode` (S), SK `ConnectionId` (S)
  - `PlayerId`, `ConnectedAt`
  - TTL `ExpirationTime` = connect time + 2 h 15 m. API Gateway's hard connection cap is 2 h, so a row can never outlive its socket by much.
  - Methods: `AddAsync`, `ListByRoomAsync` (consistent `Query`), `RemoveAsync`.
- `ApiGatewayRoomEventPublisher : IRoomEventPublisher` (`AWSSDK.ApiGatewayManagementApi`):
  1. Serialize the event once.
  2. `ListByRoomAsync`.
  3. `Task.WhenAll(PostToConnectionAsync)`. The endpoint is config `Realtime:ManagementEndpoint` = `https://{wsApiId}.execute-api.{region}.amazonaws.com/ws`.
  4. On `GoneException`, `RemoveAsync`. On any other error, log and continue.
  - It must finish before the HTTP response, because Lambda freezes the environment afterwards. No fire-and-forget.
- `IRoomRepository.ExistsAsync(roomCode)`: a `GetItem` that projects only `RoomCode, ExpirationTime`, so `$connect` doesn't read a large item.
- `DynamoDbTableInitializer` (local only) also creates the connections table.

**New project `src/backend/src/ChipTracker.WsConnect`** (Lambda class library)
- Packages: `Amazon.Lambda.Core`, `Amazon.Lambda.APIGatewayEvents`, `Amazon.Lambda.Serialization.SystemTextJson`.
- It references Infrastructure for `IRoomRepository.ExistsAsync` and `IConnectionRepository`.
- Handler `HandleConnectAsync(APIGatewayProxyRequest)`:
  1. Validate the `room` query parameter.
  2. Call `ExistsAsync`.
  3. Call `AddAsync(room, requestContext.connectionId, playerId)`.
  4. Return 200, or 400/404 to reject.
- Kept separate from the API function: a small zip gives a faster cold start, and the ASP.NET Lambda adapter doesn't understand WebSocket events.

**Presentation**
- Delete:
  - `Hubs/GameHub.cs`
  - `Services/SignalRGameNotifier.cs`
  - `RateLimiting/HubRateLimitFilter`
  - `AddSignalR`
  - `MapHub`
  - the `Microsoft.AspNetCore.SignalR` usings
- Add `Endpoints/GameCommandEndpoints.cs` (the endpoint table) with one shared result → `IResult` mapper. Also map `RoomConcurrencyException` → 409.
- `Realtime:Mode`:
  - **`InProcess`** (default; docker compose, tests, `dotnet run`):
    - `app.UseWebSockets()` + `app.Map("/ws", …)`.
    - The handler validates `room`, registers the socket in a singleton `InProcessConnectionRegistry` (room → sockets), reads and discards frames until close, then unregisters.
    - `InProcessRoomEventPublisher` sends to the room's sockets. Use a per-socket `SemaphoreSlim`, because `WebSocket.SendAsync` is not concurrency-safe.
  - **`ApiGateway`** (Lambda): register `ApiGatewayRoomEventPublisher` and `DynamoDbConnectionRepository`. Don't map `/ws`.
- `src/frontend/nginx.conf`: replace `location /hubs/` with `location /ws`, with Upgrade/Connection headers and `proxy_read_timeout 1h`.

---

### Frontend Changes

- Remove the `@microsoft/signalr` dependency.
- **`lib/api.ts`** (new):
  - Typed `fetch` helpers for the command endpoints, plus `getRoom`.
  - They return `{ revision, roomInfo, gameState }` or throw `ApiError(status, message)`.
  - Base URL: `import.meta.env.VITE_API_URL ?? ''`, as today.
- **`lib/wsUrl.ts`** (new):
  - Use `VITE_WS_URL` if set.
  - Otherwise, if `VITE_API_URL` is set, swap `http`→`ws` and append `/ws`.
  - Otherwise use `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`.
- **`hooks/useRoomEvents.ts`** (replaces the connection half of `useSignalR`):
  1. Open the socket for `{ roomCode, playerId }`.
  2. `onopen` → `setConnected(true)` → resync.
  3. `onmessage` → `applyEvent`.
  4. Ping every 5 min.
  5. `onclose`/`onerror` → `setConnected(false)` → reconnect with the existing `lib/reconnect.ts` backoff (never gives up).
  6. On `visibilitychange` → visible: reconnect now if not `OPEN`, else resync.
  - The 2-h server close is just another reconnect.
  - Keep the `onRejoined` callback the lobby uses (call it after each resync that follows a reconnect).
- **`hooks/useGameCommands.ts`** (replaces the invoke half):
  - Same function names and signatures as today's `useSignalR` return value, so `GamePage.tsx`/`LobbyPage.tsx` change only their import.
  - On success, apply the response snapshot.
  - On `ApiError`, `setError(message)`. A 409 also triggers a resync.
  - An in-flight guard stops double-submits.
- **`stores/gameStore.ts`:**
  - Add `lastRevision` and a single `applySnapshot(revision, roomInfo, gameState)` that enforces the revision rule. It updates `gameState`, `lobbyPlayers` and `roomSettings`.
  - Derive `undoRequested`/`undoPendingSelf` from `gameState.pendingUndoRequestBy`.
  - Keep `undoDeclined` as a transient notice.
- Keep the connection indicator's semantics and aria-labels (`Connected`/`Reconnecting`), so the e2e selectors stay valid.
- `LobbyPage.tsx`: replace the inline `fetch` for room load, join and start with `lib/api.ts`. Navigation on `gameState` stays.

---

### Delivery Steps (each step leaves the app working and green)

1. **Snapshot & publisher seam** (after Prerequisite 1):
   - Add `RoomSnapshot`, `PendingUndoRequestBy`, `IRoomEventPublisher` and `RoomEvent`.
   - Add a temporary `SignalRRoomEventPublisher` that maps events onto the existing `IGameClient` methods.
   - Handlers publish; the hub stops broadcasting itself.
   - Behavior is unchanged. All suites pass.
2. **REST commands:**
   - Add `GameCommandEndpoints` and `lib/api.ts`.
   - Switch the frontend commands to REST, still receiving pushes over SignalR.
   - Remove the hub's command methods; `JoinRoom` stays.
3. **WebSocket transport:**
   - Add the in-process `/ws`, `useRoomEvents` and the store `applySnapshot` changes.
   - Delete SignalR server and client code, and the nginx `/hubs/` block.
4. **AWS path:**
   - Add `ApiGatewayRoomEventPublisher`, `DynamoDbConnectionRepository` and the `ChipTracker.WsConnect` project, with unit/integration tests using fakes.
   - Real-AWS verification happens in deployment-plan Phases 0 and 5.

---

### Tests

- **Application (unit):**
  - Each command publishes exactly one event with the right type, revision and actor, and only after the save.
  - A failed publish doesn't fail the command.
  - `RoomSnapshot` maps `pendingUndoRequestBy`.
  - A max-size snapshot (9 players, 20 activity entries) serializes to ≤ 30 KB.
- **Presentation (WebApplicationFactory):**
  - Status codes for every command endpoint (200/400/404/409/429).
  - Connect a `TestServer` WebSocket client to `/ws?room=…`, `POST /actions`, and receive `gameStateUpdated` with revision N+1.
  - A bad room → upgrade rejected.
  - Replace the hub-based parts of `RateLimitingTests`.
- **Infrastructure (Testcontainers DynamoDB):**
  - `DynamoDbConnectionRepository` add/list/remove/TTL.
  - `ApiGatewayRoomEventPublisher` with a fake `IAmazonApiGatewayManagementApi`: fans out to all connections, deletes rows on `GoneException`, and tolerates other failures.
- **`ChipTracker.WsConnect` (unit):** valid room → 200 + row written; missing/malformed/unknown room → 400/404.
- **Frontend (Vitest):** replace `useSignalR.test.tsx` with `useRoomEvents.test.tsx` and `useGameCommands.test.tsx`, using a mock `WebSocket` and fake timers.
  - **useRoomEvents:**
    - resync on open, visibility and `stale`
    - stale revisions ignored
    - ping every 5 min
    - reconnect with backoff
  - **useGameCommands:**
    - response applied
    - errors and 409 handling
    - double-submit guard
- **e2e (docker compose):**
  - All existing specs pass. `13-reconnect` still restarts the backend, which drops the in-process sockets.
  - New `14-ws-drop.spec.ts`: one client goes offline (`context.setOffline(true)`) while the other acts and requests an undo. Back online, it shows the latest state and the pending undo prompt.

### Acceptance Criteria

- `rg -i signalr src tests` returns nothing (except historical docs), and `@microsoft/signalr` is gone from `package.json`.
- Backend, frontend and full e2e suites pass on docker compose.
- Clients converge to the same revision after any sequence of disconnects, sleeps and backend restarts.
- No component outside `lib/api.ts`/`useRoomEvents`/`useGameCommands` knows which transport is used.

### Risks & Notes

- **Push is best-effort.** Correctness relies on resync plus the revision rule, not on delivery.
- **Latency.** A command is one HTTPS round trip; the opponent's update is one `PostToConnection` hop. This is comparable to SignalR when warm. Cold starts are covered in [lambda-hosting-plan.md](./lambda-hosting-plan.md).
- **`$connect` cold start.** The `WsConnect` Lambda adds ~0.5–1 s to the first connect after idle. The UI shows "Reconnecting" briefly. Acceptable.
- **API Gateway's 2-h connection cap** causes a silent reconnect + resync. Consider suppressing the indicator for reconnects that finish in under 2 s.
