# 01. Design System: "Retro Cartoon"

This is reference material. Every value here is already in the code of phases 1–5, so the implementing agent copies code and does not apply this by hand. Use it to review, and to extend the UI consistently later.

## 1. Principles

1. **Glanceable first.** People look at their phone between dealing real cards. Pot, stacks, whose turn it is and the amount to call must read in under a second, at arm's length.
2. **Cartoon outside, clarity inside.** Thick outlines, bold fills and bouncy motion frame the information, but numbers and labels stay plain, high-contrast and untextured.
3. **Thumbs own the bottom third.** Every action lives in the bottom dock.
4. **Juice never blocks.** Animations are decorative overlays (`pointer-events-none`). Input is never delayed, and everything collapses under reduced motion.
5. **One device per player, one room.** Feedback that every phone would play at once (action sounds) is limited to the acting player's device.

## 2. Colour tokens (`@theme` in `src/index.css`)

| Token | Hex | Tailwind | Role |
|---|---|---|---|
| ink | `#1B1718` | `bg-ink` `text-ink` `border-ink` | Outlines, text, header, hard shadows |
| ink-soft | `#4A4044` | `text-ink-soft` | Secondary text |
| paper | `#F7EBCF` | `bg-paper` `text-paper` | Page background (with halftone), text on dark fills |
| paper-deep | `#E8D5A9` | `bg-paper-deep` | Action dock, bottom bars |
| card | `#FFF8E8` | `bg-card` | Panels, plates, neutral buttons |
| felt / felt-dark / felt-light | `#1A6B4C` / `#0E4A37` / `#23805C` | `bg-felt*` | Table surface (radial spotlight) |
| rail | `#7A3B22` | (CSS `.table-rail`) | Wooden table edge |
| tomato | `#EF5B3F` | `bg-tomato` | **Fold**, alerts |
| tomato-deep | `#C92F1F` | `bg-tomato-deep` `text-tomato-deep` | Error banners, "Folded" stamp |
| mustard | `#F2B632` | `bg-mustard` | **Bet / Raise**, primary highlight, turn ring, ticker, room code |
| teal | `#3BB8AE` | `bg-teal` | **Check**, create/join/confirm CTAs, live dot |
| royal | `#2F5DA8` | `bg-royal` | **Call**, links, focus ring |
| grape | `#5B3A8C` | `bg-grape` | **All-In**, "All In" tag |
| bubblegum | `#F28DB2` | `bg-bubblegum` | "You" tag, undo-pending banner |

Avatar fills, by seat index 0–8 (`getAvatarColor` in `lib/utils.ts`): `#EF5B3F #3BB8AE #F2B632 #F28DB2 #6EC1E4 #9BCB4A #F38B3C #B39DDB #F6B48F`.

### Verified contrast (WCAG 2.x formula)

| Pair | Ratio | Pair | Ratio |
|---|---|---|---|
| ink on paper | 15.00 | paper on royal (Call) | 5.45 |
| ink on card | 16.78 | paper on grape (All-In) | 7.30 |
| ink on paper-deep | 12.28 | paper on tomato-deep (errors) | 4.54 |
| ink-soft on card / paper / paper-deep | 9.41 / 8.42 / 6.89 | paper on felt / felt-dark | 5.46 / 8.64 |
| ink on tomato (Fold) | 5.28 | royal link on paper | 5.45 |
| ink on teal (Check) | 7.32 | tomato-deep on card | 5.08 |
| ink on mustard (Bet/Raise) | 9.74 | ink on each avatar fill | 5.28 – 10.02 |
| ink on bubblegum | 7.81 | mustard on ink (room code) | 9.74 |

**Never use** cream text on teal (2.5:1) or on tomato (3.4:1), or mustard on felt. White-on-colour is not used anywhere.

## 3. Typography

Loaded in `index.html`: `Bangers`, `Fredoka:wght@400;500;600;700`, `Lilita One`, with `display=swap`.

| Token / class | Family | Use |
|---|---|---|
| `font-display` | Lilita One | Headings, buttons, seat names, every money amount (`tabular-nums`) |
| `font-sans` (default) | Fredoka | Body copy, labels, helper text, menu items |
| `font-comic` | Bangers | Only 1–3-word shouts: speech bubbles, splashes, win floats, "Winner!" |

Rules:
- The minimum rendered size is 10 px, and only for uppercase micro-labels (`POT`, `YOU`, `HOST`). Body copy is ≥ 13 px.
- Inputs use ≥ 16 px so iOS does not zoom on focus.
- Outlined display text uses the `.text-outline` class (2 px ink stroke, `paint-order: stroke fill`) plus a hard ink `drop-shadow`. WCAG measures outlined text against its outline.

## 4. Shape, borders and elevation

| Element | Border | Radius | Shadow |
|---|---|---|---|
| Panels (`.retro-panel`) | 3 px ink | 20 px | `shadow-hard-lg` = `6px 6px 0 ink` |
| Buttons (`.retro-btn`, `RetroButton`) | 3 px ink | 14 px | `shadow-hard` = `4px 4px 0 ink`; pressed: `translate(3px,3px)` + `1px 1px 0` |
| Plates, pills, tags | 2–3 px ink | full | `shadow-hard-sm` = `2px 2px 0 ink` |
| Inputs (`.retro-input`) | 3 px ink, royal on focus | 14 px | inset `3px 3px 0 ink/12%` |
| Table | 10 px rail + ink lines inside and out | 50% ellipse | `6px 8px 0 3px ink` |

Shadows always have zero blur, which is the neo-brutalist cartoon signature and is cheap to render on mobile.

## 5. Texture and illustration

| Name | Where | Implementation |
|---|---|---|
| Halftone paper | `body` | `radial-gradient(circle, ink/7% 1px, transparent 1.6px)` at 14 px |
| Felt | table | felt-light spotlight ellipse plus 10 px dark halftone |
| Sunburst | logo badge | `repeating-conic-gradient` mustard/#F8CF66, 12° rays, slow 18 s spin |
| Card back | dealt board cards | tomato-deep with cream 45°/−45° hatching |
| Chip mascot | logo, header, favicon, loading | SVG chip with face (`ChipLogoMark`, `public/favicon.svg`) |
| Chip stacks | presets, bets, pot, flights | `ChipStack` SVG, 1–5 chips (`chipCountForAmount`), dashed cream edge ring |

## 6. Motion

Easing tokens: `--ease-pop: cubic-bezier(0.34, 1.56, 0.64, 1)` (overshoot) and `--ease-anticipate: cubic-bezier(0.36, 0, 0.66, -0.56)`.

| Class | Duration | Used for | Under reduced motion |
|---|---|---|---|
| `animate-pop-in` | 320 ms pop | Dialogs, menus, "Your Turn" ribbon, bet chips | instant |
| `animate-turn-pulse` + `.turn-ring` | 1.2 s loop | Acting seat ring | static ring (`.turn-ring`) |
| `animate-winner-glow` + `.winner-ring` | 0.9 s loop | Winner seat, chosen showdown winner | static ring |
| `animate-bob` | 0.9 s loop | "…" thinking badge | still |
| `animate-bubble` | 1.6 s | Action speech bubbles | `keep-visible-reduced`: shown statically, removed by JS after 1.6 s |
| `animate-float-up` | 2.2 s | "+$N" win float | `keep-visible-reduced` |
| `animate-splash` | 1.4 s | Street splash | `keep-visible-reduced` |
| `animate-deal-in` | 320 ms, 60 ms stagger | Board cards | instant |
| `animate-chip-flight` | 520 ms | Bets to pot, pot to winner | instant (ends at once) |
| `animate-countdown` | 15 s linear | Undo auto-decline fuse | `keep-visible-reduced` (bar stays full) |
| `animate-slide-*`, `animate-shake`, `animate-fold-flip`, `animate-ellipsis` | existing | banners, errors, fold, waiting dots | instant |

Reduced motion is triggered by the OS `prefers-reduced-motion` **or** the in-app toggle (`html[data-reduce-motion="true"]`, set by `AppShell`). JS-driven motion also checks `prefersReducedMotion()`: number tweens (`useAnimatedNumber`) and confetti. Nothing flashes more than 3 times per second.

## 7. Accessibility rules (enforced by the code)

- Every decorative SVG or icon has `aria-hidden="true"`. `Avatar` is always aria-hidden, so button names stay exactly the player name.
- Status is never colour-only: Folded, All In, Deciding, Eliminated, Dealer, You and Host all carry text.
- Touch targets are ≥ 44 px (action buttons 64 px tall; pre-action and stepper buttons ≥ 40–44 px).
- The focus ring is a 3 px royal outline with a 3 px offset (mustard on the dark header).
- `viewport` allows pinch-zoom (the old `user-scalable=no` is removed). `touch-action: manipulation` still prevents double-tap zoom on controls.
- A live region announces turn changes ("Your turn" / "Bob's turn"), street changes and pot winners.
- The menu uses `role="menu"`, `menuitem` and `menuitemcheckbox` (with `aria-checked`). It closes on Escape and on outside click.

## 8. Layout geometry

**Game page (portrait):** header 52 px → ticker 34 px → **table stage (flex-1)** → notices → hero panel → action dock (+ safe-area).

**`landscape-short` variant** (`orientation: landscape` and `max-height: 500px`): the table stage on the left, and a 340 px right column holding notices, hero and dock.

**Desktop:** the stage is capped at 880 px wide and the dock at `max-w-2xl`, both centred.

**Table stage** (`PokerTable`, all positions in % of the stage):
- The felt ellipse is inset 9% horizontally and 7% vertically.
- Opponent seats sit on an ellipse with rx 38 and ry 40.
- Bet chips sit on an inner ellipse with rx 21 and ry 22.
- Seat `i` of `N` total seats (hero = 0 at the bottom) is at angle `90° + i·360°/N`, increasing clockwise on screen. The opponent order is `opponentsInSeatOrder` (the player to the hero's left comes first).
- The centre cluster (board + pot) is at (50%, 53%).
- `POT_POINT` = (50, 60). The hero's chips fly to (50, 100), the hero panel below.
- The stage is a CSS size container. When it is under 440 px tall, every `.table-piece` (seats, chips, centre cluster) scales to 0.82.
- Seats use the `lg` avatar for up to 4 opponents and `md` for 5 or more.

**z-index:** felt 0 → centre cluster and bet chips 10 → seats 20 → flights and splash 30 → bubbles and win floats 40 → menu, banners and dialogs 50.

## 9. Voice and microcopy

The copy is short, upbeat and cartoon-shouty, but only where it is decorative. Examples: "Pick your stakes", "At the table", "Scan to join", "Raise!", "Flop! Deal 3 cards", "Hand #4", "Winner!".

Strings that the tests read are frozen; see [02-test-contract.md](./02-test-contract.md).
