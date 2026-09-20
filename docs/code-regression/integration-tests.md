# Code regression — integration-tests

## Meta

- Paths: `tests/integration/`
- Date: 2026-09-20
- Mode: delta
- Coverage: Reconciled every 2026-09-19 finding against the live tree. Re-read harness (`helpers/temp-project.ts`, `test-server.ts`, `workflow-scenarios.ts`, `workflow-scenario-registry.ts`, `workflow-scenario-builders.ts`, `workflow-scenario-composer.test.ts`) and WS client (`ws/langflower-ws-client.ts`). Sampled `helpers/scenarios/{smoke,fake-llm,hitl,eval,agents-pilots}.ts` and live suites: `execute-coding-agent.ws.test.ts`, `execute-permission-escalation-ops.ws.test.ts`, `execute-research-fanout.ws.test.ts`, `ws-session-sync.ws.test.ts`, `workflows.ws.test.ts`, `custom-palette-compile-tool.ws.test.ts`. Cross-checked [TESTING.md](../TESTING.md), [tests/README.md](../../tests/README.md), FOUND_BUGS encodings cited last run, LEDGER Closed/Wontfix (none for this chunk). `tests/integration/` has no `tsconfig.json`; ts-scan `resolve_symbol` / `list_exports` fail with “No tsconfig.json found above …”. Consumer checks used ripgrep on known paths (degraded fallback). Not a line-by-line pass of every `execute-*.ws.test.ts` assertion or the full `agents-pilots.ts` graphs.
- Previous report: 2026-09-19 — Critical=0 Important=2 Suggestion=4 (numbered items; no `id`/`class` fields — ids assigned here)

## Previous findings (delta mode)

| id                              | severity   | status     | evidence                                                                                                                                                                                                                               |
| ------------------------------- | ---------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `integration-docs-ghost-matrix` | Important  | fixed      | Closed 2026-09-20 — see LEDGER.                                                                                                                                                                                                        |
| `integration-concat-node-dead`  | Suggestion | still-open | `helpers/workflow-scenario-builders.ts` still exports `concatNode`. Ripgrep: only that definition under `tests/integration/`. Catalog `concatNode` in `packages/common-nodes` is a different symbol. No new importer since 2026-09-19. |

## Principles check

- **PASS — no `index.ts` barrels** under `tests/integration/`.
- **PASS — `type` not `interface`** — harness types stay `type` (`TestServerUrls`, `TestServerHandle`, `WorkflowScenarioComposerEntry`, `CreateTempProjectOptions`).
- **PASS — no `any`** in sampled helpers / suites; FS/JSON edges use `unknown` + narrow casts.
- **PASS — domain types reused** — graphs are `WorkflowSavePayload` / `WorkflowNodePersisted` / `RuntimeEdge`; waits import `LangflowerWsClient` from `@langflower/shared/langflower-ws-waits`.
- **PASS — composer entry point** — one `WORKFLOW_SCENARIO_COMPOSER`; `scenarioReadyById` throws on unknown id and missing catalog types (no `skipIf`).
- **PASS — delete-obsolete leftovers from U stayed gone** — no `it.todo` / `skipIf`, no `mock-agent` factories, no `execute-simple` / `execute-llm-hitl` / `execute-review` shells, no `tests/fixtures/workflows/`, no `getWorkflowFixturesDir`, no `tests/integration/api/` / `saveWorkflowBulk`.
- **PASS — suite-scoped server** — `startTestServer` returns `TestServerHandle`; `stopTestServer(handle)` closes that instance.
- **PASS — subscribe-before-start** — `runAndWaitForOutput` and sampled execute suites subscribe before `runner.start.requested` (BUG-2026-07-14).
- **PASS — WS wait ownership** — suites import waits from `@langflower/shared/langflower-ws-waits`; local file is emit/seed/run + `autoAllowPermissions`.
- **PASS — no `withLatestFrom`** in this chunk.
- **PASS — `docs-ghost` matrix.** TESTING.md / `tests/README.md` match live `execute-*.ws.test.ts` and fixtures (LEDGER `integration-docs-ghost-matrix`, 2026-09-20).
- **FAIL — `dead-export`** — unused builder `concatNode` (`integration-concat-node-dead`).

## FOUND_BUGS signals

none

Sampled suites still encode the cited regressions (subscribe-before-start, session broadcast, detach settle, Plan-write ask, debate loop, pending fan-out, Fake LLM path). Those are locks, not same-mechanism recurrences. No new BUG id applies to this harness.

## Glue / adapters / parallel types

none

Not glue: `autoAllowPermissions` (CI Allow for ask-gated tools); emit/wait helpers that pair intent + fact; `createLangflowerWsClient` wrapping `createClient`. Thin type re-exports (`LangflowerWsClient`, `WorkflowScenarioComposerEntry`) are aliases, not barrels. Fake CI graphs vs demo real-LLM JSON are an intentional provider substitution, not an ADR-039 twin (see Previous findings). `waitViewportSnapshot` remains one connect helper next to shared session waits — do not grow a second wait library here.

## Streamlining & simplifications

Delete unused `concatNode` in `helpers/workflow-scenario-builders.ts` (no integration importer). That is the open `dead-export` finding.

## Design-flaw fixes

none

## Findings

1.  - id: `integration-concat-node-dead`

- class: dead-export
- severity: Suggestion
- first-seen: 2026-09-19
- status: open
- path: `tests/integration/helpers/workflow-scenario-builders.ts` `concatNode`
- evidence: Exported builder has no importer under `tests/integration/` (ripgrep: definition only). Catalog `concatNode` in common-nodes is a different symbol. Dead after the “delete obsolete” pass.
- proposed fix: Delete it until a scenario needs `common-concat`.

## Non-issues / looked OK

- Historical U leftovers stayed deleted: no `it.todo` / `skipIf` graveyard, no mock-agent modules, no `tests/fixtures/workflows/`, no REST `api/` tree.
- Composer + catalog gate still throw (unknown id and missing types). Self-test still rejects deleted palette types (`common-agent` / `common-dialog` / `common-throw` / `common-triple`).
- `workflowScenarioById` is used by the composer self-test.
- Fake CI vs demo real-LLM graphs are an explicit substitution, not an ADR-039 twin.
- Local Vitest timeouts and copied harness / `GREET_SOURCE` are working copies, not listed classes.
- Handle-scoped `stopTestServer`; Windows `removeTempProject` retry for `ENOTEMPTY`/`EBUSY`/`EPERM`/`EACCES`.
- `createTempProject` writing harness-only `example.json` (skeleton does not seed it) is documented and used by editor/session suites.
- Eval CLI gate vs in-process WS gate remain different edges (spawn vs graph).
- MCP bridge uses `@langflower/mcp` tools in-process; no second protocol.
- Sampled FOUND_BUGS pilots (Fake LLM, ask_user, Review Gate, pending fan-out, detach settle, basic-coder Plan write, session broadcast) still match their cited paths.
- LEDGER Closed 2026-09-20: `integration-docs-ghost-matrix`. Do not reopen without a new mechanism.
