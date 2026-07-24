# Technical Design Document: ChipTrack MVP

## 1. Architectural Vision

We will use **Clean Architecture** to ensure the Domain (poker rules, state, math) has zero dependencies on the infrastructure (network, web server). We will employ **Domain-Driven Design (DDD)** to model the strict rules of heads-up poker.

### 1.1 Tech Stack (Local MVP)

* **Backend:** .NET 8 (or 9) C# ASP.NET Core.
* **Real-time Communication:** SignalR (WebSockets).
* **Frontend:** Blazor WebAssembly (or a lightweight React/Vue SPA) hosted by the .NET server. *Using Blazor keeps the entire codebase in C#, which accelerates agent-driven development.*
* **Persistence:** In-Memory Singleton Repository (no database required for MVP).

### 1.2 Cloud-Native Pathway

By isolating the `Game` aggregate root, moving to the cloud later only requires swapping the in-memory repository for Redis/PostgreSQL and deploying the .NET server to a cloud provider (e.g., Azure App Service).

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

This layer coordinates between the SignalR Hub and the Domain. We will use the Command/Handler pattern (e.g., using MediatR).

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

### 4.1 Real-Time Sync (SignalR)

Because state must perfectly sync across two devices without polling, SignalR is the backbone of the app.

* **`GameHub`:** Both players connect to this hub and join a SignalR Group based on the `GameId`.
* Whenever the Application layer successfully processes a command (e.g., `SubmitActionCommand`), the Hub broadcasts a `GameStateUpdated` event containing the latest DTO to the Group. The UI simply acts as a dumb renderer of this state.

### 4.2 Local Network Discovery

* **Primary (Auto):** Implement basic UDP broadcasting or mDNS (Zeroconf) in the background service to announce the server's local IP address.
* **Fallback (Manual):** The host UI displays a large QR code containing the local network URL (e.g., `[http://192.168.1.50:5000/join/game123](http://192.168.1.50:5000/join/game123)`) that the joiner scans with their phone camera to instantly connect.

---

## 5. Agent Implementation Plan

*Instruct your AI coding agent to execute these phases sequentially:*

1. **Phase 1: Scaffolding & Core.** Create a .NET solution with `Core`, `Application`, `Infrastructure`, and `WebApi` projects. Implement the `Game`, `Hand`, and `Player` aggregates in `Core`. Write unit tests to verify heads-up blind posting and state transitions (Pre-flop -> Flop).
2. **Phase 2: App Logic & In-Memory State.** Implement MediatR commands for game creation, joining, and player actions. Create a thread-safe `InMemoryGameRepository` (using `ConcurrentDictionary`) in the Infrastructure layer.
3. **Phase 3: SignalR Integration.** Create `GameHub`. Map the MediatR commands to Hub methods. Ensure the Hub pushes the `GameStateDto` to connected clients after every successful command.
4. **Phase 4: Frontend (UI).** Scaffold the SPA (Blazor or React). Implement the two main views: Setup View (Host/Join) and Table View (Stacks, Pot, Action Buttons). Bind the UI strictly to the SignalR `GameStateUpdated` event.
5. **Phase 5: Local Connectivity.** Add a library like `QRCoder` to generate a QR code on the Host's screen pointing to their local IP, making joining frictionless for Player B.