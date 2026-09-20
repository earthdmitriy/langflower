# Code regression — common-nodes-domain

## Meta

- Paths: `packages/common-nodes/src/crawl/`, `packages/common-nodes/src/memory/`, `packages/common-nodes/src/logic/`, `packages/common-nodes/src/flow/`
- Date: 2026-09-20
- Mode: delta
- Coverage: Reconciled every 2026-09-19 finding against current source. Re-read all production `.ts` in the four folders (crawl graph nodes + `crawl-tools`, `memory-tools`, logic nodes + `switch-rules` / `evaluate-compare` / `switch-constants`, flow nodes + `map-collect-body` + `router-constants`). Sampled colocated tests (`fetch-url`, `crawl`, `memory-tools`, `delay`, `loop`). Read NODE.md / README in those folders. ts-scan: `DEFAULT_ROUTER_CHANNELS`, `enabledToolIds`, `filterEnabledRegistrations` not found; `toToolHandles` still the SDK helper; `getRunHostServices` still exists (out of chunk). `kb/`, `obsidian/`, `logic/router/`, `logic/merge/` still absent. Product tree in these folders unchanged since the previous report (git log only the docs “code regression” commit). Not a line-by-line of every test assertion.
- Previous report: 2026-09-19 — Critical=0 Important=1 Suggestion=5

## Previous findings (delta mode)

| id                             | severity   | status     | evidence                                                                                                                                                                                             |
| ------------------------------ | ---------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `router-channels-jsdoc-ghost`  | Important  | fixed      | Closed 2026-09-20 — see LEDGER.                                                                                                                                                                      |
| `fetch-url-error-body-success` | Suggestion | still-open | `fetch-url/node.ts` still throws only when `!result.ok && result.body.length === 0`. `ok: false` with a body emits `text` / `html` / `status` as value. Tests still cover the empty-body error only. |
| `memory-plan-reread-swallowed` | Suggestion | still-open | `memory-tools/node.ts` `wrapUpdatePlan` still empty-`catch`es `createMemoryStore` / `readSection` after a successful `update_plan`. Tool result returns; `plan` stays stale.                         |

## Principles check

- **Thin server / specialized-node I/O — PASS.** Bind uses tools factories (`createWebFetch`, `createCrawlContext`, `runBfsCrawl`) plus `requires: ['hosts']` → `ec.allowedHosts`. Public `ExecutionContext` is not treated as a harness bag. Remaining `harness.allowedHosts` in NODE.md is the `langflower.jsonc` key.
- **BFS / HTML ownership — PASS.** No local HTML or BFS under `src/crawl/`. Graph nodes import `@langflower/tools/html` and `@langflower/tools/run-bfs-crawl`.
- **No barrels (`index.ts`) — PASS.** None under the four folders (or `packages/common-nodes/src/`).
- **kb / obsidian — PASS (still gone).** No files. Do not restore.
- **Feature-sliced colocation — PASS for product folders.** `logic/README.md` points at `flow/router` / `flow/merge` and forbids `logic/router/` / `logic/merge/`. Those folders stay absent.
- **Reactive bind — PASS on sampled nodes.** `combineInputs` / `pipeValue` / `configureOutput`; Repeat keeps `trigger` off the combine; Delay stamps `withLoading` before async `pipeValue`. Loop dual `switchMap` remains the documented different-`take` exception. No `withLatestFrom`, no `shareReplay`, no production `.subscribe` state mutation, no raw `combineLatest`.
- **Type ownership — PASS.** Locals use `type`; no `interface`; no `@langflower/shared`. Router `bypassPorts` uses runtime `RuntimeWireType`.
- **Delete obsolete — PASS.** `DEFAULT_ROUTER_CHANNELS` stays deleted (`router-constants.ts` is only `COMMON_ROUTER_TYPE`). Router JSDoc no longer teaches `routerChannels` (LEDGER `router-channels-jsdoc-ghost`, 2026-09-20).
- **No adapters / glue layers — PASS.** No `*Adapter` / `*Mapper`. Pack nodes import `*_TOOL_CONFIGS` (ADR-019). `memory-tools` maps via shared `toToolHandles` then wraps `update_plan` (ADR-033). Crawl page map is a local field pick, not a second BFS.
- **Functional errors — FAIL (listed class).** Memory plan re-read empty `catch` (`fail-open-io`). Fetch URL still succeeds on `!ok` with a non-empty body. Assert uses `throwError` (looked OK).
- **Composer entry points — PASS.** Bind bodies are flat; Loop delegates to `createMapCollectStreams`.

## FOUND_BUGS signals

none

BUG-2026-08-27 (`pipeValue` + async never pending) remains addressed in this chunk: Delay / crawl fetch / save / BFS still stamp `withLoading` before `from(...)`. BUG-2026-07-15 Router bypass telemetry is a runtime residual, not a defect in `flow/router/node.ts`. No same-mechanism return.

## Glue / adapters / parallel types

none

ADR-backed / accepted copies, not flagged: `toToolHandles` is the SDK helper (not a local mapper). Graph `common-crawl` and agent `crawl_bfs` share `runBfsCrawl` in `@langflower/tools`. `matchesRegex` is still copied in `switch-rules.ts` and `evaluate-compare.ts` (two consumers — YAGNI to extract).

## Streamlining & simplifications

none

(No `dead-export` or duplicate-path delete in this chunk. Do not restore `DEFAULT_ROUTER_CHANNELS`, `logic/router/`, `logic/merge/`, `kb/`, or `obsidian/`.)

## Design-flaw fixes

none

(Router `routerChannels` JSDoc ghost closed 2026-09-20. Remaining open items are Suggestion `fail-open-io` holes — not a Critical concurrency / ownership sequence.)

## Findings

1.  - id: `fetch-url-error-body-success`

- class: fail-open-io
- severity: Suggestion
- first-seen: 2026-09-19
- status: open
- path: `packages/common-nodes/src/crawl/fetch-url/node.ts` (`fetched$` `map`, `!result.ok && result.body.length === 0`)
- evidence: `createWebFetch` Result `{ ok: false, body, error }` with any body (typical 403/404 HTML) is turned into a successful `FetchedPage`. Only empty-body failures enter the error lane. `result.error` is discarded. Tests cover the empty-body path only (`errors when webFetch returns failure with empty body`).
- proposed fix: Error on `!result.ok` (use `result.error`), or document that callers must inspect `status`. Add a unit case for `ok: false` + non-empty body either way.

2.  - id: `memory-plan-reread-swallowed`

- class: fail-open-io
- severity: Suggestion
- first-seen: 2026-09-19
- status: open
- path: `packages/common-nodes/src/memory/memory-tools/node.ts` (`wrapUpdatePlan` empty `catch`)
- evidence: After a successful `update_plan`, the wrap re-reads `history/plan.md` and `connect`s `plan`. Any `createMemoryStore` / `readSection` failure is swallowed — tool result still returns, work-log `plan` stays stale. ADR-033 promises a plan feed after `update_plan`. Success-path test does not cover the read miss.
- proposed fix: Surface the read failure (port error or skip with a visible tool/feed fact). Do not keep a bare `catch`. Keep the wrap; do not go back to a local handle-map.

## Non-issues / looked OK

- **LEDGER closed, not reopened:** `legacy-enabled-tool-ids`, `legacy-filter-enabled-registrations` — ts-scan not found; do not restore.
- **`DEFAULT_ROUTER_CHANNELS` stayed deleted.** `router-constants.ts` is only `COMMON_ROUTER_TYPE`.
- **`logic/router/` and `logic/merge/` stayed gone.** `logic/README.md` points at `flow/` and forbids those NODE.md paths.
- **`kb/` and `obsidian/` stayed gone.**
- **No duplicate BFS/HTML in common-nodes.** `crawl/html/` is gone.
- Crawl NODE.md / README no longer teach `ctx.harness.webFetch` / `ctx.crawl` as public EC fields. `getRunHostServices` still exists; README mention is not a deleted API.
- `crawl-tools` is a thin `defineToolRegistrations({ tools: CRAWL_TOOL_CONFIGS })` — ADR-019.
- `memory-tools` `toToolHandles` + `wrapUpdatePlan` is the right split.
- Extract Links is a pure `extractLinks` bind — no host I/O.
- Logic `if` / `gate` / `assert` / `compare` / Switch static-port clamp (`ALLOWED_SWITCH_OUTPUTS`) are clear reactive branches. Gate/IF `EMPTY` is routing / soft block, not a silent policy refusal.
- `matchesRegex` duplication stays YAGNI at two call sites.
- `flow/merge` passthrough + `multi: 'merge'`.
- Repeat: one tagged session then demux. Loop dual streams remain the documented different-`take` exception. `startWith(undefined)` is first-item pacing, not `false-ready`.
- Delay `withLoading` (BUG-2026-08-27). No debug `tap`.
- No `interface`, no `withLatestFrom`, no barrels, no `@langflower/shared` in this chunk.
- Gate/Assert NODE.md `passthroughFrom` matches the product term in `docs/features/node-library.md`; code correctly uses `inferTypeFrom`.
- Crawl skip branch, Delay `inline: 'text'`, and unused Checkpoint `label` are working leftovers, not listed classes.
