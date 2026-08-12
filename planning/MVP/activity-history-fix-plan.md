# Activity History — Why It's Invisible & Fix Plan

## TL;DR

The frontend reads the activity list from `gameState.recentActivity`, but **`GameStateDto` has no `RecentActivity` property**, so the value is always `undefined`. `ActivityStrip` returns `null` when it finds no non-undone entry, so nothing renders — exactly what the screenshot shows. Even once data flows, the backend DTO shape does not match what the frontend formatter expects, so entries would render as `"Unknown took action on "` / `"Hand undefined started"`.

---

## Evidence

### 1. Primary blocker — `recentActivity` never exists

Frontend consumer:

- [src/frontend/src/pages/GamePage.tsx](src/frontend/src/pages/GamePage.tsx#L273-L277) — `entries={(gameState as any).recentActivity || []}`
- [src/frontend/src/pages/GamePage.tsx](src/frontend/src/pages/GamePage.tsx#L403-L408) — `fallbackEntries={(gameState as any)?.recentActivity || []}`

Backend producer — [src/backend/src/ChipTracker.Application/DTOs/GameStateDto.cs](src/backend/src/ChipTracker.Application/DTOs/GameStateDto.cs#L5-L17) has `Players`, `Pot`, `CurrentBet`, `ActivePlayerTurnId`, `Phase`, `DealerIndex`, `SmallBlind`, `BigBlind`, `MinRaise`, `IsHandActive`, `Pots`. **No `RecentActivity`.**

Frontend type — [src/frontend/src/types/game.ts](src/frontend/src/types/game.ts#L41-L53) `GameState` also has no `recentActivity` field, which is why the implementer had to cast to `any` (the cast silenced the compiler error that would have caught this).

`grep recentActivity` across the repo returns **only those two GamePage lines** — nothing produces it.

Early return that hides the strip: [src/frontend/src/components/ActivityStrip.tsx](src/frontend/src/components/ActivityStrip.tsx#L14-L19).

### 2. Secondary — DTO field shape mismatch

| Frontend expects ([activityFormat.ts](src/frontend/src/lib/activityFormat.ts#L1-L10)) | Backend sends ([ActivityEntryDto.cs](src/backend/src/ChipTracker.Application/DTOs/ActivityEntryDto.cs#L8-L18)) |
| --- | --- |
| `entryType` | `entryType` ✅ |
| `playerName` | `playerId` ❌ (raw GUID, wrong key) |
| `actionType` | `action` ❌ |
| `amount` | `amount` ✅ |
| `phase` | `oldPhase` / `newPhase` ❌ |
| `potIndex` | — ❌ missing |
| `blindType` | — ❌ missing |
| `handNumber` | — ❌ missing (`HandStarted` smuggles it in `Amount`, see [GameEngine.cs](src/backend/src/ChipTracker.Domain/Engine/GameEngine.cs#L743-L748)) |
| `isUndone` | `isUndone` ✅ |
| `sequenceNumber` | `sequence` ❌ |

The domain entity [ActivityEntry.cs](src/backend/src/ChipTracker.Domain/Entities/ActivityEntry.cs#L10-L59) genuinely lacks `PlayerName`, `Phase`, `PotIndex`, `BlindType`, `HandNumber` — this is not just a naming problem, the data isn't captured. `GameEngine.Emit` call sites never stamp the phase.

Consequence with current formatter: `PlayerAction` → `"Unknown took action on "`, `HandStarted` → `"Hand undefined started"`, `PhaseAdvanced` → `"Advanced to "`.

### 3. Modal — wrong API base URL

[ActivityHistoryModal.tsx](src/frontend/src/components/ActivityHistoryModal.tsx#L39) uses a bare `fetch('/api/rooms/${roomCode}/activity')`. Every other caller uses `import.meta.env.VITE_API_URL ?? ''` ([GamePage.tsx](src/frontend/src/pages/GamePage.tsx#L76), [LobbyPage.tsx](src/frontend/src/pages/LobbyPage.tsx#L36), [JoinRoomPage.tsx](src/frontend/src/pages/JoinRoomPage.tsx#L19)). Works behind the nginx proxy at :3000, breaks on `vite dev` at :5173 with `VITE_API_URL=http://localhost:5000`.

### 4. Modal — infinite fetch loop

[ActivityHistoryModal.tsx](src/frontend/src/components/ActivityHistoryModal.tsx#L50) has `fallbackEntries` in the effect dependency array. GamePage passes `(gameState as any)?.recentActivity || []` — a **new array identity on every render**. Effect fires → `setEntries`/`setLoading` → re-render → new array → effect fires again. Endless request loop once the modal opens.

### 5. Modal — non-existent Tailwind classes

[ActivityHistoryModal.tsx](src/frontend/src/components/ActivityHistoryModal.tsx#L77-L120) uses `bg-surface-900`, `border-surface-300`, `text-surface-50`, `text-surface-400`, `text-surface-300`, `hover:bg-surface-800`. The `@theme` block in [src/frontend/src/index.css](src/frontend/src/index.css#L4-L21) only defines `surface-bg`, `surface-card`, `surface-elevated`. Tailwind v4 emits nothing for the rest → unstyled/transparent modal over a dark page.

### 6. Undo never strikes entries through

[GameRoom.UndoLastAction()](src/backend/src/ChipTracker.Domain/Entities/GameRoom.cs#L102-L113) pops `StateHistory` but never touches `ActivityLog`, so `IsUndone` stays `false` forever despite the `StateVersion` mechanism documented at [ActivityEntry.cs](src/backend/src/ChipTracker.Domain/Entities/ActivityEntry.cs#L49-L51). Test [ActivityLogGameRoomTests.cs](src/backend/tests/ChipTracker.Domain.Tests/ActivityLogGameRoomTests.cs#L112-L125) only asserts the property is settable — it does not exercise undo.

### 7. Endpoint 500s on unknown room

[GetGameActivityLogQuery.cs](src/backend/src/ChipTracker.Application/Queries/GetGameActivityLogQuery.cs#L41-L42) throws `InvalidOperationException`; [Program.cs](src/backend/src/ChipTracker.Presentation/Program.cs#L105-L112) has no handler → unhandled 500 instead of 404.

---

## Fix Plan

### Phase 1 — Capture the missing data in the domain (backend)

1. Add to [ActivityEntry.cs](src/backend/src/ChipTracker.Domain/Entities/ActivityEntry.cs): `string? PlayerName`, `GamePhase? Phase`, `int? PotIndex`, `BlindType? BlindType`, `int HandNumber`. Update `Clone()` to copy all of them.
2. Add `public enum BlindType { SmallBlind, BigBlind }` to `ChipTracker.Domain/Enums`.
3. In [GameEngine.cs](src/backend/src/ChipTracker.Domain/Engine/GameEngine.cs#L15), change `Emit(GameState state, ActivityEntry entry)` to auto-stamp `entry.Phase ??= state.Phase` and `entry.HandNumber = state.HandNumber`, plus `entry.PlayerName ??= state.Players.FirstOrDefault(p => p.PlayerId == entry.PlayerId)?.Name`. This fixes all ~14 emit sites at once instead of editing each.
4. Fix the four `PhaseAdvanced` / `PotWon` / `BlindPosted` / `HandStarted` sites that need explicit values:
   - `PhaseAdvanced` (line ~310): keep `OldPhase`/`NewPhase`; set `Phase = state.Phase` (the new phase) so the frontend's `Advanced to {phase}` works.
   - `PotWon` (lines ~367, ~524, ~626, ~655): set `PotIndex`.
   - `BlindPosted` (lines ~871, ~883): set `BlindType`.
   - `HandStarted` (lines ~745, ~922): stop overloading `Amount`; rely on the new `HandNumber` field.

### Phase 2 — Expose it over the wire (backend)

5. Extend [ActivityEntryDto.cs](src/backend/src/ChipTracker.Application/DTOs/ActivityEntryDto.cs) with `PlayerName`, `Phase`, `PotIndex`, `BlindType`, `HandNumber`. Keep `Sequence`/`PlayerId`/`Action` for existing consumers and tests.
6. Add a `MapFromDomain(ActivityEntry)` static factory on the DTO; use it in [GetGameActivityLogQuery.cs](src/backend/src/ChipTracker.Application/Queries/GetGameActivityLogQuery.cs#L48-L61) to remove the hand-rolled projection.
7. **Add `List<ActivityEntryDto> RecentActivity` to [GameStateDto.cs](src/backend/src/ChipTracker.Application/DTOs/GameStateDto.cs).** `MapFromDomain(GameState)` cannot see `GameRoom.ActivityLog`, so add an overload `MapFromDomain(GameRoom room)` (or an optional `IEnumerable<ActivityEntry> activityLog = null` parameter) that fills `RecentActivity` with the last ~20 entries. Update the call sites that broadcast to clients:
   - [GameHub.cs](src/backend/src/ChipTracker.Presentation/Hubs/GameHub.cs) lines 61, 101, 162, 194, 234, 313, 340
   - the command handlers that build `GameState` results: `ProcessActionCommandHandler`, `UndoActionCommandHandler`, `ResolveShowdownCommandHandler`, `RebuyCommandHandler`, `DeclineRebuyCommandHandler`, `StartGameCommand`, `GetRoomQuery`
   
   Simplest mechanical approach: keep one code path by having every handler call `GameStateDto.MapFromDomain(room)` instead of `MapFromDomain(room.CurrentState)`.
8. Mark undone entries: in `UndoLastAction()`, after popping, set `IsUndone = true` on every `ActivityLog` entry whose `StateVersion > StateHistory.Count + 1`.
9. Return 404 instead of throwing: have the handler return an empty/`Success = false` response for a missing room, and map that to `Results.NotFound` in [Program.cs](src/backend/src/ChipTracker.Presentation/Program.cs#L105).

Serialization note: `JsonStringEnumConverter` is already registered for both minimal-API JSON and the SignalR payload ([Program.cs](src/backend/src/ChipTracker.Presentation/Program.cs#L18-L26)), so `entryType`/`actionType`/`phase`/`blindType` will arrive as the strings the frontend union types expect. Default camelCase naming also matches. No extra config needed.

### Phase 3 — Frontend wiring

10. Add `recentActivity?: ActivityEntry[]` to the `GameState` interface in [src/frontend/src/types/game.ts](src/frontend/src/types/game.ts#L41). Rename `ActivityEntry.sequenceNumber` → `sequence` and add `playerName`/`blindType`/`potIndex` to match the final DTO.
11. Remove both `as any` casts in [GamePage.tsx](src/frontend/src/pages/GamePage.tsx#L275) and [GamePage.tsx](src/frontend/src/pages/GamePage.tsx#L407). These casts are what let the bug ship — with them gone TypeScript enforces the contract.
12. Memoize the entries array in GamePage so the modal's effect is stable:
    ```ts
    const recentActivity = useMemo(() => gameState?.recentActivity ?? [], [gameState?.recentActivity]);
    ```
    Pass `recentActivity` to both components.
13. In [ActivityHistoryModal.tsx](src/frontend/src/components/ActivityHistoryModal.tsx#L39): prefix the fetch with `import.meta.env.VITE_API_URL ?? ''`, and drop `fallbackEntries` from the dependency array (capture it via a ref, or gate on `open`/`roomCode` only) to kill the render loop.
14. Replace the invalid `surface-*` classes in the modal with tokens that exist: `bg-surface-elevated`, `border-surface-card`, `text-text-primary`, `text-text-secondary`, `hover:bg-surface-card`. Reuse the visual language of [UndoDialog.tsx](src/frontend/src/components/UndoDialog.tsx) / [RebuyDialog.tsx](src/frontend/src/components/RebuyDialog.tsx) for consistency.
15. Consolidate the three duplicate `ActivityEntry` type declarations ([ActivityStrip.tsx](src/frontend/src/components/ActivityStrip.tsx#L3), [ActivityHistoryModal.tsx](src/frontend/src/components/ActivityHistoryModal.tsx#L6), [types/game.ts](src/frontend/src/types/game.ts#L115)) down to the one in `types/game.ts`.

### Phase 4 — Verify

16. `dotnet test` — expect breakage in [GetActivityLogEndpointTests.cs](src/backend/tests/ChipTracker.Application.Tests/GetActivityLogEndpointTests.cs#L28-L29) and [GetGameActivityLogQueryHandlerTests.cs](src/backend/tests/ChipTracker.Application.Tests/GetGameActivityLogQueryHandlerTests.cs#L112) from the positional-record change; update the constructor calls.
17. Add a domain test: after `UndoLastAction()`, the popped hand's entries have `IsUndone == true`.
18. Add an application test: `GameStateDto.MapFromDomain(room)` populates `RecentActivity`.
19. `npm test` in `src/frontend` — the existing `ActivityStrip.test.tsx` / `ActivityHistoryModal.test.tsx` / `activityFormat.test.ts` suites pass today because they feed hand-written frontend-shaped fixtures. **Update those fixtures to the real DTO shape** or they will keep masking the mismatch.
20. `docker compose up --build`, create a room, seat two players, start the game. Confirm the strip appears under the phase stepper showing `"Hand 1 started"` / the last action, tap it, confirm the modal lists entries grouped by hand.
21. Run `tests/e2e/tests/12-activity-history.spec.ts`. Note the stale failures already sitting in [tests/e2e/test-results](tests/e2e/test-results) for TC51/TC52 — those are this bug, and should go green.

---

## Suggested ordering

Phases 1→2 are one backend commit (they don't compile independently). Phase 3 is one frontend commit. Steps 12–14 (loop, URL, styling) are independently shippable and worth doing even before the backend lands, since they're latent bugs the strip currently hides.

## Why this slipped through

- `(gameState as any).recentActivity` defeated the type checker at the exact seam that was wrong.
- Component unit tests supplied fixtures in the frontend's *desired* shape rather than the backend's *actual* shape, so they validated the formatter against an imaginary contract.
- The e2e test that would have caught it was failing and the failures were left in `test-results/`.
