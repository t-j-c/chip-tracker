## Plan: Chip Tracker MVP Gap Fix

Product spec vs implementation gap analysis found **12 issues** across 4 severity tiers.

---

### Phase A: Fix Core Game Logic (blocks everything)

**A1. Fix heads-up blind rules** — GameEngine.cs
- `CreateInitialState()` and `ResolveShowdown()` use multi-player formula: dealer+1=SB, dealer+2=BB. Wrong for heads-up.
- Spec: "Dealer is the Small Blind (SB) and acts first pre-flop, last post-flop"
- Fix: special-case 2 players so `dealerIndex == smallBlindIdx`, `(dealerIndex+1) == bigBlindIdx`. Pre-flop first-to-act = dealer/SB. `AdvancePhase()` post-flop first-to-act = non-dealer/BB.
- Update domain tests.

**A2. Auto-award pot on fold** — GameEngine.cs
- Spec: "If Player A folds, the app instantly awards pot to Player B and resets for next hand"
- Current: sets `IsHandActive=false`, pot sits unawardded. Client must manually call ResolveShowdown.
- Fix: when `AdvanceTurn()` detects <=1 active player, auto-award pot to remaining player, rotate dealer, post blinds, start new hand.

**A3. Add split pot to showdown** — Backend + ShowdownDialog.tsx
- Spec says showdown options: "Player A wins, Player B wins, or Split Pot"
- Only single winner implemented.
- Add split pot logic to `GameEngine`, extend `ResolveShowdownCommand` or add new command, add "Split Pot" button to ShowdownDialog.

---

### Phase B: Fix UX Issues (*parallel with Phase A backend work*)

**B1. Fix bet input** — ActionBar.tsx
- Replace `window.prompt()` with inline number input + confirm (same pattern as raise).

**B2. Fix raise default** — ActionBar.tsx
- `raiseAmount` defaults to 0 (invalid). Should default to `currentBet + minRaise`.

**B3. Fix JoinRoomPage URL** — JoinRoomPage.tsx
- Hardcodes `http://localhost:5000`. Should use `VITE_API_URL`.

**B4. Fix undo decline** — GameHub.cs + UndoDialog.tsx
- Declining only closes dialog client-side. Requester gets no feedback.
- Add `DeclineUndo` hub method, show "declined" notification to requester.

**B5. Show connection status** — GamePage.tsx
- `isConnected` tracked in store but never displayed. Add disconnected/reconnecting indicator.

---

### Phase C: Missing Product Spec Features (*depends on A+B*)

**C1. QR code join flow**
- Spec: "Joiner selects Player A's locally broadcasted game". High-level design: "QR code containing local network URL".
- After room creation, display QR code with join URL. Use JS library (e.g., `qrcode.react`).
- Joiner scans QR, lands on join page with room code pre-filled.

**C2. Player name picker on join** — JoinRoomPage.tsx
- Currently asks for raw player ID (a GUID). Should fetch room state, show player names as buttons.

---

### Phase D: Code Cleanup (*parallel with C*)

**D1. Remove dead SignalRGameNotifier path** — SignalRGameNotifier.cs
- All 3 methods are no-ops. Hub broadcasts directly. Remove notifier calls from command handlers, delete stub. Simpler than wiring it up.

**D2. Add phase validation to ResolveShowdown** — ResolveShowdownCommandHandler.cs
- Can currently be called at any phase. Gate on `Phase == Showdown || IsHandActive == false`.

---

### Verification
1. `dotnet test` — domain + application tests pass (update existing, add new for blind rules, fold auto-award, split pot)
2. Manual: create room, verify dealer posts SB (not BB), play through hand
3. Manual: fold instantly awards pot and starts new hand (no manual step)
4. Manual: showdown shows 3 options (Player A, Player B, Split)
5. Manual: scan QR code from phone, lands on join page
6. Manual: all bet/raise inputs are inline (no browser prompt)
7. Manual: heads-up blind rotation correct across 3+ consecutive hands

---

### Decisions
- **DynamoDB stays** — high-level design suggested in-memory for MVP, but DynamoDB Local is already working. Not worth reverting.
- **No full mDNS/UDP discovery** — QR code is sufficient MVP network discovery. Full auto-detect is over-engineering for heads-up between friends.
- **Remove notifier, don't wire it** — Hub-direct broadcast pattern is simpler and already working.

### Excluded
- Side pots (heads-up split is even split, not side pots)
- Blind schedule escalation
- Hand history UI
- Authentication