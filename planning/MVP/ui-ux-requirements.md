# UI/UX Upgrade Requirements — Chip Tracker

**Author:** Senior UI/UX Designer  
**Date:** 2025-07-25  
**Status:** Draft  
**Scope:** Full redesign of all 4 pages + 5 components. Mobile-first. Modern visual language.

---

## 1. Executive Summary

Chip Tracker's current UI is functional but visually dated, difficult to use on mobile, and lacks the polish expected for a game played primarily on phones. This document specifies UI/UX upgrades to deliver a **modern, mobile-first, game-quality interface** while preserving all existing functionality.

### Current State Assessment

| Area | Issue | Severity |
|------|-------|----------|
| **Visual design** | Flat green gradient + white cards. Generic form styling. No brand identity. Looks like a dev prototype, not a consumer app. | High |
| **Mobile usability** | No responsive breakpoints used anywhere. Action buttons cramp on small screens. Number inputs are tiny tap targets. Game page uses `max-w-6xl` (desktop-first layout). | Critical |
| **Information hierarchy** | Player panels show all info at equal weight. Pot display is small relative to importance. Phase indicator is buried in text. | High |
| **Action bar** | 3-column grid doesn't adapt. Bet/raise inputs require precision typing on mobile. No slider. Duplicate "Confirm Bet/Raise" buttons alongside grid buttons. Confusing dual-path UX. | Critical |
| **Feedback & affordances** | Active turn indicated only by yellow border + emoji (🟡). No haptic cue, no animation beyond `animate-pulse`. Undo request has no visual weight. | Medium |
| **Consistency** | Each page independently defines its own layout. No shared shell, spacing system, or component patterns. | Medium |
| **Accessibility** | No focus management. No ARIA labels. Color-only status indicators (red for folded, orange for all-in). Low contrast in some areas. | Medium |
| **Dark mode** | CSS variables defined but unused. Game page has dark background while other pages use white cards — inconsistent visual mode. | Low |

---

## 2. Design Principles

1. **Mobile-first** — Primary use case is 2–9 friends around a table, each on their phone. Every design decision starts at 375px width.
2. **Glanceable** — Players glance at their phones between dealing physical cards. Critical info (stack, pot, whose turn) must be readable in <1 second.
3. **Thumb-friendly** — All interactive elements sized ≥44×44px (Apple HIG minimum). Action buttons in the bottom third of the screen (thumb zone).
4. **Game-feel** — The UI should feel like a game interface, not a business app. Rich colors, confident typography, subtle motion.
5. **Progressive disclosure** — Show only what's needed for the current moment. Collapse secondary info.

---

## 3. Design System Foundation

### 3.1 Color Palette

Move from the flat green gradient to a richer, darker, poker-table-inspired palette with high-contrast accents.

| Token | Current | Proposed | Usage |
|-------|---------|----------|-------|
| `--surface-bg` | `green-900 to green-700` gradient | `#0F1923` (deep navy-black) | Page background |
| `--surface-card` | `white` / `green-800` | `#1A2B3C` (dark slate) | Card surfaces, panels |
| `--surface-elevated` | — | `#243447` (lighter slate) | Elevated cards, modals |
| `--felt` | — | `#1B5E3B` (poker-table green) | Pot display, table area accent |
| `--accent-primary` | `green-600` | `#22C55E` (bright green) | Primary CTAs, check action |
| `--accent-danger` | `red-500` | `#EF4444` | Fold action, errors |
| `--accent-warning` | `yellow-600` | `#F59E0B` | All-in, undo, dealer badge |
| `--accent-info` | `blue-500` | `#3B82F6` | Call action, links |
| `--accent-bet` | `orange-500` | `#F97316` | Bet action |
| `--accent-raise` | `purple-500` | `#A855F7` | Raise action |
| `--text-primary` | varies | `#F1F5F9` (off-white) | Primary text on dark bg |
| `--text-secondary` | varies | `#94A3B8` (muted gray) | Secondary text, labels |
| `--text-on-light` | varies | `#1E293B` (dark slate) | Text on light surfaces (modals) |
| `--gold` | — | `#FFD700` | Active turn indicator, highlights |

### 3.2 Typography

| Element | Current | Proposed |
|---------|---------|----------|
| Font family | System default | `Inter` (body) + `JetBrains Mono` (numbers/codes) |
| Pot amount | `text-4xl` (36px) | `text-6xl` on mobile, `text-7xl` on desktop. Tabular nums. |
| Stack amount | `text-sm` body text | `text-2xl font-bold` with monospace for numeric alignment |
| Phase label | Inline text `"Phase: Flop"` | Standalone pill badge, uppercase, tracking-wide |
| Room code | `text-4xl font-mono` | Keep monospace, add letter-spacing, subtle background pill |

### 3.3 Spacing & Layout

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | 4px | Tight gaps, icon padding |
| `--space-sm` | 8px | Intra-component spacing |
| `--space-md` | 16px | Component padding, gaps |
| `--space-lg` | 24px | Section spacing |
| `--space-xl` | 32px | Page margins on desktop |
| `--radius-sm` | 8px | Inputs, small buttons |
| `--radius-md` | 12px | Cards, panels |
| `--radius-lg` | 16px | Modals, action bar |
| `--radius-full` | 9999px | Pills, badges, avatars |

### 3.4 Component Library

Adopt **Shadcn/UI** (already specified in the original plan but never implemented). This provides accessible, themeable primitives (Button, Input, Dialog, Slider, Badge) without a heavy runtime.

---

## 4. Page-by-Page Requirements

### 4.1 Create Room Page (`/`)

**Current problems:**
- White card on green looks like a generic web form
- No visual brand identity
- Number inputs offer no guidance on sensible values
- No way to navigate to "Join Game" from this page
- No preset options for common configurations

**Requirements:**

| ID | Requirement | Priority |
|----|-------------|----------|
| CR-1 | Dark background with centered card. Card uses `--surface-card` with subtle border glow. | P0 |
| CR-2 | App logo/icon at top — poker chip icon or stylized "CT" mark. Replace plain text "Chip Tracker" with branded mark + wordmark. | P1 |
| CR-3 | **Quick-start presets** — 3 tappable preset cards above the custom form: "Casual" (1000/5/10), "Standard" (1000/10/20), "Deep Stack" (5000/25/50). Tapping a preset fills the form AND highlights the selected preset. | P1 |
| CR-4 | Custom form collapsible below presets, labeled "Custom Setup". Open by default if no preset is selected. | P2 |
| CR-5 | Number inputs: use stepper controls (+/- buttons flanking the value) instead of raw `<input type="number">`. Minimum tap target 44×44px per button. | P0 |
| CR-6 | Big Blind auto-calculates to 2× Small Blind on SB change (user can override). Visual link between the two fields. | P1 |
| CR-7 | "Create Game" button: full-width, prominent, `--accent-primary` color, min height 52px. Loading state shows spinner, not text change. | P0 |
| CR-8 | Navigation link below button: "Have a room code? **Join a game**" linking to `/join`. | P0 |
| CR-9 | Subtle validation: red ring on invalid inputs (stack < big blind, SB ≥ BB, etc.) with inline error messages. | P1 |

**Mobile layout (≤640px):**
- Presets stack vertically as full-width cards
- Form uses full viewport width minus 16px padding

**Desktop layout (>640px):**
- Max-width 440px centered
- Presets as 3 side-by-side cards

### 4.2 Lobby Page (`/room/:roomCode/lobby`)

**Current problems:**
- QR code is small (160px) — hard to scan from across a table
- Room code text is decorative but not the most prominent element
- Player list is plain — no avatars, no visual distinction
- "Start Game" button doesn't stand out enough
- No indication of game settings (what blinds are set?)

**Requirements:**

| ID | Requirement | Priority |
|----|-------------|----------|
| LB-1 | **Room code hero** — Large room code at top in monospace, each character in its own rounded box (like a PIN input). Copy-on-tap with brief toast "Copied!". | P0 |
| LB-2 | QR code sized 200px on mobile, 240px on desktop. Centered with subtle rounded border. Below it, a share button that triggers native Web Share API (falls back to copy link). | P0 |
| LB-3 | **Game settings summary** — Compact row showing "Stack: 1,000 · Blinds: 10/20" below the room code. Read-only. | P1 |
| LB-4 | **Player list redesign** — Each player gets a colored circle avatar (initial letter, rotating color palette) + name. Creator gets a crown/host badge. Current user gets "(You)" badge. Animate new player entry (slide-in). | P1 |
| LB-5 | Player count indicator: "2 of 9 players" as a progress-bar-style element. | P2 |
| LB-6 | Join form: name input + join button inline on one row. Input gets autofocus. | P0 |
| LB-7 | "Start Game" button: extra large (56px height), `--accent-warning` yellow, sticky to bottom of viewport on mobile so it's always reachable. Disabled state clearly grayed with tooltip reason. | P0 |
| LB-8 | Pulse animation on waiting state: "Waiting for players..." with animated dots. | P2 |

### 4.3 Game Page (`/room/:roomCode` — THE critical screen)

**Current problems:**
- Desktop-first `max-w-6xl` layout wastes mobile viewport
- Player panels are small, information-dense boxes with no visual hierarchy
- Pot display is modest for the single most important number on screen
- Action bar is a 3-column grid with redundant buttons and small inputs
- Whose turn it is communicated only by yellow border + pulsing emoji
- Undo button at bottom is awkwardly placed and easy to accidentally tap
- No landscape mode consideration
- Number input for bet/raise is a raw text field — terrible on mobile

**Requirements:**

#### 4.3.1 Overall Layout

| ID | Requirement | Priority |
|----|-------------|----------|
| GP-1 | **Mobile-first vertical stack**: Opponents area (top) → Pot/phase (center) → Your info (bottom) → Action bar (bottom-fixed). Full viewport height, no scrolling during normal play. | P0 |
| GP-2 | **Sticky action bar** — Fixed to bottom of viewport. Always visible without scrolling. Safe-area-inset padding for notch/gesture-bar phones. | P0 |
| GP-3 | Header: minimal — room code (small, tappable to copy) + connection dot (green/yellow/red) + overflow menu (⋯). No large "Chip Tracker" text. | P0 |
| GP-4 | Landscape support: on screens wider than tall, switch to horizontal layout — opponents left, pot center, your panel + actions right. | P2 |

#### 4.3.2 Opponent Display (Top)

| ID | Requirement | Priority |
|----|-------------|----------|
| GP-5 | **Compact opponent cards** — Horizontal scrollable strip if >3 opponents. Each card: avatar circle (letter initial) + name + stack. | P0 |
| GP-6 | Active opponent: gold ring around avatar, subtle glow animation. | P0 |
| GP-7 | Folded opponent: card faded to 40% opacity, "FOLDED" overlay text. | P1 |
| GP-8 | All-in opponent: red pulsing border + "ALL IN" badge. | P1 |
| GP-9 | Opponent's current bet shown as chip-count badge below their card. Only shown when >0. | P1 |

#### 4.3.3 Pot & Phase Display (Center)

| ID | Requirement | Priority |
|----|-------------|----------|
| GP-10 | **Pot as hero number** — `text-5xl` or larger, monospace, centered. Animated count-up on pot change (lerp animation). | P0 |
| GP-11 | Phase indicator: horizontal stepper/progress bar showing all 5 phases (PreFlop → Flop → Turn → River → Showdown). Current phase highlighted, completed phases dimmed. Always visible. | P0 |
| GP-12 | Current bet to call: shown prominently when >0. "Bet to call: $40". Disappears when 0. | P1 |
| GP-13 | Pot area uses `--felt` green color to evoke poker table. Subtle radial gradient or texture. | P1 |

#### 4.3.4 Your Player Info (Bottom, above action bar)

| ID | Requirement | Priority |
|----|-------------|----------|
| GP-14 | **Your stack displayed large** — `text-3xl` monospace, always visible. This is the player's "bank balance" — treat it as premium real estate. | P0 |
| GP-15 | Your current bet shown next to stack when >0: "Your bet: $20". | P1 |
| GP-16 | Dealer chip: visual chip icon (🔴 or custom SVG) next to your name when you're dealer. | P1 |
| GP-17 | Active turn: your panel gets a gold top border + brief flash animation on turn start. | P0 |

#### 4.3.5 Action Bar (Bottom-fixed)

This is the most critical interaction surface. Current design is significantly flawed for mobile.

| ID | Requirement | Priority |
|----|-------------|----------|
| GP-18 | **Two-row action layout:** Row 1 (full-width buttons): Fold, Check/Call. Row 2 (full-width): Bet/Raise (opens amount picker), All-In. Buttons sized min 48px tall, generous padding. | P0 |
| GP-19 | **Contextual buttons only** — Only show actions that are currently valid. If you can't check, don't show Check. If you can't bet (must raise), don't show Bet. Eliminate decision paralysis. Max 3-4 buttons visible at once. | P0 |
| GP-20 | **Amount picker redesign** — When Bet or Raise is tapped, slide up an amount-picker panel replacing the action buttons. Contains: a slider (full width, thumb ≥32px), preset chips (1/2 Pot, 3/4 Pot, Pot, All-In), and a numeric display showing selected amount. Confirm button at bottom. Back/cancel to return to action buttons. | P0 |
| GP-21 | Slider haptic feedback (where supported via Vibration API). Snap to common amounts (pot fractions, round numbers). | P2 |
| GP-22 | "Waiting for your turn" state: action bar shows muted text + subtle animation. No buttons. Optional: show what actions other player can take (preview). | P1 |
| GP-23 | Call button shows amount: "Call $20" not just "Call". | P0 |
| GP-24 | All-In button shows your remaining stack: "All-In $480". | P1 |
| GP-25 | Action confirmation: brief color flash on the entire action bar after submitting (green for check/call, red for fold). Prevents accidental double-tap. Disable buttons for 500ms after action. | P1 |

#### 4.3.6 Undo Flow

| ID | Requirement | Priority |
|----|-------------|----------|
| GP-26 | Move undo trigger into the overflow menu (⋯) in the header. Not a persistent visible button. Reduces accidental taps and visual clutter. | P0 |
| GP-27 | Undo request: show a toast/banner at the top: "You requested undo. Waiting for approval..." with a cancel option. Not a modal. | P1 |
| GP-28 | Incoming undo request: slide-down banner (not a blocking modal) with player name + Approve / Decline buttons. Auto-dismiss after 15 seconds (decline). | P1 |

### 4.4 Join Room Page (`/join`)

**Current problems:**
- Two-step flow (enter code → look up → enter name → join) adds friction
- No visual connection to the game theme
- Rejoin flow (when game already started) is discoverable only if you know to re-enter the code

**Requirements:**

| ID | Requirement | Priority |
|----|-------------|----------|
| JR-1 | Same dark theme as Create page. Consistent brand. | P0 |
| JR-2 | Room code input: large, centered, 6-character auto-uppercase input with auto-submit on 6th character (no separate "Look Up" button). Character-by-character boxes like a PIN entry. | P1 |
| JR-3 | When room is found: smooth transition — code input shrinks up, name input + join button slide in below. No full page re-render. | P2 |
| JR-4 | Rejoin: when game is started, show player avatars (matching lobby avatars) instead of plain text buttons. | P1 |
| JR-5 | Link at bottom: "No code? **Create a new game**" linking to `/`. | P0 |

### 4.5 Showdown Dialog

**Current problems:**
- Plain white modal with generic buttons
- No visual drama for the climax of a hand
- "Split Pot" button is visually deprioritized (gray)

**Requirements:**

| ID | Requirement | Priority |
|----|-------------|----------|
| SD-1 | Dark overlay with blur (`backdrop-blur-sm`). Modal uses `--surface-elevated`. | P0 |
| SD-2 | Title: "SHOWDOWN" in large, bold, uppercase, gold text. Subtitle: "Who won?" | P0 |
| SD-3 | Player buttons: each shows avatar + name + stack. Winner button is tall (56px), visually distinct per player (different accent colors or bordered). | P1 |
| SD-4 | "Split Pot" as a secondary outlined button below winner buttons, not gray-filled. Equal visual weight. | P1 |
| SD-5 | After winner selected: brief confetti or celebration animation on the winner's name before dialog closes. | P2 |
| SD-6 | Pot amount displayed in the dialog so players know what's at stake. | P0 |

---

## 5. Animations & Micro-interactions

| ID | Animation | Trigger | Duration | Priority |
|----|-----------|---------|----------|----------|
| AN-1 | Pot count-up | Pot value changes | 400ms ease-out | P1 |
| AN-2 | Stack count-down | Player stack changes | 400ms ease-out | P1 |
| AN-3 | Turn indicator glow | Turn changes | 600ms pulse, then steady | P0 |
| AN-4 | Action bar slide-up | Amount picker opens | 200ms ease-in-out | P1 |
| AN-5 | New player slide-in | Player joins lobby | 300ms slide-from-right | P2 |
| AN-6 | Phase step highlight | Phase advances | 300ms scale + color change | P1 |
| AN-7 | Button press feedback | Any action button tap | 100ms scale(0.95) | P0 |
| AN-8 | Error shake | Invalid action attempted | 300ms horizontal shake | P2 |
| AN-9 | Fold card flip | Player folds | 400ms Y-axis rotation + fade | P2 |

---

## 6. Mobile-Specific Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| MB-1 | `<meta name="apple-mobile-web-app-capable">` + `theme-color` meta tag matching `--surface-bg`. | P0 |
| MB-2 | Safe area insets: `env(safe-area-inset-bottom)` padding on action bar for phones with gesture bars (iPhone X+, modern Androids). | P0 |
| MB-3 | Prevent pull-to-refresh during gameplay (CSS `overscroll-behavior: none`). | P0 |
| MB-4 | Prevent pinch-to-zoom during gameplay (`user-scalable=no` or `touch-action: manipulation`). | P1 |
| MB-5 | Keep screen awake during active game (Screen Wake Lock API where supported). | P1 |
| MB-6 | Number inputs: use `inputmode="numeric"` to show numeric keyboard on mobile instead of full keyboard. | P0 |
| MB-7 | Prevent double-tap zoom on action buttons (`touch-action: manipulation` on interactive elements). | P0 |
| MB-8 | Viewport height: use `dvh` (dynamic viewport height) instead of `vh` to handle mobile browser chrome. | P1 |

---

## 7. Accessibility Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| A11Y-1 | All interactive elements have visible focus rings (`:focus-visible` outline). | P0 |
| A11Y-2 | Color is never the sole indicator of state — combine with icons, text, or patterns. Folded: red text + strikethrough icon. All-in: badge text, not just orange color. | P1 |
| A11Y-3 | Action buttons have `aria-label` including amount context: `aria-label="Call twenty dollars"`. | P1 |
| A11Y-4 | Dialogs trap focus when open. ESC closes. Background is `aria-hidden`. | P0 |
| A11Y-5 | Minimum contrast ratio 4.5:1 for all text. 3:1 for large text. Test against proposed color palette. | P0 |
| A11Y-6 | Announce turn changes and game events via `aria-live` region. | P2 |

---

## 8. Responsive Breakpoints

Define and use consistently across all pages:

| Breakpoint | Width | Layout adaptation |
|------------|-------|-------------------|
| `xs` | <480px | Single column. Compact spacing. Stacked elements. |
| `sm` | 480–640px | Slightly more breathing room. Still single column. |
| `md` | 640–1024px | Two-column where applicable. Larger tap targets. |
| `lg` | >1024px | Multi-column game layout. Desktop player arrangement. |

---

## 9. Technical Implementation Notes

1. **Adopt Shadcn/UI** — Install and configure. Migrate buttons, inputs, dialogs, sliders to Shadcn primitives. This provides accessibility, keyboard navigation, and theming out of the box.
2. **CSS custom properties** — Define color tokens in `index.css` `:root`. Reference via Tailwind `theme.extend.colors` for utility class usage.
3. **Framer Motion** — Add for declarative animations (pot count-up, player transitions, dialog enter/exit). Lightweight alternative: CSS `@keyframes` + Tailwind `animate-*` utilities for simple cases.
4. **Clean up dead CSS** — Remove unused Vite template styles from `index.css` and `App.css`.
5. **Shared layout component** — Create `<AppShell>` wrapper with consistent background + safe-area padding. All pages render inside it.
6. **Number formatting** — Use `Intl.NumberFormat` for stack/pot display (commas, locale-aware).

---

## 10. Implementation Priority

### Phase 1 — Mobile Playability (all P0 items)
Fix the game page for mobile. Sticky action bar, contextual buttons, amount slider, proper sizing, safe areas, dark theme.

### Phase 2 — Visual Polish (P1 items)
Color palette, typography, animations, player avatars, phase stepper, number animations, consistent theming across all pages.

### Phase 3 — Delight (P2 items)
Haptics, confetti, landscape mode, advanced animations, presets.

---

## 11. Success Criteria

| Metric | Target |
|--------|--------|
| Mobile Lighthouse Performance | ≥90 |
| Largest Contentful Paint (mobile) | <2s |
| All tap targets ≥44×44px | 100% compliance |
| WCAG 2.1 AA contrast | 100% compliance |
| Game page requires zero scrolling on iPhone SE (375×667) | True |
| Time from app open to first action in game | <60s (including join flow) |
