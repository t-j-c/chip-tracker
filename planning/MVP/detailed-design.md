## Plan: Chip Tracker MVP

Full-stack heads-up poker chip tracker. .NET 10 Clean Architecture backend (SignalR, MediatR, DynamoDB). React 18/Vite frontend (Zustand, SignalR client, Shadcn/Tailwind). Docker Compose local dev. AWS CDK infra. GitHub Actions CI/CD.

---

### Phase 1: Project Scaffolding *(no deps)*

**1.1** Root layout: `src/backend/`, `src/frontend/`, `infra/`, `docker-compose.yml`, `scripts/`, `.github/workflows/`

**1.2** Backend solution:
```
src/backend/
  ChipTracker.sln
  src/
    ChipTracker.Domain/           (class lib, zero deps)
    ChipTracker.Application/      (class lib, refs Domain, MediatR)
    ChipTracker.Infrastructure/   (class lib, refs Application, AWSSDK.DynamoDBv2)
    ChipTracker.Presentation/     (web project, refs all above, SignalR)
  tests/
    ChipTracker.Domain.Tests/     (xUnit + FluentAssertions)
    ChipTracker.Application.Tests/ (xUnit + NSubstitute)
    ChipTracker.Integration.Tests/ (xUnit + WebApplicationFactory + Testcontainers)
```

**1.3** Frontend: Vite + React 18 + TS scaffold with Tailwind, Shadcn, Zustand, `@microsoft/signalr`, Vitest, Playwright

**1.4** Docker Compose: `api` (builds .NET Dockerfile, port 5000) + `dynamodb-local` (port 8000). Env vars wire local DynamoDB connection.

**1.5** Init scripts (PowerShell + bash): create `ChipTracker_Rooms` table (PK=`RoomCode`, PAY_PER_REQUEST)

**Verify:** `dotnet build` + `npm run build` + `docker compose up` all succeed

---

### Phase 2: Domain Layer *(depends on 1)*

**2.1** Enums: `PokerAction` (Fold/Check/Call/Bet/Raise/AllIn), `GamePhase` (PreFlop/Flop/Turn/River/Showdown)

**2.2** Entities:
- `Player`: PlayerId, Name, Stack, CurrentBet, HasFolded, IsAllIn, IsDealer
- `GameState`: Players, Pot, CurrentBet, ActivePlayerTurnId, Phase, DealerIndex, SmallBlind, BigBlind, MinRaise, IsHandActive
- `GameRoom`: RoomCode, Players, CurrentState, StateHistory (list of snapshots for undo), timestamps
- `ActionRequest`: PlayerId, Action, Amount

**2.3** `GameEngine` (static pure methods, immutable state transitions):
- `ValidateAction(GameState, ActionRequest)` returns `Result<GameState, string>` - turn enforcement, min raise, all-in calc, action legality
- `AdvanceTurn()` - rotate to next active player
- `AdvancePhase()` - next phase, reset bets
- `ResolveShowdown(state, winnerPlayerId)` - award pot, rotate dealer, new hand
- `CreateInitialState(players, blinds, dealerIndex)` - post blinds, set turn
- `UndoLastAction(GameRoom)` - pop StateHistory

**2.4** Domain unit tests (100% coverage target, 7+ test classes):
- ValidateAction tests (valid/invalid raises, check-when-bet, fold, call exact, call all-in)
- Pot calculation, turn rotation, phase advancement, showdown/dealer rotation, undo, edge cases (both all-in, head-up blind rules)

**Verify:** `dotnet test` Domain.Tests all pass, 100% coverage on `GameEngine`

---

### Phase 3: Application Layer *(depends on 2)*

**3.1** Interfaces: `IRoomRepository` (Get/Save/Create), `IGameNotifier` (NotifyGameStateUpdated/UndoRequested/Error)

**3.2** MediatR handlers:
- `CreateRoomCommand` / handler: validate 2 players, create room, save, return code
- `JoinRoomCommand` / handler: fetch room, add player if not full, save, broadcast
- `ProcessActionCommand` / handler: fetch, validate via GameEngine, push old state to history, save, broadcast
- `UndoActionCommand` / handler: fetch, pop history, save, broadcast
- `ResolveShowdownCommand` / handler: fetch, resolve, save, broadcast
- `GetRoomQuery` / handler: fetch for recovery

**3.3** Unit tests: mock repository + notifier with NSubstitute, verify correct calls and error propagation

**Verify:** `dotnet test` Application.Tests pass

---

### Phase 4: Infrastructure Layer *(depends on 3, parallel with 5)*

**4.1** `DynamoDbRoomRepository : IRoomRepository` - single table, JSON serialization of full `GameRoom` including `StateHistory`, 6-char room code generation with collision check

**4.2** DI extensions: `AddInfrastructure()` (DynamoDB client + repo), `AddApplication()` (MediatR)

**Verify:** Integration tests with DynamoDB Local - CRUD + serialization round-trip of StateHistory

---

### Phase 5: Presentation Layer *(depends on 3 + 4)*

**5.1** Minimal APIs: `POST /api/rooms` (create), `GET /api/rooms/{roomCode}` (recovery), `GET /health`

**5.2** `GameHub : Hub` - methods: `JoinRoom`, `SubmitAction`, `RequestUndo`, `ResolveShowdown`. Catches domain errors, sends `Error` event to caller only.

**5.3** `SignalRGameNotifier : IGameNotifier` using `IHubContext<GameHub>`, sends to groups by room code

**5.4** `Program.cs`: wire MediatR, SignalR, Infrastructure, CORS, map endpoints + hub at `/hubs/game`

**5.5** Multi-stage Dockerfile (sdk build, aspnet runtime, port 5000)

**Verify:** Integration tests via `WebApplicationFactory` - HTTP endpoints + SignalR hub connect/join/action/broadcast/undo

---

### Phase 6: Frontend *(depends on 5 API contract, mostly parallel with 4-5)*

**6.1** Types: TS mirrors of GameState, Player, PokerAction, GamePhase, ActionRequest

**6.2** `useSignalR` hook: connect `/hubs/game`, expose joinRoom/submitAction/requestUndo/resolveShowdown, auto-reconnect

**6.3** Zustand store: roomCode, playerId, gameState, isConnected, error, undoRequested

**6.4** Pages:
- `CreateRoomPage`: player names, stacks, blinds form. POST `/api/rooms`, redirect
- `GamePage`: `PlayerPanel` (x2), `PotDisplay`, `ActionBar` (context-sensitive buttons + amount input), `UndoDialog`, `ShowdownDialog`
- `JoinRoomPage`: enter room code for reconnection

**6.5** React Router: `/` (create), `/room/:roomCode` (game), `/join`

**6.6** Unit tests (Vitest + Testing Library): store transitions, component rendering, hook mocks

**Verify:** `npm run test` passes

---

### Phase 7: E2E Tests *(depends on 5 + 6)*

Playwright with two browser contexts:
- **game-flow**: create room, join, blinds posted, bet, fold, pot awarded, dealer rotates
- **undo-flow**: bet, request undo, approve, state reverts
- **reconnection**: disconnect, rejoin via GET endpoint, see current state

**Verify:** `npx playwright test` passes against docker compose

---

### Phase 8: AWS CDK Infrastructure *(parallel with 2-6)*

CDK stack (`infra/lib/chip-tracker-stack.ts`):
- DynamoDB table (PAY_PER_REQUEST)
- ECR repo
- ECS Cluster + Fargate service behind ALB
- S3 bucket (frontend static)
- CloudFront distribution (S3 origin + ALB origin for `/api/*` + `/hubs/*`)

**Verify:** `cdk synth` valid CloudFormation

---

### Phase 9: CI/CD GitHub Actions *(depends on 8)*

- **backend.yml**: trigger `src/backend/**`, build, test (DynamoDB Local service container), docker push ECR, deploy ECS
- **frontend.yml**: trigger `src/frontend/**`, install, lint, test, build, sync S3, CloudFront invalidation
- **infra.yml**: trigger `infra/**`, `cdk diff` on PR, `cdk deploy` on merge

**Verify:** YAML syntax valid, first deploy creates resources

---

### Excluded from MVP
- Split pots / side pots (heads-up only, no multi-way)
- Player authentication (trust-based, player selects identity)
- Custom domain / SSL (CloudFront default)
- Multiple games per room, spectator mode, chat, hand history export

---

### Key Files (all created new)

| Layer | Key Files |
|---|---|
| Domain | `src/backend/src/ChipTracker.Domain/Engine/GameEngine.cs`, `Entities/`, `Enums/` |
| Application | `src/backend/src/ChipTracker.Application/Commands/`, `Queries/`, `Interfaces/` |
| Infrastructure | `src/backend/src/ChipTracker.Infrastructure/Persistence/DynamoDbRoomRepository.cs` |
| Presentation | `src/backend/src/ChipTracker.Presentation/Hubs/GameHub.cs`, `Endpoints/RoomEndpoints.cs`, `Program.cs`, `Dockerfile` |
| Frontend | `src/frontend/src/hooks/useSignalR.ts`, `stores/gameStore.ts`, `pages/`, `components/` |
| DevOps | `docker-compose.yml`, `scripts/init-dynamodb.*`, `infra/lib/chip-tracker-stack.ts`, `.github/workflows/` |

---