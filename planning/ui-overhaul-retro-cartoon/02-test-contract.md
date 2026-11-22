# 02. Test Contract: Do Not Break These

The existing Playwright suite (`tests/e2e`, 15 specs) and Vitest suite are the regression contract for this overhaul. Neither is edited. The phase files already satisfy every rule below. This page explains *why* the code looks the way it does, so nobody "simplifies" a detail that a test depends on.

> Playwright's `getByText('x')` and `getByRole(..., { name: 'x' })` match **case-insensitive substrings** and fail on **more than one visible match** (strict mode). Most rules below follow from that.

## 1. Exact texts that must exist

| Text (exact) | Where | Used by |
|---|---|---|
| `Your Turn - Choose Action` | Action dock ribbon (`ActionBar`) | `waitForMyTurn`, turn detection in nearly every spec. CSS `uppercase` is fine, but the DOM text must stay as-is. |
| `Waiting for your turn...` | Waiting dock (`ActionBar`) | `fold()`, TC12 |
| `Connecting to game...` | `GamePage` loading state | `waitForGameReady` |
| `Stack:` (an element whose whole text is exactly this) | `HeroPanel` | TC11 `text=/^Stack:$/` |
| `Your bet: $10` (text content of the panel) | `HeroPanel`: `Your bet: ` + amount | TC62–64 `toContainText` |
| `Dealer` (visible) | `DealerChip variant="pill"` in `HeroPanel` | TC11 `getByText('Dealer')`, TC62–64 |
| `All In` (with a space) | `StatusTag` on an all-in seat | TC20 `getByText('All In')` |
| `{n} of 9 players` | Lobby counter | `createAndStartGame` and others |
| `Who won the hand?` | Showdown dialog description | `waitForShowdown` |
| `{name} wins` (button name prefix) | Showdown winner buttons | `selectShowdownWinner` |
| `Split Pot` | Showdown button | `splitPot` |
| `{n} of {m}` inside `pot-step-label` | Side-pot stepper | TC side pots |
| `Undo was declined…`, `…wants to undo the last action` | GamePage notice / Undo banner | undo specs |
| `Creating...`, `Create Game`, `Custom Setup`, `Casual`, `Standard`, `Deep Stack` | Create page | creation specs, `createRoom` |
| `Look Up`, `Join Game`, `Start Game`, `Approve`, `Decline`, `Activity History` (heading), `Showdown` (heading) | various | various |
| `Room not found`, `Failed to reach server` | Join and Create errors | error specs |

## 2. Texts that must NOT appear elsewhere (strict-mode collisions)

| Forbidden on the game page | Why | How the plan complies |
|---|---|---|
| Any extra visible text containing **`dealer`** | `getByText('Dealer')` must match exactly one element | Splash copy says "Deal 2 cards each" ("deal", not "dealer"). Seats use a "D" puck. Announcements never say "dealer". |
| Any extra visible text containing **`all in`** (with a space) | `getByText('All In')` must match only the seat tag | The bubble says `All-in!` and the button `All-In` (hyphen). Announcements never say "all in". |
| Any extra **`$30` / `$40` / `$90`** text while those values are asserted | `getByText('$30')` etc. must match only the pot | Bubbles, splashes and announcements carry **no amounts**. The "+$N" win float renders its amount through CSS `content: attr(data-amount)` (`.win-float::after`), which Playwright's text engine does not read. The old "Current bet $N" pill was removed. Quick-bet presets show labels only ("½ Pot", "2x"), never amounts. |
| A second **button** whose name contains `Fold`, `Check`, `Call`, `Bet`, `Raise`, `all.in` while the dock is shown | `getByRole('button', { name: 'Fold' })` etc. | Pre-actions are `role="checkbox"`, not buttons. "Confirm Bet/Raise" exists only while the picker is open, when the main buttons are gone. |
| A visible button named `Fold` on a **waiting** player's screen | TC20 asserts `Fold` is not visible on the inactive page | The pre-action "Check/Fold" is a checkbox, so it does not match. |
| Any `role="img"` on the **lobby** besides the QR code | TC01 `getByRole('img')` must match exactly one element | All icons and avatars are `aria-hidden`. "Host" is a text pill, not a labelled icon. |
| An `aria-label` containing `Connected` besides the status dot | `getByLabel('Connected')` | The dot is the only element with that label. |

## 3. Attributes, roles and test IDs to keep

- **Role and name**
  - The Call button's name starts with `Call`. It uses `aria-label="Call {n} dollars"`.
  - The Raise button's name is exactly `Raise`. Bet is `Bet`, Fold is `Fold`, Check is `Check`.
  - The All-In button's name matches `/all.in/i`.
- **Slider.** `role="slider"` (Radix Thumb) with an accessible name ending in `amount` (`Bet amount` / `Raise to amount`). It must support Home, End, PageUp/PageDown and the arrow keys.
- **Seat move buttons.** `Move {name} up` / `Move {name} down`, shown only to the creator.
- **Exactly one `[aria-label="Dealer"]`** on the game page while no dialog is open (TC14 counts it). That is the puck on an opponent seat or the pill on the hero panel.
- **Dealer timing.** The hero pill must be visible to the dealer at hand 1. In heads-up the creator, Alice, deals first.
- **Connection dot.** `aria-label` is `Connected` or `Reconnecting`, and the element is visible (non-zero size).
- **Activity strip.**
  - The button has `data-testid="activity-strip"` and `aria-label="Activity history"`.
  - The inner `activity-strip-text` holds the formatted entry.
  - The strip renders `null` when there are no non-undone entries.
- **Activity modal.**
  - `data-testid="activity-history-modal"` is on the dialog content. Hands are `<h3>` reading `Hand N`, newest first.
  - Each entry element has `data-testid="activity-entry-{hand}-{idx}"` and holds the formatted text as its own direct text node.
  - Undone entries carry the classes `line-through` and `opacity-50` **on that same element**.
  - There is exactly one button whose name matches `/close/i`.
- **Test IDs that must exist:**
  - Game page and table: `game-page`, `pot-amount` (text exactly the formatted pot, e.g. `$40`), `phase-indicator` (sr-only, text exactly `PreFlop`/`Flop`/`Turn`/`River`/`Showdown`), `pot-breakdown`, `self-player-panel`, `opponent-panel-{playerId}`.
  - Bet picker: `bet-amount-input` / `raise-amount-input` (a display element, **not** an `<input>`), `amount-step-down`, `amount-step-up` (disabled at the bounds), `preset-half-pot`, `preset-three-quarter-pot`, `preset-pot`, `preset-all-in`, `confirm-bet`, `confirm-raise`.
  - Header and menu: `room-code-header`, `overflow-menu-btn`, `menu-request-undo`, `menu-seat-order`, `menu-restart-hand`.
  - Undo: `undo-pending`, `undo-cancel`, `undo-dialog`.
  - Dialogs: `rebuy-dialog`, `rebuy-confirm`, `rebuy-decline`, `seat-order-dialog`, `seat-order-save`, `restart-hand-confirm`, `pot-step-label`, `pot-winner-{id}`, `pot-split`.
  - Game-page notices: `buy-back-in-button`, `waiting-for-rebuy`, `waiting-for-players`, `seat-order-pending`, `pick-player`.
  - Lobby: `room-code-hero` (its text content includes the 6-char code), `lobby-player-{idx}`, `seat-order-hint`.
- **Labels.** Inputs are labelled exactly `Starting Stack`, `Small Blind`, `Big Blind`, `Room Code` and `Your Name`.

## 4. DOM-order and behaviour facts

- **Opponent order.** Opponent seat elements are rendered in **`opponentsInSeatOrder`** order (clockwise from the hero's left). TC62/TC63 read `opponent-panel-*` by index. Absolute positioning does not change DOM order.
- **Pick-player buttons.** Their accessible name is **exactly** the player name (TC65 `exact: true`), which is why `Avatar` is aria-hidden.
- **Overflow menu.** It toggles open and closed by clicking `overflow-menu-btn` again (TC63/TC64). **Do not add a full-screen backdrop**, because it would intercept that second click. Outside-click and Escape close it.
- **Bet picker presets** (TC18a, flop, pot 40, BB 20): ¾ pot gives `$30`, pot gives `$40`, All-In gives max, step-down gives `max − 20`, and step-up is disabled at max.
- **Picker preset filter.** A preset is shown only when `min ≤ value < max`. Pre-flop raises show `2x/3x/4x/Pot`; everything else shows `½ Pot/¾ Pot/Pot`. All-In is always shown.
- **Fold vs check.** `fold()` expects `Waiting for your turn...` right after clicking Fold, so Fold must never ask for confirmation.
- **Showdown confetti.** The 1.5 s delay before resolving a showdown winner stays.
- **New behaviour is opt-in.** Pre-actions default to off, and nothing auto-fires unless a player ticks a box. Hotkeys ignore events from inputs, sliders and open dialogs.

## 5. Unit tests that pin behaviour

| Test file | Pins |
|---|---|
| `components/ActivityStrip.test.tsx` | strip text, `null` when empty, aria-label (unchanged file) |
| `components/ActivityHistoryModal.test.tsx` | h3 grouping, newest first, `line-through opacity-50`, close button, fetch URL (unchanged file) |
| `lib/tableLayout.test.ts` (new) | hero at the bottom, clockwise seats, heads-up at the top, bet points nearer the centre |
| `lib/preActions.test.ts` (new) | Check/Fold, Check and Call Any resolution |
| `lib/standings.test.ts` (new) | ranking with shared ranks, seat index, share |
| `hooks/useTableEvents.test.tsx` (new) | first snapshot = history; bubbles appear and expire; win effects only for the hero; turn sound |
| `components/ActionBar.test.tsx` (new) | a queued Check/Fold folds when facing a bet; a pre-action expires when the street changes |
