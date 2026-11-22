# 00. Research: What the Best Poker and Card-Game UIs Do

This is a summary of a research pass over leading poker and card-game clients, plus guidance on the retro-cartoon art direction. Each claim is tagged by evidence:

- **[V]** means the source was fetched and read.
- **[K]** means well-known product behaviour that could not be re-fetched (PokerStars, GGPoker and Lichess pages were geo-blocked or bot-walled).

Sources are listed at the end.

## 1. Per-app highlights

### Poker Now (browser home games): the closest analogue to Deal Me In
- **Zero-friction join [V].** The host shares a link; guests pick a nickname and play in the browser. There is no signup or install, it works on phone, tablet and desktop, and it supports up to 10 players.
- **Host-controlled pacing [V].** Time limits are optional ("or no limit at all").
- **Session Ledger [V].** Shows Player, Buy-In, Buy-Out, Stack and Net, with table totals as a balance check and CSV export. On small screens it collapses to a "Log" button.
- **Visible state changes [V].** Spectator mode turns the felt red.
- **Identity continuity [V].** A "Still seated / Back to the table" shortcut, and play across multiple devices.

### PokerStars [K]
- Fast-fold puts Fold in the most reachable spot.
- **Pre-action checkboxes:** Check/Fold, Fold to any bet, Call any. They clear when the action changes.
- Bet sizing combines a slider, presets (min, ½, ¾, pot, all-in), ± steppers and typed entry.
- Consistent hero-at-bottom portrait layout on mobile.

### GGPoker / ClubGG [K / V-store]
- Hero at bottom centre; opponents as compact seat chips (avatar, name, stack).
- Action buttons sit in one thumb-reachable row, with quick-bet sizing.
- Playful emotes and reactions give the table personality.
- Post-session review is treated as a product (PokerCraft).

### Zynga Poker / WSOP [V-store / K]
- Bright cartoon avatars, big colourful buttons, chip-fly animations, emotes.
- 5-max and 9-max tables.
- A mascot guide drives onboarding (WSOP's "Agent Mary").

### Balatro [V]
- **Settings for comfort:** Game Speed, Screenshake 0–100%, High-Contrast cards, and a full Reduced Motion mode that disables idle, triggered and background animation.
- **Juice [K]:** escalating pitch, bump animations on number tick-ups, idle wobble. The CRT/retro look is optional.

### Hearthstone [K]
- The board feels like a toy.
- The End Turn button glows as a "next action" nudge.
- A burning fuse shows urgency without text.
- Preset emote wheel instead of free chat.

### Lichess-style minimal [K]
- The board is the page, with almost no chrome.
- Keyboard shortcuts and premoves (the analogue of poker pre-actions).
- Selectable themes and sound sets.

### Pokerrrr 2 [V-store]
- Commits to its theme in **microcopy** as well as visuals ("Agents", "Missions", "Crew").

## 2. Synthesized top qualities, and where this plan implements them

| # | Quality (from) | Implemented in | Notes |
|---|---|---|---|
| T1 | Oval felt, hero bottom-centre, opponents around the rail (all major clients) | Phase 3 `PokerTable`, `Seat`, `HeroPanel`, `lib/tableLayout.ts` | Clockwise from the hero's left, matching `opponentsInSeatOrder`. Fits 2–9 players in portrait, landscape and desktop. |
| T2 | Compact seat: avatar, name, stack, status badge, dealer button (GG, PS) | Phase 3 `Seat`, phase 1 `Avatar`/`DealerChip`/`StatusTag` | Avatar shrinks for 5+ opponents. |
| T3 | Per-seat bet chips in front of players; gather to pot; pot slides to winner (GG, PS, Zynga) | Phase 3 `BetChip`, `ChipFlight`, `PokerTable` payouts | Pure CSS keyframes driven by CSS variables. |
| T4 | Pot total centre-table with chip graphic; side pots listed (all) | Phase 3 `CenterPot` | |
| T5 | Community cards centre (all) | Phase 3 `BoardCards` | Cards are physical, so the board shows how many cards should be dealt (0/3/4/5) and the street name. |
| T6 | Unmistakable "whose turn": ring plus colour, sound, haptic (GG, Hearthstone glow) | Phase 3 `Seat`/`HeroPanel` turn ring, "…" thinking badge; `useTableEvents` turn sound/vibration; `useTurnTitle` tab title | No timer ring: there is no server clock (see README §6). |
| T7 | Primary actions in one bottom thumb row, colour + label, amounts on buttons (GG, PS) | Phase 4 `ActionBar` | Fold / Check-or-Call $X / Bet-or-Raise / All-In $X. |
| T8 | Fold safety when check is free (PS option) | Phase 4: Fold becomes the neutral cream style when `canCheck` | A confirm dialog was rejected for e2e compatibility. |
| T9 | Bet sizing: slider + presets + ± steppers (PS, GG) | Phase 4 `AmountPicker` | Pre-flop raise: 2x/3x/4x/Pot. Post-flop: ½/¾/Pot. Always All-In. Snap points plus haptic ticks. |
| T10 | Pre-action checkboxes (PS; Lichess premoves) | Phase 4 `ActionBar`, `lib/preActions.ts` | Check/Fold, Check, Call Any. Scoped to the hand and street they were set on. |
| T11 | Desktop hotkeys (Lichess, Poker Now) | Phase 4 `ActionBar` | F, C, B/R, Esc. Key hints show only on fine pointers. |
| T12 | Feedback juice: action call-outs, win highlight, deal animation, sounds (Zynga, Balatro, Juice-it-or-lose-it) | Phase 3 `ActionBubble`, `WinFloat`, `PhaseSplash`, `BoardCards` deal-in; phase 1 `lib/sound.ts` | Sounds are synthesized with Web Audio (no assets). Only *your* actions make action sounds, to avoid 9 phones clacking in one room. |
| T13 | Haptics with a toggle (research) | Phase 1 `lib/haptics.ts`, phase 3 header toggle | Progressive enhancement; iOS Safari has no Vibration API. |
| T14 | Comfort settings: sound, vibration, reduced motion in-app (Balatro) | Phase 1 `stores/settingsStore.ts`, `index.css` reduced-motion rules; phase 3 header menu | Also honours the OS `prefers-reduced-motion`. |
| T15 | Avatars with stable colours; "You" marker (Zynga, GG) | Phase 1 `Avatar`; phases 2–3 | Colour = seat index, consistent across lobby, table and dialogs. |
| T16 | Room link first: code + QR + share (Poker Now) | Phase 2 `LobbyPage` | Ticket-style code (tap to copy), polaroid QR, Web Share API. |
| T17 | Re-entry "take your seat back" (Poker Now) | Phase 2 `JoinRoomPage`, phase 3 pick-player notice | Existing behaviour, restyled. |
| T18 | Progressive onboarding with a mascot (WSOP) | Phase 1 `ChipLogo` mascot; phase 2 "How it works" strip and stake presets | No tour; three steps on the create page. |
| T19 | Mobile-first: thumb zone, safe areas, landscape alternative (research) | Phase 3 `GamePage` layout, `landscape-short` variant; phase 4 dock | `viewport-fit=cover` plus `env(safe-area-inset-*)`. |
| T20 | Log/history in a sheet, per-hand grouping (Poker Now, PokerCraft) | Phase 3 `ActivityStrip` ticker; phase 5 `ActivityHistoryModal` | |
| T21 | Settlement / standings summary (Poker Now ledger) | Phase 3 `StandingsDialog`, `lib/standings.ts` | Chip-count leaderboard. A net/buy-in ledger needs backend data (README §6). |
| T22 | Theme carried into microcopy (Pokerrrr 2) | Bubbles "Raise!", splashes "Flop! / Deal 3 cards", "Pick your stakes", "At the table", "Scan to join" | E2E-critical strings are unchanged (see 02). |
| T23 | Accessibility: contrast, reduced motion, colour-independence, live announcements (WCAG) | 01 §7; status tags always carry text; announcements in `GamePage` | |
| T24 | Keep the screen awake (research) | Existing `useWakeLock`, kept | |
| T25 | Visible connection state (Poker Now) | Phase 3 `GameHeader` live dot that becomes a "Reconnecting…" pill | |

## 3. Retro-cartoon art direction (summary; full spec in 01)

- **References.** 1930s rubber-hose (Fleischer, early Disney, *Cuphead*), mid-century flat print, and neo-brutalist cartoon UI (thick black outlines, zero-blur offset shadows, flat fills).
- **Palette.** Contrast-checked warm ink `#1B1718` on cream paper `#F7EBCF` (15:1), with tomato, mustard, teal, royal, grape and bubblegum accents. Never use cream text on teal or tomato, or mustard on felt.
- **Type.** *Lilita One* for display and numbers, *Fredoka* for UI and body, *Bangers* only for 1–3-word shouts. All are Google Fonts with OFL licences.
- **Shape.** 3 px ink outlines, 12–20 px radii, hard shadows of 2/4/6 px. Buttons sink into their shadow when pressed.
- **Texture.** Halftone dots on paper and felt, sunburst behind the logo, cross-hatched red card backs.
- **Motion.** Overshoot "pop" `cubic-bezier(0.34, 1.56, 0.64, 1)`, squash on landing, 220–520 ms. Nothing blocks input, and everything collapses under reduced motion.
- **Pitfalls avoided.**
  - Display fonts are never used for long text.
  - No texture sits behind small text.
  - Nothing flashes more than 3 times per second.
  - No real-money framing: chips are just chips.

## 4. Sources

Fetched and verified:
- Poker Now: https://www.pokernow.com/
- Poker Now Session Ledger: https://www.pokernow.com/blog/session-ledger-buy-in-buy-out-summary
- Poker Now spectator mode: https://www.pokernow.com/blog/how-to-use-poker-now-spectator-mode
- Poker Now multi-device: https://www.pokernow.com/blog/play-poker-multiple-devices
- Balatro: https://en.wikipedia.org/wiki/Balatro
- Balatro settings: https://balatrowiki.org/w/Settings
- Cuphead: https://en.wikipedia.org/wiki/Cuphead
- Rubber hose animation: https://en.wikipedia.org/wiki/Rubber_hose_animation
- GGPoker: https://en.wikipedia.org/wiki/GGPoker
- App Store listings:
  - Zynga Poker: https://apps.apple.com/us/app/zynga-poker-texas-holdem/id354902315
  - WSOP: https://apps.apple.com/us/app/wsop-texas-holdem-poker-game/id719525810
  - ClubGG: https://apps.apple.com/us/app/clubgg-poker/id1529839330
  - Pokerrrr 2: https://apps.apple.com/us/app/pokerrrr-2-texas-holdem-poker/id592081067
- WCAG 2.2:
  - Contrast (minimum): https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
  - Non-text contrast: https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html
  - Three flashes: https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html
  - Animation from interactions: https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html
  - Target size: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- MDN:
  - prefers-reduced-motion: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion
  - Navigator.vibrate: https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate
- Easing functions: https://raw.githubusercontent.com/ai/easings.net/master/src/easings/easingsFunctions.ts
- Google Fonts metadata:
  - Lilita One: https://raw.githubusercontent.com/google/fonts/main/ofl/lilitaone/METADATA.pb
  - Fredoka: https://raw.githubusercontent.com/google/fonts/main/ofl/fredoka/METADATA.pb
  - Bangers: https://raw.githubusercontent.com/google/fonts/main/ofl/bangers/METADATA.pb

Not fetched: "Juice it or Lose it" (Jonasson & Purho), https://www.youtube.com/watch?v=Fy0aCDmgnxg
