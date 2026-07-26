---
name: e2e-test-loop
description: >
  Run the Playwright e2e suite in tests/e2e and iteratively diagnose and fix failures until the whole
  suite passes. Use when the user says "run the e2e tests", "fix the e2e tests", "playwright failing",
  "e2e broken", "make e2e green", or invokes /e2e-test-loop. Covers Docker Compose stack startup,
  failure triage (test bug vs app bug), targeted re-runs, and the final full-suite verification.
---

# E2E Test Loop

Goal: full Playwright suite green. Never declare done without a **full clean run** (no `--grep`, no single-file filter).

**Token discipline is a hard requirement.** Playwright's default `list` reporter plus Docker build output is tens of thousands of tokens per run. Always start at the lowest verbosity that could answer the question and step up only for the specific test that still needs it. Never dump a raw report, trace, or container log into context.

## Layout

| Thing | Path / value |
|-------|--------------|
| Test root | `tests/e2e` (own package.json, run commands from here) |
| Specs | `tests/e2e/tests/NN-*.spec.ts` |
| Shared helpers | `tests/e2e/helpers/game.ts`, `tests/e2e/helpers/actions.ts` |
| Stack lifecycle | `tests/e2e/global-setup.ts` / `global-teardown.ts` (runs `docker compose up -d --build` / `down -v`) |
| Config | `tests/e2e/playwright.config.ts` — 1 worker, serial, retries 1, 5s timeouts |
| Frontend | http://localhost:3000 |
| Backend health | http://localhost:5000/health |
| Artifacts | `tests/e2e/test-results/` (traces, video, `docker-compose.log`), `tests/e2e/playwright-report/` |

Setup rebuilds and teardown destroys the stack on every `playwright test` invocation. Each run costs a Docker build.

Bundled: [scripts/summarize-results.ps1](./scripts/summarize-results.ps1) — turns a Playwright JSON report into one line per failure. This is the primary way to read results.

## Verbosity Ladder

Climb one rung at a time, and only for the test that still needs it. Do not skip to L3 because it "might help".

| Rung | Command | Yields | Cost |
|------|---------|--------|------|
| **L0** count | `npx playwright test --reporter=dot > run.txt 2>&1; $LASTEXITCODE` | exit code only | ~1 line |
| **L1** headlines | run with JSON reporter, then `summarize-results.ps1` | `FAIL file:line title \| first error line` per failure | ~1 line/failure |
| **L2** one test detail | `summarize-results.ps1 -Detail -Grep "<title fragment>"` | full error + code frame for that test | ~15 lines |
| **L3** source | read the spec, helper, and the component under test | actual cause | targeted reads |
| **L4** runtime | trace / console / container logs, filtered (see below) | last resort | expensive |

L1 is the default working rung. Most failures are solved at L2+L3 without ever touching L4.

## Loop

### 1. Baseline run (L0 → L1)

```powershell
cd tests\e2e
npx playwright test --reporter=json --output=test-results 2>&1 | Out-File -Encoding utf8 results.json
```

Then read only the summary:

```powershell
..\..\.agents\skills\e2e-test-loop\scripts\summarize-results.ps1 -Path results.json
```

Do NOT chain with `&&`. If Playwright browsers are missing, run `npx playwright install chromium` once. If `results.json` is polluted by stdout noise, rerun with `PWTEST_JSON_OUTPUT_NAME`:

```powershell
$env:PLAYWRIGHT_JSON_OUTPUT_NAME='results.json'; npx playwright test --reporter=json,dot | Out-Null
```

Output prints `GREEN` or a `FAIL`/`STATS` block. That block — not the raw run — is what you reason over.

### 2. Triage before editing (L1 → L2 → L3)

Classify each distinct failure from its one-line headline first. Only escalate to `-Detail` when the headline is genuinely ambiguous. Group identical error lines and treat them as **one** root cause — do not investigate 12 tests failing on the same missing button 12 times.

Do not guess, get evidence:

| Symptom | Likely cause | Evidence to gather |
|---------|--------------|--------------------|
| Global setup timed out on health/frontend poll | Stack not booting | `docker compose ps --format "{{.Service}} {{.Status}}"`, then `docker compose logs backend --tail 40` |
| Every test fails identically at first step | App regression or selector rename | Read the page component, compare to helper selectors |
| One test fails, siblings pass | Test bug or state leakage from prior test | Trace viewer for that test |
| Fails only on retry / passes alone | Shared DynamoDB state leaking between tests | Check the test creates its own room code |
| `strict mode violation` / `resolved to N elements` | Selector too loose | Tighten with role + name, or scope to a container |
| Timeout waiting for element that clearly exists later | 5s budget too tight for a real async path | Prefer fixing the wait, only raise timeout with justification |

Read the actual page/component source before changing any selector. Root-cause the failure; do not paper over it.

### 3. Fix one root cause at a time

Rules:
- **App bug → fix the app**, not the test. Do not weaken assertions to make red go green. Editing backend or frontend source is expected and does not need approval.
- **Test bug → fix the test**, preferring shared helpers over per-spec duplication.
- Never add `test.skip`, `test.fixme`, `.only`, or blanket timeout bumps to get green. If a test must be skipped, stop and ask the user.
- Never add arbitrary `page.waitForTimeout(...)`. Use web-first assertions (`expect(locator).toBeVisible()`) or `waitForURL`.
- Prefer accessible locators (`getByRole`, `getByLabel`) matching the existing helper style.
- If a fix touches the backend or frontend, also run that project's unit tests before moving on.

### 4. Targeted re-run (narrowest scope that proves the fix)

```powershell
$env:PLAYWRIGHT_JSON_OUTPUT_NAME='results.json'
npx playwright test tests\03-hand-preflop.spec.ts --reporter=json,dot | Out-Null
..\..\.agents\skills\e2e-test-loop\scripts\summarize-results.ps1
```

Add `--grep "posts blinds"` to narrow to a single test, and `--retries=0` while iterating (halves runtime and output; restore for final verification).

**L4 escalation — only when L2+L3 failed to explain it.** Never open a raw trace or full log:
- Browser console/network for one test: add a temporary `page.on('console', ...)` filtered to errors, or read `test-results/<dir>/error-context.md` if present.
- Backend behavior: `docker compose logs backend --tail 40 | Select-String -Pattern "error|exception|warn"`.
- Interactive: tell the **user** to run `npx playwright show-report` or `--headed`/`--debug`. These produce no useful text for you; do not run them yourself expecting readable output.

If still failing after the fix, go back to step 2 with the new evidence — do not retry the same change.

### 5. Repeat

Loop steps 2–4 until no known failures remain.

Keep going autonomously — including across backend, frontend, and test code. Stop and ask the user only when the fix requires a **product or design decision** (intended behavior is ambiguous, spec conflicts with implementation, a test must be deleted/skipped, or a fix would change the public API or data model). Churning on the same test with 3 different failed fixes is a signal to re-triage from evidence, not to give up.

### 6. Full verification (mandatory)

```powershell
cd tests\e2e
$env:PLAYWRIGHT_JSON_OUTPUT_NAME='results.json'
npx playwright test --reporter=json,dot | Out-Null
..\..\.agents\skills\e2e-test-loop\scripts\summarize-results.ps1
```

Done only when the summary prints `GREEN` with `failed=0 flaky=0`, and no test was newly skipped versus baseline. A `FLAKY` line means it passed only on retry — treat it as a failure and fix the race.

Batch fixes before re-running: each full run costs a Docker build. Fix every independently-confident root cause, then verify once.

## Token Rules

- Read the summarizer output, not raw Playwright output. Pipe raw runs to a file or `Out-Null`.
- `--reporter=dot` when you only need pass/fail; never plain `list` for a full suite.
- Docker build output is noise — it goes to the file, never quoted back.
- Quote the shortest decisive line of an error. Never paste a full stack trace, code frame set, or `docker-compose.log`.
- Delete `results.json` when done; do not read it directly — it is huge.
- Dedupe: N tests, same error line = 1 investigation.
- Use the `Explore` subagent for open-ended "where is this component / who renders this label" questions so the search churn stays out of this conversation.
- Read a spec file once and keep it in mind; do not re-read to confirm an edit you just made.

## Reporting

Report compactly: baseline `failed=N`, a one-line-per-root-cause list with its fix, files changed, final `STATS` line. Do not claim success from a filtered run.
