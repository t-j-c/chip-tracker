# Technical Design Document: ChipTrack MVP

## 1. Architectural Vision

We will use **Clean Architecture** to ensure the Domain (poker rules, state, math) has zero dependencies on the infrastructure (network, web server). We will employ **Domain-Driven Design (DDD)** to model the strict rules of heads-up poker.

### 1.1 Tech Stack (as built)

* **Backend:** .NET 10 C# ASP.NET Core (Clean Architecture, MediatR).
* **Real-time Communication:** SignalR (WebSockets) today. This is being replaced by REST commands plus server-push of revisioned state snapshots over a plain WebSocket: API Gateway WebSocket in production, an in-process endpoint locally. See [realtime-rewrite-plan.md](./realtime-rewrite-plan.md).
* **Frontend:** React + Vite SPA (Zustand, Tailwind). It is served as static files, by nginx locally and by S3 + CloudFront in production, on the same origin as the API.
* **Persistence:** DynamoDB, with DynamoDB Local for development. The original plan was in-memory; see [detailed-design-2.md](./detailed-design-2.md) decisions.

### 1.2 Cloud Deployment

The MVP is deployed publicly on AWS, serverless and pay-per-use (about $1/month at family scale), on our Route 53 domain. See [deployment-plan.md](./deployment-plan.md).

* **Edge:** CloudFront serves the SPA from S3. It routes `/api/*` to an API Gateway HTTP API and `/ws` to an API Gateway WebSocket API.
* **Compute:** the same ASP.NET Core app runs on AWS Lambda ([lambda-hosting-plan.md](./lambda-hosting-plan.md)). A small `$connect` Lambda registers WebSocket connections per room.
* **State:** DynamoDB holds room state and the connection registry, so there is no in-memory server state and no single-instance constraint. Everything scales automatically.
* **Concurrency:** concurrent commands on one room are serialized with optimistic concurrency, using a room revision and conditional writes ([room-concurrency-plan.md](./room-concurrency-plan.md)).

---

## 2. Domain-Driven Design (Core Layer)

This layer contains zero references to external frameworks. It is pure C#.

### 2.1 Aggregates & Entities

* **`Game` (Aggregate Root):** Manages the overall lifecycle. Holds the list of players, configuration (blinds, starting stacks), and the current `Hand`.
* **`Player` (Entity):** Tracks `Id`, `Name`, and `CurrentStack`.
* **`Hand` (Entity):** Manages the state of a single poker hand. Tracks the `Pot`, `DealerId`, `CurrentStreet` (PreFlop, Flop, Turn, River, Showdown), and `ActionQueue`.

### 2.2 Value Objects

* **`ChipAmount`:** Encapsulates integer values to prevent negative chip counts.
* **`PlayerAction`:** Represents an action taken (Type: Fold, Check, Call, Raise; Amount: int).

### 2.3 Domain State Machine (Heads-Up Rules)

The `Hand` entity must enforce strict heads-up logic:

* **Pre-flop:** Dealer is the Small Blind (SB) and acts *first*.
* **Post-flop:** Dealer acts *last*.
* **Action Validation:** A player cannot "Check" if there is an outstanding bet. A "Raise" must be at least the size of the previous bet/raise.

---

## 3. Application Layer (Use Cases)

This layer coordinates between the presentation layer and the Domain. The presentation layer was the SignalR Hub; after [realtime-rewrite-plan.md](./realtime-rewrite-plan.md) it is the REST command endpoints. We will use the Command/Handler pattern (e.g., using MediatR).

| Command / Query | Description |
| --- | --- |
| `CreateGameCommand` | Host initializes config (Stacks, Blinds). Returns `GameId`. |
| `JoinGameCommand` | Joiner connects to `GameId`. |
| `StartHandCommand` | Posts blinds, assigns Dealer, transitions state to PreFlop. |
| `SubmitActionCommand` | Processes Fold, Check, Call, or Raise. Calculates next state. |
| `AwardPotCommand` | Manual resolution at showdown. Transfers pot to winner. |
| `GetGameStateQuery` | Returns a serialized DTO of the current board for the UI. |

---

## 4. Infrastructure & Presentation (Outer Layers)

### 4.1 Real-Time Sync

State must sync perfectly across devices without polling.

* **As built (SignalR):** players connect to `GameHub` and join a SignalR group per room. After each successful command, the hub broadcasts `GameStateUpdated` with the latest DTO to the group.
* **Target (serverless; see [realtime-rewrite-plan.md](./realtime-rewrite-plan.md)):**
  * **Commands** are REST calls (e.g., `POST /api/rooms/{code}/actions`). The handler loads the room, applies the command and saves it conditionally, incrementing the room `Revision`.
  * **Push:** after the save, the server pushes a full, revisioned state snapshot to every WebSocket connection registered for the room. In production that is API Gateway WebSocket `PostToConnection`; locally it is an in-process `/ws` endpoint. The caller also receives the snapshot in the HTTP response.
  * **Client:** applies only snapshots newer than its last revision. It resyncs with `GET /api/rooms/{code}` after (re)connecting, when the tab becomes visible, and when told a snapshot was too large to push. Push is best-effort; resync guarantees convergence.
* In both models, the UI simply acts as a dumb renderer of this state.

### 4.2 Joining a Game

* **QR code / link (implemented):** The host UI displays a QR code with the public join URL (e.g., `https://<domain>/join?room=ABC123`). The joiner scans it with their phone camera, or enters the 6-character room code manually.
* **~~Local network discovery (UDP/mDNS)~~:** Dropped. QR join is sufficient (see [detailed-design-2.md](./detailed-design-2.md)), and discovery is irrelevant now that the app is publicly hosted.

---

## 5. Agent Implementation Plan

*Instruct your AI coding agent to execute these phases sequentially:*

1. **Phase 1: Scaffolding & Core.** Create a .NET solution with `Core`, `Application`, `Infrastructure`, and `WebApi` projects. Implement the `Game`, `Hand`, and `Player` aggregates in `Core`. Write unit tests to verify heads-up blind posting and state transitions (Pre-flop -> Flop).
2. **Phase 2: App Logic & In-Memory State.** Implement MediatR commands for game creation, joining, and player actions. Create a thread-safe `InMemoryGameRepository` (using `ConcurrentDictionary`) in the Infrastructure layer.
3. **Phase 3: SignalR Integration.** Create `GameHub`. Map the MediatR commands to Hub methods. Ensure the Hub pushes the `GameStateDto` to connected clients after every successful command.
4. **Phase 4: Frontend (UI).** Scaffold the SPA (Blazor or React). Implement the two main views: Setup View (Host/Join) and Table View (Stacks, Pot, Action Buttons). Bind the UI strictly to the SignalR `GameStateUpdated` event.
5. **Phase 5: Local Connectivity.** Add a library like `QRCoder` to generate a QR code on the Host's screen pointing to their local IP, making joining frictionless for Player B.