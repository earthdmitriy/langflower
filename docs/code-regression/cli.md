# Code regression — cli

## Meta

- Paths: `packages/cli/src/`
- Date: 2026-09-20
- Mode: delta
- Coverage: Full re-read of the same five production modules as 2026-09-19 (`index.ts`, `cli.ts`, `start-command.ts`, `eval-command.ts`, `create-fake-skill-case-runner.ts`) plus the three colocated tests. No new files under `src/`. ts-scan: `list_exports` on `cli.ts` / `start-command.ts` / `eval-command.ts`; `CreateServerOptions` (server) has only `onRunSettled`; `listenHttpServer` still resolves after TCP `listen` with no `address()` check; `onLastEventLine` and `createLastEventWriter` unresolved. Glob `**/last-event-writer*` is empty. Grep in `packages/cli` for `last-event` / `Last event:` / `onLastEventLine` is empty. Cross-checked root `package.json` (`0.1.3`) vs workspace `@langflower/cli` (`0.1.0`) vs `cli.ts` `.version('0.1.0')`. No RxJS — REACTIVITY.md N/A. Sample is the whole `src/` tree, not a line-by-line commentary.
- Previous report: 2026-09-19 — Critical=0 Important=1 Suggestion=4 (numbered items; kebab ids assigned here for ledger stability)

## Previous findings (delta mode)

| id                                         | severity   | status     | evidence                                                                                                                                                                                                                                                                                             |
| ------------------------------------------ | ---------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cli-ready-default-port-fallback` (was #2) | Suggestion | still-open | `start-command.ts` `startProject` still does `address !== null && typeof address === 'object' ? address.port : DEFAULT_PORT`, then prints the URL and (non-`--dev`) writes `LANGFLOWER_READY` with that port. `listenHttpServer` still resolves on the listen callback without checking `address()`. |

## Principles check

- **PASS — thin CLI / package DAG.** `startProject` still delegates bootstrap + listen to `@langflower/server/bootstrap` and `@langflower/server/create-server`. Eval gate stays in `@langflower/eval`. No `@langflower/compiler` import, no HTTP/WS domain under `src/`.
- **PASS — composer entry points.** `startProject` lists resolve → optional bootstrap → `createServer` → address / open / READY. `runEvalCommand` lists resolve runner → `runEvalSuite` → print → gate. Siblings do not call the next sibling.
- **PASS — no barrels.** `src/index.ts` is `runCli(process.argv)` process bootstrap, not `export *`. `packages/cli/AGENTS.md` records the exception. No second aggregator.
- **PASS — `type` + arrows; no `any`.** Production modules use `type`, `const` arrows, `as const` only on Commander option tuples. No `function` / `interface` / `any`.
- **PASS — reuse owner types.** Settle stdout uses shared `formatRunSettleLine` via `onRunSettled`. Eval uses `EvalCaseRunner` / `EvalSuiteResult` from `@langflower/eval/run-eval-suite`.
- **PASS — delete obsolete last-event path.** `last-event-writer.ts` stayed deleted. LEDGER `legacy-last-event-protocol` must not reopen: no file, no `onLastEventLine`, no `Last event:` string, server `CreateServerOptions` still has only `onRunSettled`.
- **PASS — no named adapters.** No `*Adapter` / `*Mapper`. `toStartOpts` is a Commander-polarity helper, not a package-boundary shim.
- **PASS — functional errors at the process I/O edge.** `parseListenPort` and start failures throw; `runStartAction` maps to `process.exit(1)`. Eval maps throws and gate failure to `process.exitCode = 1`. `resolveUiDistPath` tries candidates then throws. Fake runner throws on missing skill / no match.
- **FAIL — `false-ready`.** After a successful `listenHttpServer`, a non-`AddressInfo` `address()` still becomes a READY/URL line with `DEFAULT_PORT` (`cli-ready-default-port-fallback`).
- **PASS — RxJS / `withLatestFrom`.** N/A.

## FOUND_BUGS signals

- **BUG-2026-08-30** (product CLI bundle: dynamic `require` of `node:events`) — **adjacent, not in this chunk.** Root cause was esbuild + bundled CJS `commander`. `packages/cli/src/` has no `require` shim.
- **BUG-2026-07-21** (settle must not fork live vs reconnect) — **consumer only, not recurrence.** CLI still prints settle solely via `onRunSettled` → shared `formatRunSettleLine`.
- **BUG-2026-07-21b / BUG-2026-09-18** (false-ready: missing fact → successful ready) — **same class, not the same mechanism.** Those entries are empty `startWith` / catalog-before-events. The remaining CLI hole is a listen `address()` fallback to `DEFAULT_PORT` (Finding `cli-ready-default-port-fallback`), not a hydrate replay.
- Other BUG-* (WS fan-out, HITL, canvas, reactive ports) — **none** apply.

## Glue / adapters / parallel types

none

ADR-backed copies noted and skipped: `formatReadyLine` JSON `{ url, port, projectDir }` is the supervisor protocol (ADR-038); the Rust launcher parses it. Do not merge the two. Launcher `spawn_cli` is spawn + READY parse + `--no-open -p`, not a second `createServer`. `createFakeSkillCaseRunner` is documented agent-under-test ownership outside `@langflower/eval`.

## Streamlining & simplifications

none

## Design-flaw fixes

none

## Findings

1.  - id: `cli-ready-default-port-fallback`

- class: false-ready
- severity: Suggestion
- first-seen: 2026-09-19
- status: open
- path: `packages/cli/src/start-command.ts` `startProject` (`httpServer.address()` → `DEFAULT_PORT`)
- evidence: After `createServer` returns, `address` is read and a non-object / `null` result is replaced with `DEFAULT_PORT`. Non-`--dev` then `writeSync`s `formatReadyLine({ url, port, projectDir })`. `listenHttpServer` resolves on the listen callback and does not guarantee `address()` is `AddressInfo`. A missing listen fact becomes a successful READY line (closed-list `false-ready`: fallback port). Branch is likely dead after a TCP listen on `127.0.0.1`; if it runs it lies.
- proposed fix: Require `typeof address === 'object' && address !== null && 'port' in address`; otherwise throw. Do not substitute `DEFAULT_PORT`.

## Non-issues / looked OK

- **LEDGER `legacy-last-event-protocol`:** re-confirmed deleted. No `last-event-writer.ts`, no `last_event_line.rs` consumer in this chunk, no `Last event:` parse, no `onLastEventLine`. Do not restore.
- **Stale `--version` (`0.1.0` vs published `0.1.3`):** still true; not re-filed because it has no closed class. Product identity lives in root `package.json` / `docs/RELEASE.md`.
- Commander polarity invert, parallel option types, and local `.sort` are working code, not listed classes.
- **Launcher vs CLI start:** one `createServer` path; supervisor is spawn + READY + `--no-open -p`.
- **No leftover bundler / `langflower compile` in `src/`.** Dynamic `import('./eval-command.js')` + `cli.import-graph.test.ts` still match the product split.
- Commander surface: default `[project-dir]` + `start` alias share `runStartAction` via `applyStartOptions`.
- `--dev` skips `LANGFLOWER_READY` and browser open. Launcher does not pass `--dev`.
- Eval composition: Fake primary / `--replay` optional; `loadReplayMap` / `createReplayCaseRunner` stay in `@langflower/eval`.
- Fake skill runner fail-closed paths + colocated vitest (greet / farewell / missing skill).
- UI asset resolution (`ui-dist` vs `../ui/dist/browser`) throws after both candidates fail.
- `src/index.ts` side-effect entry (documented exception).
- `parseListenPort` throw + colocated range tests — I/O-edge validation.
- Prior July leftovers (duplicate `readPort`, inline eval summary type, last-event writer) — still gone.
