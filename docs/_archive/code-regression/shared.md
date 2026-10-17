# Code regression — shared

## Meta

- Paths: `packages/shared/src/`
- Date: 2026-09-20
- Mode: delta
- Coverage: Full inventory of 35 `.ts` files (same tree as 2026-09-19; 23 production + 12 colocated tests). No `index.ts`. Deep-read: `langflower-ws-waits.ts` + its test, `langflower-config/settings-draft.ts`, `types/langflower-config.ts`, `types/langflower-workflow.ts`, `types/workflow-checkpoint.ts`, `types/langflower-bootstrap.ts`, `types/langflower-editor.ts`, `types/langflower-palette.ts`, `types/langflower-custom-palette.ts`, `types/langflower-server.ts`, `types/langflower-project-bootstrap.ts`, `types/config.ts`, `langflower-config/{resolve-ui-schema-options,resolve-wired-tool-options,merge-langflower-config-layers,secret-id}.ts`, `checkpoint/{json-value,workflow-fingerprint}.ts`, `execution/derive-run-settle-outcome.ts`, `constants/defaults.ts`, `langflower-bus-config.ts` (route tables + state-sync JSDoc). Sampled: remaining config helpers (`parse-default-chat-model`, `merge-provider-model-options`, `resolve-server-logs-enabled`). Adjacent package docs checked only to reconcile finding 7: `packages/shared/package.json`, `packages/shared/README.md`. Leftover check: `langflower.ts`, `mcp-tool-id.ts`, `requestWorkflowDeleteSnapshot`, `waitLangflowerConfigSnapshot`, `enabledToolIds` — all still absent (ts-scan `resolve_symbol` miss). Cross-checked: tools `SystemMcpStdioEntry` owner; server `providerConnectionKey` call sites.
- Previous report: 2026-09-19 — Critical=0 Important=3 Suggestion=4

## Previous findings (delta mode)

| id                               | severity   | status     | evidence                                                                                                                                                                                                                                                                                                                          |
| -------------------------------- | ---------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared-wait-config-snapshot`    | Important  | fixed      | `waitLangflowerConfigSnapshot` is gone. ts-scan `resolve_symbol` from `langflower-ws-waits.ts` returns not found. `list_exports` of that module has no config-snapshot wait. LEDGER closed 2026-09-19.                                                                                                                            |
| `shared-settings-draft-row-id`   | Important  | fixed      | `mergeDraftPatch` matches pending `apiKey` / secret `value` by `row.id.trim()`; empty-id rows do not inherit. `providerConnectionKey` takes `{ id }` and returns `row.id.trim()` (comment: never array index). Server session uses that helper as the connections map key. LEDGER closed 2026-09-19; BUG-2026-09-19c.             |
| `shared-workflow-list-wait`      | Important  | fixed      | `requestWorkflowList` requires a `predicate` (no `() => true` default). Colocated test waits until `workflowId === 'example'` and ignores an empty catalog. LEDGER closed 2026-09-19.                                                                                                                                             |
| `shared-runner-start-runid-wait` | Important  | fixed      | `startRunner` / `startRunnerFromNode` allocate a client `RunId`, send it on the intent, and `filter((id) => id === runId)`. Test emits `'other-run'` first; the helper still returns the sent id. LEDGER closed 2026-09-19. `interruptRunner` still `take(1)` with no run evidence — not re-filed (bundled into this closed row). |
| `shared-mcp-stdio-jsdoc-owner`   | Suggestion | still-open | `LangflowerMcpStdioServerConfig` JSDoc still names common-nodes `SystemMcpStdioEntry`. Owner is tools `create-system-mcp-handles.ts` (ADR-039).                                                                                                                                                                                   |
| `shared-package-root-export`     | Suggestion | still-open | `package.json` `exports["."]` still publishes `constants/defaults`. `packages/shared/README.md` still advertises deleted `src/index.ts`, “Depends on: Nothing”, and `validators` / in-package `common-nodes/`.                                                                                                                    |

## Principles check

- **PASS — no `index.ts` barrels / no re-export aggregator** — 0 barrel files under `packages/shared` (glob). `langflower.ts` stays deleted. `package.json` `exports` publish concrete modules; residual root `"."` is finding `shared-package-root-export`.
- **PASS — `type` not `interface`; `readonly` shapes; arrow functions** — exported domain types use `type`; no production `function` declarations; no `any`; no `export * from`.
- **PASS — no I/O / no framework** — no `fs`, Express, or Angular in this package. Dependencies remain node-sdk, runtime, websocket-bridge, rxjs.
- **PASS — RxJS at edges only** — `langflower-ws-waits.ts` uses `firstValueFrom` / `filter` / `take` / `timeout`. Workflow intents share `requestThenWait` (subscribe → `next` → evidence). No `withLatestFrom`, no `.subscribe` field writes. Bus inbound subjects stay hot; subscribe-before-`next` / subscribe-before-`connected` is unchanged.
- **PASS — runtime type ownership on the bus** — `langflower-bus-config.ts` uses `RuntimeEditorApi` / `RuntimeRunnerApi` / `RuntimeRunnerEvent` / `RuntimeEdge` / `PortTelemetry` in `message<>()`; no mirror DTO layer.
- **PASS — composer entry** — `requestThenWait` is the wait composer; `resolveUiSchemaOptions` is an exhaustive switch; `mergeLangflowerConfigLayers` is a single merge step. `node.wiredTools` still throws as a wrong-API contract.
- **PASS — delete obsolete / zero-consumer export** — `waitLangflowerConfigSnapshot` deleted (previous FAIL). Historical leftovers stay gone.
- **PASS — Settings identity** — pending secrets and connection keys match by provider/secret `id` (previous FAIL). Stale JSDoc on `ProviderConnectionStatus` is a docs leftover, not a second writer.
- **PASS — correlated list / start waits** — list predicate required; start helpers filter the sent `RunId` (previous FAIL).
- **FAIL — `docs-ghost`** — MCP stdio JSDoc still points at common-nodes; Settings `ProviderConnectionStatus` JSDoc still teaches index keys `"0"` / `"1"`; package README still teaches deleted `src/index.ts`.

## FOUND_BUGS signals

- **BUG-2026-09-19c** (Settings draft index identity) — **fixed in this package**, not a recurrence. Mechanism was index-keyed `mergeDraftPatch` / `providerConnectionKey`; both now key by `row.id`. Residual is JSDoc only (`shared-connection-status-index-jsdoc`).
- **BUG-2026-07-17d** (nullable session facts) — `WorkflowCurrentSnapshotPayload.activeWorkflow: … | null` still correct. Residual risk is at consumers, not shared typing.
- **BUG-2026-07-14** (hot bus / missed early frames) — `waitSessionReady` / `waitSessionSnapshot` still subscribe before `connected`. Intent helpers still subscribe before `next`.
- **Uncorrelated broadcast waits** — list / start helpers now carry evidence. `requestWorkflowLoadSnapshot` next-emission default remains the documented failed-load exception. Not a rubber-stamp of BUG-2026-07-21b (`startWith` + `withLatestFrom`).
- **BUG-2026-07-12a** (stale Vite prebundle of `@langflower/shared`) — aggregator `langflower.ts` / `index.ts` stay deleted. Residual surface is package `"."` + README (finding 7), not a restored aggregator.
- **BUG-2026-07-21** (settle projection fork) — `deriveExecutionProgressStatus` remains the shared-side settle helper; no live/reconnect fork in this chunk.
- **BUG-2026-07-19b** (`enabledToolIds`) — no shared leftover. Runtime `permission` ≠ node `toolPermissions`.
- Router / partial-run entries citing deleted `packages/shared/src/execution/*` or `validators/connection-validator.ts` — **no recurrence surface** in this tree.

## Glue / adapters / parallel types

- **No `*Adapter` / `*Mapper` classes** in this package.
- **ADR-039 twins (keep; do not merge by import):**
    - `HARNESS_BUILTIN_TOOL_OPTIONS` / `DOMAIN_PACK_TOOL_OPTIONS` vs tools `BUILTIN_TOOL_IDS` / `*_TOOL_CONFIGS` — parity `packages/tools/src/domain/wired-tool-options.parity.test.ts`.
    - `langflower-config/secret-id.ts` vs tools `secrets/secret-id.ts` — comment names ADR-039; shared is the inspector/jsonc owner.
    - `LangflowerMcpStdioServerConfig` / `LangflowerMcpHttpServerConfig` vs tools `SystemMcpStdioEntry` / `SystemMcpHttpEntry` — structural; no mapper. Shared JSDoc still names the wrong package (finding `shared-mcp-stdio-jsdoc-owner`).
    - `CustomPalettePackError` / `PaletteCompilationDiagnostic` vs compiler `CompilePackError` / `CompileDiagnostic` — WS copy; JSDoc cites ADR-039.
- **Not glue:** `PaletteNodeDefinition` is `Omit<ReactiveNodeDefinition, 'getInstance'> & { source }`. `EditorSelectedNodePayload.node` is `WorkflowNodePersisted & { definition }`. `toCheckpointJsonValue` (ADR-018) is a fail-closed JSON boundary.
- **Not a twin:** `WorkflowListEntry` vs `WorkflowMetadata` (ADR-029 identity off disk metadata).
- **`ToolConfig` vs `LangflowerToolConfig`** — different documents; names collide, shapes do not.

## Streamlining & simplifications

none

## Design-flaw fixes

none

## Findings

1.  - id: `shared-mcp-stdio-jsdoc-owner`

- class: docs-ghost
- severity: Suggestion
- first-seen: 2026-09-19
- status: open
- path: `packages/shared/src/types/langflower-config.ts` — `LangflowerMcpStdioServerConfig`
- evidence: JSDoc still says “Structural twin of common-nodes `SystemMcpStdioEntry`”. ts-scan resolves `SystemMcpStdioEntry` to `packages/tools/src/mcp/create-system-mcp-handles.ts`, whose comment names the shared type as the twin. common-nodes has no such export from a shared-relative resolve.
- proposed fix: Point the comment at tools `SystemMcpStdioEntry` / ADR-039.

2.  - id: `shared-package-root-export`

- class: docs-ghost
- severity: Suggestion
- first-seen: 2026-09-19
- status: open
- path: `packages/shared/package.json` `exports["."]` + `packages/shared/README.md` (package root; not `src/` body)
- evidence: After `langflower.ts` deletion the published root still exists (`"."` → `constants/defaults`). README still teaches deleted `src/index.ts`, “Depends on: Nothing”, `validators`, and in-package `common-nodes/`. That is the remaining BUG-2026-07-12a-class doc surface, not a restored aggregator.
- proposed fix: Fix the README to match AGENTS.md (concrete `exports`, real dependencies). Optional: remove or un-document `"."` so only concrete subpaths are importable.

3.  - id: `shared-connection-status-index-jsdoc`

- class: docs-ghost
- severity: Suggestion
- first-seen: 2026-09-20
- status: open
- why-new: Leftover JSDoc after `shared-settings-draft-row-id` / BUG-2026-09-19c. The 2026-09-19 report described index keys as accurate; the implementation now keys by `row.id`, so the type comment teaches the deleted rule.
- path: `packages/shared/src/types/langflower-config.ts` — `ProviderConnectionStatus`
- evidence: Comment still says “Keyed by draft row index string (`"0"`, `"1"`, …)”. `providerConnectionKey` now returns `row.id.trim()` and documents “never array index”. Server session stores connections under that id key.
- proposed fix: Say the map is keyed by provider `id` (empty-id rows have no connection key).

## Non-issues / looked OK

- LEDGER closed — do not reopen: `shared-wait-config-snapshot`, `shared-settings-draft-row-id`, `shared-workflow-list-wait`, `shared-runner-start-runid-wait`, `legacy-workflow-delete-snapshot-wait` (`requestWorkflowDeleteSnapshot` still absent), `legacy-client-ws-port-fallback` (no client `/ws` + `4010` fallback in this package; `DEFAULT_PORT` / registry transport defaults remain the shared source of truth).
- `interruptRunner` still `take(1)` after `runner.interrupt.requested` with no `RunId` filter. Left as residual of the closed start-wait row; not a new mechanism.
- `requestWorkflowLoadSnapshot` next-emission default is still documented (failed load keeps prior active id). Test covers that path.
- `waitExecutionFeedSnapshot` / `waitBusEvent` default `() => true` are generic “next event” helpers, not request/reply composers.
- `waitSessionReady` / `waitSessionSnapshot` subscribe-before-connect still correct for hot inbound subjects.
- `resolveUiSchemaOptions` exhaustive switch; `node.wiredTools` throws to the graph helper (wrong-API, not a Result case).
- Checkpoint helpers and config layer merge — pure, fail-closed JSON boundary, immutable spread. Nested `mcp` / `permission` / `harness` replace as whole top-level keys; provider map is the only deep merge.
- `PaletteNodeDefinition` / editor payloads reuse owner types. Dead `Execute*` protocol types remain gone; `langflower-server.ts` is still `SessionReadyPayload` + `ExecutionProgressStatus`.
- `packages/shared/AGENTS.md` layout list matches the tree today.
- Cursor rule `shared-domain.mdc` still names `validators/connection-validator.ts` / `canConnectPorts` — docs/rule drift, not a `src/` leftover.
- No `interface`, no `withLatestFrom`, no `export * from`.
