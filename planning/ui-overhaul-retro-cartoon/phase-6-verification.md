# Phase 6: Verification, Visual QA and Docs

**Goal:** Prove the overhaul is complete and nothing regressed, then record that this plan supersedes the old UI requirements doc.

---

### Step 6.1: Static checks and production build (from `src/frontend`)

```powershell
npx tsc -b
npm run lint
npm test
npm run build
```

Expected: every command exits 0, `npm test` reports **83 passed** (17 files), and `vite build` prints `✓ built`.

### Step 6.2: Stale-token check (from the repository root)

Run the command in the phase 5 "Stale-token check" section again. Expected: no output.

### Step 6.3: Full end-to-end suite

Follow the repository skill [`.agents/skills/e2e-test-loop/SKILL.md`](../../.agents/skills/e2e-test-loop/SKILL.md).

1. **Docker preflight** (one line, in the same terminal you will use for the tests):

   ```powershell
   if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { $b = @([Environment]::GetEnvironmentVariable('Path','User'), [Environment]::GetEnvironmentVariable('Path','Machine')) -join ';' -split ';' | Where-Object { $_ -and (Test-Path (Join-Path $_ 'docker.exe')) } | Select-Object -First 1; if (-not $b) { $b = "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin" }; $env:Path = "$b;$env:Path" }; docker version --format 'server={{.Server.Version}}'
   ```

   - If it prints `server=<version>`, continue.
   - If the daemon is not running, ask the user to start Docker Desktop and stop here.

2. **Run the whole suite** (from `tests/e2e`; global setup builds and starts the Docker stack, and teardown removes it):

   ```powershell
   $env:PLAYWRIGHT_JSON_OUTPUT_NAME='results.json'
   npx playwright test --reporter=json,dot | Out-Null
   ..\..\.agents\skills\e2e-test-loop\scripts\summarize-results.ps1
   ```

   Expected: `STATS passed=65 failed=0 flaky=0 skipped=0` and `GREEN`. This result was reported for the originally validated implementation.

3. Delete `tests/e2e/results.json` afterwards.

If anything fails: **do not edit tests.**
- Compare the components named in the failure with the plan text and with [02-test-contract.md](./02-test-contract.md).
- The usual cause is a transcription difference: a missing `aria-hidden`, an altered string, or a changed test ID.
- Fix the copy so it matches the plan, then re-run only that spec with `npx playwright test <spec-name-fragment> --retries=0`, for example `npx playwright test 15-seating`.
- Finish with one more full run.

### Step 6.4: Visual QA against the reference screenshots

Start the stack from the repository root:

```powershell
docker compose up -d --build
```

Open `http://localhost:3000` in a browser with device emulation at **390 × 844** (iPhone 12/13/14). Play a 3-player game using three browser profiles or incognito windows, and compare each screen with [reference/](./reference/):

| # | Check | Reference |
|---|---|---|
| 1 | Create page: mascot on a slowly spinning sunburst, outlined "DEAL ME IN", three chip presets (Standard selected with a teal ✓), teal CREATE GAME, 3-step strip | `01-create.png` |
| 2 | Join page: big letter-spaced code input with a blue LOOK UP | `02-join.png` |
| 3 | Lobby: mustard ticket room code, Stack/Blinds pills, tilted polaroid QR "Scan to join", blue share button, 9-segment seat strip, player rows with avatar, HOST and YOU pills and move arrows (creator only), sticky mustard START GAME | `03-lobby.png` |
| 4 | Table on your turn: oval felt with a wooden rail; opponents clockwise with avatar, name plate and stack; blinds as chip stacks in front of seats; five dashed board slots, a PRE-FLOP pill and the POT card; hero panel with a pulsing mustard ring, YOU tag and Dealer pill; dock with a tilted "YOUR TURN - CHOOSE ACTION" ribbon and FOLD / CALL $X / RAISE / ALL-IN $X | `04-table-your-turn.png` |
| 5 | Raise picker: Back, −, "RAISE TO $40", +, chip-shaped slider thumb, 2x/3x/4x/All-In, CONFIRM RAISE | `05-raise-picker.png` |
| 6 | Flop while waiting: three red card backs; a comic bubble over the seat that just acted (for example "CHECK!"); "…" badge on the acting seat; "Waiting for your turn..." with three pre-action checkboxes | `06-flop-waiting.png` |
| 7 | Showdown dialog: tilted mustard "SHOWDOWN" sticker, "Who won the hand?", "Pot: $X", winner buttons with avatars, teal Split Pot | `07-showdown.png` |
| 8 | After awarding a pot: yellow outlined "+$X" float and a gold glow on the winner, "Hand #N / Deal 2 cards each" splash | `08-win.png` |
| 9 | 9-player table still fits a phone without overlaps (avatars shrink to medium) | `09-nine-players.png` |
| 10 | Landscape phone (844 × 390): table on the left, hero and dock in a 340 px right column | `10-landscape.png` |
| 11 | Desktop (1280 × 800): wide oval centred and the dock centred below; the menu lists Request Undo, Standings, Activity Log, Sound/Vibration/Reduce Motion toggles, then Host tools | `11-desktop-menu.png` |
| 12 | Standings dialog: trophy for 1st, rank badges, avatars, stacks, teal share bars, "Chips in stacks" total | `12-standings.png` |
| 13 | Reduce Motion **On** (menu): the turn ring is static, bubbles and splashes appear without animating and still disappear on schedule, and no confetti | — |
| 14 | Sound **On**: your turn plays a two-note "ding"; your own check, call, bet and fold make sounds; another player's action makes none. Vibration works only on Android Chrome. | — |

Stop the stack afterwards:

```powershell
docker compose down -v
```

### Step 6.5: Mark the old UI requirements doc as superseded

In `planning/MVP/ui-ux-requirements.md`, replace the first line:

```markdown
# UI/UX Upgrade Requirements — Chip Tracker
```

with:

```markdown
# UI/UX Upgrade Requirements — Chip Tracker

> **Superseded** by the retro-cartoon overhaul in [../ui-overhaul-retro-cartoon/README.md](../ui-overhaul-retro-cartoon/README.md). Kept for history.
```

Change nothing else in that file.

### Step 6.6: Report

Report the following to the user, and do not commit:
- the Step 6.1 results (unit test count)
- the e2e `STATS` line
- any checklist rows from Step 6.4 that did not match
- the list of changed files (`git --no-pager status --short`)
