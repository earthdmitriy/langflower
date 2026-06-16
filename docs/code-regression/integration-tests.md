# Code regression — integration-tests

## Meta

- Paths: `tests/integration/`
- Date: 2026-07-22
- Coverage: Helpers fully sampled (`repo-paths.ts`, `temp-project.ts`, `test-server.ts`, `workflow-scenario-builders.ts`, `workflow-scenario-registry.ts`, `workflow-scenarios.ts`, `helpers/scenarios/*`); WS harness (`ws/langflower-ws-client.ts`); composer self-test; representative suites — smoke, session sync, pending-events, detachable-long-run, fake-llm debate loop, hitl-inputs, eval-regression-gate (CLI + WS), langflower-mcp-bridge, bootstrap-sample-workflows; inventory of all 42 `*.test.ts` files; grep for barrels / `interface` / adapters / `export function` / re-export blocks / `it.todo`. Not every execute-* assertion body line-by-line.

## Principles check

- **PASS — no `index.ts` barrels** under `tests/integration/`.
- **PASS — `type` not `interface`** — harness types use `type` (`TestServerUrls`, `WorkflowScenarioComposerEntry`, local event extracts).
- **PASS — domain types reused** — graphs built as `WorkflowSavePayload` / `WorkflowNodePersisted` / `RuntimeEdge` from shared/runtime; no local mirror graph DTO layer.
- **PASS — thin server** — suites call `createServer` / `bootstrapProject` as composers; no domain logic grown under server from this tree.
- **PASS — subscribe-before-start** — `runAndWaitForOutput` / pending-events / multi-tab tests subscribe (or `firstValueFrom`) before `runner.start.requested` (BUG-2026-07-14 lesson).
- **PASS — Windows teardown durability** — `removeTempProject` retry loop for `ENOTEMPTY`/`EBUSY`/`EPERM`/`EACCES` (`temp-project.ts`).
- **PASS — arrow exports in helpers** — `temp-project`, `test-server`, builders, registry, scenario composer use `export const` arrows (re-verified 2026-07-22).
- **PASS — single scenario composer** — `WORKFLOW_SCENARIO_COMPOSER` owns id → factory; `workflowScenarioById` / `scenarioReadyById` derive from it; unknown ids throw; parity self-test in `workflow-scenario-composer.test.ts` (re-verified 2026-07-22).
- **PASS — feature-sliced helpers** — domain factories under `helpers/scenarios/`; thin `workflow-scenarios.ts` composer only (re-verified 2026-07-22).
- **PASS — suite-scoped test server** — `startTestServer` returns `TestServerHandle`; `stopTestServer(handle)` closes that instance; no module singleton (re-verified 2026-07-22).
- **PASS — WS wait ownership** — re-export block removed from `langflower-ws-client.ts`; suites import waits from `@langflower/shared/langflower-ws-waits` (re-verified 2026-07-22).
- **FAIL — runtime coverage vs documented matrix** — several files named in [TESTING.md](../TESTING.md) § LLM chain matrix are graph-shape tests + `it.todo` runtime shells only (see Findings).
- **N/A — `withLatestFrom` / product RxJS folds** — test harness uses `.subscribe` / `firstValueFrom` at the WS edge only (appropriate).

## FOUND_BUGS signals

- **BUG-2026-07-14** (bridge subscribe timing / hot `events$`) — **covered** by `pending-events-bridge.ws.test.ts` and harness comment on `runAndWaitForOutput`.
- **BUG-2026-07-21f** (lifecycle unicast vs broadcast) — **covered** by `ws-session-sync.ws.test.ts`.
- **BUG-2026-07-21** (live settle vs reconnect chrome/feed) — **partially covered** by `detachable-long-run.ws.test.ts`; UI chrome stays in unit tests.
- **BUG-2026-07-19d** (Windows `ENOTEMPTY` teardown) — **mitigated** in `temp-project.ts`; no dedicated regression assertion.
- **BUG-2026-07-19c** (preset glob braces) — **covered** by `execute-basic-coder.ws.test.ts`.
- **BUG-2026-07-19** (wired feedback cycle primer) — **covered** by `execute-fake-llm-debate-loop.ws.test.ts`.
- **BUG-2026-06-26h / BUG-2026-06-26d** (reconnect disk reload / multi-tab deltas) — **covered** by `ws-session-sync.ws.test.ts`.
- **Catalog/id false-ready (prior Critical)** — **mitigated 2026-07-22** (composer id alignment + throw on unknown); still rhyme with **BUG-2026-07-21b** if a future gate returns false for “missing” instead of throwing.

## Glue / adapters / parallel types

- **No `*Adapter` / `*Mapper` classes** in this chunk.
- **Re-export shim — resolved (2026-07-22).** Pure wait re-exports removed from `langflower-ws-client.ts`; file keeps integration-local emit/seed/run helpers only. `export type { LangflowerWsClient }` is a type alias for local ergonomics — acceptable.
- **Dual registries — resolved (2026-07-22).** One `WORKFLOW_SCENARIO_COMPOSER`; gates derived via `scenarioNodeTypes(factory())`.
- **Ad-hoc JSON parse shapes** — several suites `JSON.parse(...) as { … }` for demo/fixture docs instead of shared workflow document types (loose parallel types at FS boundary).
- **Harness-only types OK** — `WorkflowScenarioComposerEntry`, `TestServerUrls`, `TestServerHandle` are test infrastructure, not domain mirrors.

## Streamlining & simplifications

- Implement or delete `it.todo` runtime shells in core LLM/HITL matrix files so file names and TESTING.md rows match actual WS proof (see Findings #1).
- Refresh [TESTING.md](../TESTING.md) integration tree, example lifecycle, and LLM matrix to match disk (no `api/` tree, no `openai-mcp-tool-loop.test.ts`, no REST bulk example) — docs-only.
- Optional `withIntegrationHarness` composer for repeated `createTempProject` → `startTestServer` → `createLangflowerWsClient` → `waitSessionReady` → teardown (sibling steps, ~25 files copy the pattern).
- Replace loose `JSON.parse(...) as { … }` in bootstrap/pilot suites with shared load helpers or `satisfies` against known payloads where available.
- Convert module-local `function splitHandle` to `const splitHandle = …` in `workflow-scenario-builders.ts` for style consistency.

## Design-flaw fixes

1. **Scenario catalog identity — addressed 2026-07-22.** One composer id string; `scenarioReadyById` throws on unknown; parity self-test prevents permanent `skipIf` false negatives.
2. **Test server global slot — addressed 2026-07-22.** Handle returned to suite; teardown closes that instance.
3. **Coverage honesty gap (open).** Many execute-* files exist primarily as graph factories + `describe.skipIf` + `it.todo` runtime blocks while TESTING.md and use-case Status readers infer full-chain proof. **Fix direction:** either land runtime assertions (subscribe-before-start harness already exists) or rename/split “graph contract” tests and downgrade TESTING.md matrix rows to “scaffold only”.
4. **Docs vs tree drift (open).** TESTING.md still describes obsolete `api/` REST paths and missing files; misleads agents scaffolding new suites.

## Findings

1. **Severity:** Important  
   **Path / symbol:** `tests/integration/ws/execute-simple.ws.test.ts`, `execute-streaming.ws.test.ts`, `execute-llm-hitl.ws.test.ts`, `execute-hitl-complete.ws.test.ts`, `execute-cancel-hitl.ws.test.ts`, `execute-simple-bootstrap.ws.test.ts`, `execute-structured-output.ws.test.ts`, `execute-agent-mock.ws.test.ts` — runtime `describe.skipIf` blocks contain only `it.todo`  
   **Problem:** [TESTING.md](../TESTING.md) § LLM chain matrix lists these files as proving full execution chains (mock LLM, streaming, HITL feedback, cancel, bootstrap HITL, structured output, agent mock). On disk they assert graph shape only; runtime WS behaviour is unproven. Creates false confidence for use-case Status and regressions.  
   **Proposed fix:** Implement runtime cases using existing harness (`runAndWaitForOutput`, `seedWorkflowFromDisk`, `sendHitlInput`, `interruptRunner`) or mark matrix rows / filenames as scaffold-only until implemented.

2. **Severity:** Important  
   **Path / symbol:** [docs/TESTING.md](../TESTING.md) § Integration tree / example (~L206–215, ~L350–386) vs `tests/integration/` on disk  
   **Problem:** Doc still shows `tests/integration/api/`, `config.ws.test.ts`, `nodes.ws.test.ts`, REST `saveWorkflowBulk` / `loadWorkflowBulk` example, and `openai-mcp-tool-loop.test.ts` — none exist. Agents following the doc invent obsolete layout parallel to the WS-first harness.  
   **Proposed fix:** Rewrite tree, example, and matrix to current `ws/` + helpers layout; drop or relocate REST-bulk example to ADR-012 escape hatch note only.

3. **Severity:** Suggestion  
   **Path / symbol:** repeated `beforeAll` / `afterAll` in ~25 `ws/*.ws.test.ts` (e.g. `execute-smoke.ws.test.ts` L27–37)  
   **Problem:** Same four-step lifecycle copy-pasted; easy to forget `client.close` / handle pass-through / temp rm (some suites already vary `afterEach` interrupt).  
   **Proposed fix:** Optional `withIntegrationHarness` composer listing create → start → connect → ready and reverse teardown — only if it shrinks call sites without hiding per-suite options (`onRunSettled`, multi-client).

4. **Severity:** Suggestion  
   **Path / symbol:** `bootstrap-sample-workflows.test.ts` L28–52; `execute-coding-agent.ws.test.ts` L107; `execute-kb-contradiction-curation.ws.test.ts` L77/L186; `execute-research-fanout.ws.test.ts` L84; `execute-permission-escalation-ops.ws.test.ts` L90 — `JSON.parse(raw) as { … }`  
   **Problem:** Parallel structural types at the FS boundary instead of shared workflow/config parsers or `satisfies` against known payloads.  
   **Proposed fix:** Reuse shared load/validate helpers where they exist, or narrow with bootstrap document types.

5. **Severity:** Suggestion  
   **Path / symbol:** `tests/integration/ws/ws-session-sync.ws.test.ts` L131–132; `execute-review.ws.test.ts`; `execute-router.ws.test.ts`; `execute-resilient.ws.test.ts`; `bootstrap-plan-mock.test.ts` — remaining `it.todo`  
   **Problem:** Honest stubs are fine where runtime is hard; mixed files (some real tests + todos) still leave documented multi-tab / router / resilient behaviours unproven.  
   **Proposed fix:** Implement todos or trim empty runtime shells so Status/docs do not imply WS coverage that is not there.

6. **Severity:** Suggestion  
   **Path / symbol:** `tests/integration/helpers/workflow-scenario-builders.ts` `splitHandle` (~L437)  
   **Problem:** Sole remaining `function` declaration in helpers (module-local, not exported) — inconsistent with project arrow style.  
   **Proposed fix:** `const splitHandle = (handle: string): [string, number] => { … }`.

## Non-issues / looked OK

- No `index.ts` barrels; no `interface` keyword in sampled helpers; no `any`.
- Domain payloads (`WorkflowSavePayload`, `RuntimeEdge`) used directly in builders / scenarios.
- `runAndWaitForOutput` / multi-client pending fan-out correctly treat the bus as hot.
- `autoAllowPermissions` is intentional CI glue for ask-gated tools, not a product adapter.
- Eval CLI gate (`eval-regression-gate.test.ts`) is a clean spawn boundary; WS eval gate suite (`execute-eval-regression-gate.ws.test.ts`) exercises graph assert path in-process.
- MCP bridge test hits real `@langflower/mcp` tools without inventing a second protocol.
- Pilot suites with real runtime proof (`execute-hitl-inputs.ws.test.ts`, `execute-fake-llm-debate-loop.ws.test.ts`, `execute-smoke.ws.test.ts`, `execute-basic-coder.ws.test.ts`, `pending-events-bridge.ws.test.ts`, `detachable-long-run.ws.test.ts`) align with FOUND_BUGS regression intent.
- Prior Critical/Important harness findings (scenario id mismatch, dual registries, wait re-exports, module singleton server, mega `workflow-scenarios.ts`) — **re-verified fixed.**

## Status

Critical=0 Important=2 Suggestion=4
