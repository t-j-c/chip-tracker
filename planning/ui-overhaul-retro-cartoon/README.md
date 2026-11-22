# UI/UX Overhaul: "Retro Cartoon" Deal Me In

| | |
|---|---|
| **Status** | Ready to execute |
| **Date** | 2026-11-22 |
| **Scope** | `src/frontend` only, plus a one-line note in `planning/MVP/ui-ux-requirements.md`. No backend, API, data-model or e2e-test changes. |
| **Theme** | Retro cartoon: 1930s–60s rubber-hose / mid-century print look. Cream paper, thick ink outlines, hard offset shadows, flat bold colours, chunky display type, squash-and-stretch motion. |
| **Validated** | All code in this plan was built and tested in a throwaway worktree before it was written down. Results: `tsc -b` clean, `oxlint` clean, **83/83** unit tests, `vite build` OK, full Playwright e2e suite **65/65 passed, 0 flaky**. The plan documents were then replayed step by step onto a clean checkout. Every phase compiled and passed its tests with the stated counts, and the final tree was byte-identical to the validated code (93 files). |

## 1. What changes for players

| Area | Today | After this plan |
|---|---|---|
| **Table** | Opponents in a horizontal scroll strip; pot in a green box; phase as text pills | Oval felt table with opponents seated **clockwise** around the rail. Bet chips sit in front of each seat and fly to the pot when a street ends. Five community-card slots show how many real cards should be on the table. The pot sits in the centre. |
| **Your seat** | Plain card | Big glanceable "hero" panel docked above the controls. It pulses when it's your turn. |
| **Actions** | 2×2 grid | One thumb-zone row: **Fold · Check/Call $X · Bet/Raise · All-In $X**. Fold is softened when checking is free. Desktop gets F/C/B/R hotkeys. |
| **Bet sizing** | Slider and pot presets | Slider shaped like a chip, with ± steppers. Pre-flop raises get **2x/3x/4x** presets; post-flop bets get ½, ¾ and Pot. |
| **Waiting** | "Waiting for your turn..." | Same text, plus **pre-action checkboxes**: Check/Fold, Check, Call Any. They fire automatically when your turn comes. |
| **Feedback** | Number tween and confetti on the winner pick | Comic speech bubbles ("Raise!") on the acting seat, a "+$120" float on winners, chips flying pot-to-winner, and street splashes ("Flop! Deal 3 cards"). Synthesized sounds and haptics, confetti on your own win, and a tab-title "Your turn!" alert. |
| **Social / status** | — | Seat avatars with stable colours, "…" thinking badge, dealer puck, "You" tag, and Folded / All In / Deciding / Eliminated tags. |
| **Menu** | Undo, admin tools | + **Standings** leaderboard, **Activity Log**, **Sound / Vibration / Reduce Motion** toggles (saved per device), and a "Host tools" section. |
| **Entry flow** | Dark slate forms | Cartoon chip mascot and logo, stake "chips", a 3-step "how it works" strip, a ticket-style room code, a polaroid QR code, and a seat-strip player counter. |
| **Accessibility** | Partial | Ink outlines meet 3:1 contrast for non-text elements and text meets AA. It honours the OS reduced-motion setting and has an in-app toggle. Pinch-zoom is re-enabled. A screen-reader live region announces turns and wins. Each icon is either labelled or aria-hidden. |

## 2. Files in this plan

| File | Purpose |
|---|---|
| [00-research.md](./00-research.md) | What the best poker and card-game UIs do well, and a traceability matrix from each quality to where this plan implements it (or why not). |
| [01-design-system.md](./01-design-system.md) | Palette, type, shapes, textures, motion, iconography, layout geometry and a11y rules. Reference only; the code is in the phase files. |
| [02-test-contract.md](./02-test-contract.md) | **Read before touching any file.** It lists the selectors, texts and DOM facts the existing e2e and unit tests depend on, and the reason for each. |
| [phase-1-foundation.md](./phase-1-foundation.md) | Tokens, global CSS, fonts, favicon, settings store, sound/haptics/motion libs, UI primitives, logo, dialog shell. |
| [phase-2-entry-pages.md](./phase-2-entry-pages.md) | Create, Join and Lobby pages, plus the seating dialog (its move buttons are reused by the lobby). |
| [phase-3-table.md](./phase-3-table.md) | Table layout maths, the event-to-"juice" hook, all table components, header, ticker, standings and the new Game page. |
| [phase-4-action-controls.md](./phase-4-action-controls.md) | Action dock, bet-sizing picker, pre-actions and hotkeys. |
| [phase-5-dialogs.md](./phase-5-dialogs.md) | Showdown, rebuy, restart, undo banner and activity log restyle. |
| [phase-6-verification.md](./phase-6-verification.md) | Full verification (static checks, e2e), the visual QA checklist and the doc note. |
| [reference/](./reference/) | Screenshots of the validated implementation. Your result should look like these. |

## 3. Rules for the implementing agent

1. **Follow the phases in order (1 → 6), and the steps inside each phase in order.** Each phase ends in a compiling, test-passing state.
2. **Copy code verbatim.** Every file is given in full. The step verbs mean:
   - **Create**: the file does not exist yet. Create it with exactly the content shown.
   - **Replace**: overwrite the entire existing file with exactly the content shown. Do not merge with the old content.
   - **Delete**: remove the file or folder.
3. **Do not improvise.** Do not rename, reformat, reorder, "improve" or add comments, classes, props, dependencies or files that the plan does not list. The design decisions are already made (see 01 and 02). If something seems wrong, re-check your copy against the plan character by character before changing anything.
4. **Never edit** `tests/e2e/**`, `src/backend/**`, `infra/**`, `package.json` or `package-lock.json`. No new npm packages are needed. Everything used (`class-variance-authority`, `lucide-react`, `@radix-ui/*`, `canvas-confetti`, `qrcode.react`, `zustand`) is already installed.
5. **Run each phase's Verify block** before moving on. Run commands from the folder stated, in PowerShell, one command per line (do not chain with `&&`).
6. **Do not commit or push.** Leave all changes in the working tree for the user to review.
7. If a Verify command fails and your files match the plan exactly, stop and report the failing command and its first error line. Do not work around it.

## 4. Phase overview

| Phase | Delivers | Verify |
|---|---|---|
| 1. Foundation | Design tokens, retro CSS utilities and motion, fonts, favicon, settings / sound / haptics / motion libs, `RetroButton`, `Avatar`, `ChipStack`, `DealerChip`, `StatusTag`, `ChipLogo`, `DialogShell`, template clean-up | `tsc -b`, lint, unit tests |
| 2. Entry pages | Create, Join, Lobby, Seating dialog | same |
| 3. Table | `tableLayout`, `standings`, `useTableEvents`, `useTurnTitle`, `components/table/*`, `GameHeader`, `ActivityStrip`, `StandingsDialog`, `GamePage`. Deletes `PlayerPanel`, `PotDisplay`, `PhaseStepper` | same |
| 4. Action controls | `preActions`, `ActionBar` (+ test), `AmountPicker` | same |
| 5. Dialogs | Showdown, Rebuy, Restart, Undo, Activity log | same, plus a stale-token grep |
| 6. Verification | Production build, **full e2e suite**, visual QA, doc note | everything |

Between phases 1 and 5 some screens look half old, half new, because old components still use removed colour tokens. That is expected; only phase 6 checks visuals.

## 5. Definition of done

- Every step in phases 1–6 is applied exactly.
- From `src/frontend`: `npx tsc -b`, `npm run lint`, `npm test` and `npm run build` all exit 0, with 83 unit tests passing.
- The stale-token grep in phase 5 returns no matches.
- The full Playwright suite is green (`failed=0 flaky=0`), run as described in phase 6. No test was skipped or edited.
- The phase 6 visual QA checklist passes against `reference/`.

## 6. Deliberately out of scope

| Top-app quality | Why not here | What it would need |
|---|---|---|
| Emotes / throwables / reactions | Needs a new broadcast event so other devices see them | Backend `emote` command and room event |
| Session ledger (buy-ins, net, "who pays whom") | The client cannot count buy-ins reliably: the activity log is trimmed server-side (`GameRoom.cs` `ActivityLog.RemoveRange`) | `Player.TotalBuyIn` in the domain and DTO. A Standings leaderboard by chip count ships now. |
| Shot clock / time bank | No server-side turn timer exists; home games rarely want one | Server timer and auto-fold |
| Hand-strength hints / odds | The app never sees the cards (physical deck) | n/a |
| Hand replay, CSV export | Same trimmed-log limitation | Full log persistence |
| Custom avatars / profiles | No accounts | Accounts or per-room avatar field |
| Fold confirmation dialog | Would add a click to the existing e2e `fold()` flow. Softened styling is used instead: Fold turns cream when checking is free. | n/a |
| Host approval of joiners | Changes join semantics | Backend pending-join state |
