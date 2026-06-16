# Code regression — cli

## Meta

- Paths: `packages/cli/src/`
- Date: 2026-07-22
- Coverage: Full package (6 files): `index.ts`, `cli.ts`, `start-command.ts`, `eval-command.ts`, `create-fake-skill-case-runner.ts`, `create-fake-skill-case-runner.test.ts`. Cross-checked `packages/cli/AGENTS.md`, `package.json`, `bin/langflower.js`, server `createServer` / `ConfigService` port ownership, eval `EvalSuiteResult` boundary. No RxJS — REACTIVITY.md N/A.

## Principles check

- **Thin CLI / no HTTP domain — PASS.** Delegates bootstrap + listen to `@langflower/server`; eval gate in `@langflower/eval`; CLI owns commander, browser open, stdout/stderr, exit codes only.
- **Composer entry points — PASS.** `startProject` lists bootstrap → createServer → log/open; `resolveCaseRunner` documents Fake vs `--replay` sibling composition; steps do not call each other.
- **Immutability — PASS.** Fake runner builds `ranked` via `map` + fresh `sort`; no in-place domain mutation.
- **Feature-sliced / colocation — PASS.** Fake runner + vitest beside eval command; small vertical package.
- **No adapters / glue — PASS.** No `*Adapter` / `*Mapper`; `EvalCaseRunner` injection matches eval package boundary.
- **`type` + arrow functions — PASS.** No `interface`, no `function` declarations, no `any`.
- **Reuse domain types — PASS (re-verified).** `printSuiteSummary(result: EvalSuiteResult)` imports from `@langflower/eval/run-eval-suite`.
- **Port ownership — PASS (re-verified).** `readPort` deleted; `start-command.ts` passes only `projectDir` / `uiDistPath` / `onRunSettled`; listen port resolved inside `createServer` via `ConfigService`; CLI logs `httpServer.address().port`.
- **Barrels (`index.ts`) — MIXED (documented exception).** `src/index.ts` is npm process bootstrap (`runCli(process.argv)`), not a re-export aggregator. `AGENTS.md` documents the exception; repo-wide PRINCIPLES tension remains by filename only.
- **RxJS / `withLatestFrom` — N/A.**

## FOUND_BUGS signals

- **BUG-2026-07-21** (settle must not fork live vs reconnect) — **adjacent consumer, not recurrence.** CLI prints settle via `onRunSettled` → shared `formatRunSettleLine` (`start-command.ts`); does not re-derive progress from a second projection. Risk only if a future CLI path invents its own settle status from partial events.
- _*Other BUG-* (WS fan-out, HITL, canvas, reactive ports, false-ready)_* — **none** apply to this chunk.

## Glue / adapters / parallel types

- **No named adapter layers.** Commander registration + `EvalCaseRunner` composition are the intended product surface.
- **Parallel config read — resolved (2026-07-22).** Former `readPort` duplicate removed; server owns port resolution.
- **Parallel eval summary type — resolved (2026-07-22).** `printSuiteSummary` uses exported `EvalSuiteResult`.
- **Not glue:** `createFakeSkillCaseRunner` is deliberate agent-under-test ownership outside `@langflower/eval` (documented in AGENTS).
- **ADR-backed adapters:** none in this package.

## Streamlining & simplifications

- Read Commander `--version` from `package.json` via `packageRoot()` (same pattern as UI dist resolution) instead of hardcoded `'0.1.0'` (`cli.ts`).
- Optional: tiny local helper to apply shared `.argument` / `.option` / `.action` to default program + `start` alias (`registerStartCommand`).
- Prefer concrete shared export for `formatRunSettleLine` only if/when `package.json` adds a narrower path than `@langflower/shared/langflower` — no local re-export shim.

## Design-flaw fixes

1. **None open in product code.** Prior port-ownership split and eval summary type drift are fixed; remaining items are optional CLI polish (version string, alias wiring dedup).

## Findings

1. **Severity:** Suggestion  
   **Path / symbol:** `packages/cli/src/cli.ts` `.version('0.1.0')` (~L11); `packages/cli/package.json` `"version"`  
   **Problem:** Commander version is a hardcoded string that can drift from `package.json` on release bumps.  
   **Proposed fix:** Read version from adjacent `package.json` in `packageRoot()`, or inject at build time.

2. **Severity:** Suggestion  
   **Path / symbol:** `packages/cli/src/start-command.ts` `registerStartCommand` (~L91–102)  
   **Problem:** Default program action and `start` alias duplicate `.argument` / `.option` / `.action` wiring. Harmless but noisy when options change.  
   **Proposed fix:** Local helper that applies shared wiring to a `Command` instance (only if it shortens the file).

3. **Severity:** Suggestion  
   **Path / symbol:** `packages/cli/src/index.ts`; `docs/PRINCIPLES.md` § Module exports  
   **Problem:** Repo rule forbids `index.ts`; CLI keeps one as npm `main`/bin bootstrap (side-effect entry, not `export *`). Correctly documented in AGENTS, but filename still triggers false positives in audits.  
   **Proposed fix:** Accept documented exception, or rename npm entry to `main.ts` / `bootstrap.ts` with matching `package.json` `main` (needs release/build coordination).

## Non-issues / looked OK

- Commander surface: `runCli` → start + eval only; no hidden command chains.
- Eval composition: Fake primary / `--replay` optional; `runEvalSuite({ runCase })` injection matches eval AGENTS.
- Fake skill runner fail-closed paths + colocated vitest (greet/farewell/missing skill).
- Settle stdout: `onRunSettled` + shared `formatRunSettleLine` — thin CLI hook; does not fork settle projection.
- UI asset resolution (`ui-dist` vs monorepo `../ui/dist/browser`) with actionable error — packaging, not glue.
- Dev mode (`--dev`) API-only + ng serve message — appropriate CLI UX.
- No RxJS anti-patterns, no `any`, no extra re-export files under `src/`.
- Alias `langflower start` sharing `runStartAction` — intentional, not a parallel API.
- Prior Important findings (port read duplicate, inline eval summary type, AGENTS stub wording) — **re-verified fixed.**

## Status

Critical=0 Important=0 Suggestion=3
