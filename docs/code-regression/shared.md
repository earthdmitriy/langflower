# Code regression — shared

## Meta

- Paths: `packages/shared/src/`
- Date: 2026-07-22
- Coverage: Full inventory (27 `.ts` files under `src/`; no `hitl/` dir). Deep-read: `langflower-bus-config.ts`, `langflower-ws-waits.ts`, `langflower.ts`, all `types/*`, `execution/derive-run-settle-outcome.ts`, `checkpoint/*`, `langflower-config/*`, `constants/defaults.ts`. Spot-checked `packages/server/src/bridge/emit-bootstrap.ts` and `packages/tools/src/domain/wired-tool-options.parity.test.ts` only to re-verify protocol/parity claims — not reviewed as part of this chunk.

## Principles check

- **PASS — no `index.ts` barrels** — 0 barrel files under `packages/shared/`.
- **PASS — `type` not `interface`** — exported shapes use `type` + `readonly` (`types/*.ts`).
- **PASS — arrow functions only** — no production `function` declarations in `src/` (incl. `resolveUiSchemaOptions`).
- **PASS — no I/O / no framework** — no `fs`, Express, or Angular imports.
- **PASS — RxJS at edges only** — `langflower-ws-waits.ts` uses `firstValueFrom` / `filter` / `take` / `timeout`; no `withLatestFrom`, no `.subscribe` field writes.
- **PASS — runtime type ownership on bus** — `langflower-bus-config.ts` uses `Parameters<RuntimeRunnerApi[…]>`, `RuntimeRunnerEvent`, `RuntimeEdge` directly; no mirror DTO layer.
- **PASS — slim bootstrap contract** — `SessionStateSnapshotPayload`, `bootstrapConfig` JSDoc, and `langflowerWsConfig` state-sync table match `emit-bootstrap.ts` emit order (**re-verified 2026-07-22**).
- **PASS — dead execute protocol removed** — `Execute*` / `ExecutionProgressPayload` gone from `types/langflower-server.ts` (**re-verified 2026-07-22**).
- **PASS — AGENTS layout current** — `packages/shared/AGENTS.md` matches the tree; empty `hitl/` removed (**re-verified 2026-07-22**).
- **FAIL — re-export aggregator** — `langflower.ts` remains a large named re-export facade (`export { … } from './…'`), contrary to [PRINCIPLES.md](../PRINCIPLES.md) § Module exports. Partial mitigation: WS wait helpers no longer re-exported (comment points to `@langflower/shared/langflower-ws-waits`).
- **FAIL — parallel wait APIs** — `requestWorkflowDelete` and `requestWorkflowDeleteSnapshot` are byte-identical; several other `requestWorkflow*` helpers still use predicate-less `take(1)` (see Findings).
- **N/A — thin server / composer entry points** — domain package; no server composers here.

## FOUND_BUGS signals

- **BUG-2026-07-17d** (nullable session facts) — `WorkflowCurrentSnapshotPayload.activeWorkflow: … | null` and JSDoc in `types/langflower-workflow.ts` are correct; residual risk is at UI/server consumers, not shared typing.
- **BUG-2026-07-21b / false-ready context** — still relevant for predicate-less WS waits (`requestWorkflowLoadSnapshot`, `requestWorkflowSaveCurrent`, `requestWorkflowList`); mitigated for session bootstrap via subscribe-before-connect in `waitSessionReady` / `waitSessionSnapshot`.
- **BUG-2026-07-21** (settle projection fork) — `deriveExecutionProgressStatus` in `execution/derive-run-settle-outcome.ts` is the shared-side settle helper; no live/reconnect fork in this chunk.
- **BUG-2026-07-14** (hot bus / missed early frames) — `waitSessionReady` subscribes to `session.ready` before awaiting `connected` (**mitigated**).
- **BUG-2026-07-12a** (stale Vite prebundle) — `langflower.ts` export churn still concentrates cache sensitivity for UI imports of `@langflower/shared/langflower`.
- Router / partial-run / feedback-edge entries citing old `packages/shared/src/execution/*` paths — **no recurrence surface** in this chunk.

## Glue / adapters / parallel types

- **No `*Adapter` / `*Mapper` classes** in this package.
- **Boundary twins (no ADR):** `HARNESS_BUILTIN_TOOL_OPTIONS` / `DOMAIN_PACK_TOOL_OPTIONS` (`resolve-wired-tool-options.ts`) duplicate `@langflower/tools` catalogs because shared cannot import tools in production. Mitigated by `wired-tool-options.parity.test.ts`, but still a manual twin — not an ADR-backed adapter with exit criteria.
- **Near-duplicate workflow metadata** — `WorkflowListEntry` vs `WorkflowMetadata` (`types/langflower-workflow.ts`) share the same field set; semantic comments differ only.
- **Status unions (intentional, not glue)** — `WorkflowCheckpointStatus` lacks `completed_with_errors`; `ExecutionProgressStatus` adds it for feed/settle — deliberate divergence, easy to confuse at call sites.
- **ADR-backed (looked OK):** checkpoint JSON boundary (`toCheckpointJsonValue`, ADR-018) — domain conversion with guards, not a shim layer.
- **`PaletteNodeDefinition`** — `Omit<ReactiveNodeDefinition, 'getInstance'> & { source }` — correct reuse from `@langflower/node-sdk`, not a mirror DTO.

## Streamlining & simplifications

- Delete `requestWorkflowDeleteSnapshot` (or `requestWorkflowDelete`) — they are identical filtered implementations; keep one export, update integration tests.
- Add predicates (or a shared internal `requestThenWait`) for `requestWorkflowSaveCurrent` and `requestWorkflowList`, matching `requestWorkflowLoad` / `requestWorkflowDelete`.
- Continue shrinking `langflower.ts`: migrate high-traffic consumers to `package.json` subpaths and either remove the facade or document an explicit ADR exception.
- Alias `WorkflowListEntry` to `WorkflowMetadata` (or `Pick`) if the shapes stay isomorphic.
- Rename `execution/derive-run-settle-outcome.ts` to match primary export `deriveExecutionProgressStatus`, or rename the export.
- Repoint `package.json` `"."` export at the intentional domain surface (`./langflower`) or drop `"."` and require explicit subpaths.

## Design-flaw fixes

1. **Broadcast snapshot waits without correlation** — multi-tab sessions have no RPC `requestId`; predicate-less `take(1)` helpers can consume another tab’s broadcast. **Fix direction:** one internal composer that always subscribes before `next` and filters on mutation evidence (id absent/present, status flip, etc.); delete duplicate/unfiltered variants; document intentional “next emission” cases like failed load keeping prior active id.
2. **Tool catalog twins in shared** — Inspector allowlists will drift from tools unless parity tests stay green. **Fix direction:** generate options from a tools-owned JSON/constants module re-exported through a test-only or build-time path, or add ADR-019-style exit criteria for the twin with a single owner (`@langflower/tools`).
3. **`langflower.ts` facade** — concentrates export surface and fights the no-aggregator rule. **Fix direction:** explicit subpath exports per domain module; treat `./langflower` as deprecated shim with a removal milestone.

## Findings

1. **Severity:** Important  
   **Path / symbol:** `packages/shared/src/langflower.ts`  
   **Problem:** Package-level re-export aggregator remains the de-facto import path (`@langflower/shared/langflower`) despite PRINCIPLES forbidding re-export shims. WS waits were split out (good), but ~100 lines of named re-exports still centralize churn (BUG-2026-07-12a class).  
   **Proposed fix:** Migrate consumers to concrete subpath exports; shrink or remove `langflower.ts`; if the facade must stay temporarily, add an ADR with exit criteria.

2. **Severity:** Important  
   **Path / symbol:** `packages/shared/src/langflower-ws-waits.ts` — `requestWorkflowDelete`, `requestWorkflowDeleteSnapshot`  
   **Problem:** Both functions are identical (subscribe with id-absent filter, then `next`). Violates “delete obsolete parallel APIs” — doubles maintenance and import confusion.  
   **Proposed fix:** Keep `requestWorkflowDelete`; delete `requestWorkflowDeleteSnapshot` and update `tests/integration/ws/workflows.ws.test.ts`.

3. **Severity:** Important  
   **Path / symbol:** `packages/shared/src/langflower-ws-waits.ts` — `requestWorkflowSaveCurrent`, `requestWorkflowList`  
   **Problem:** Await `take(1)` on broadcast snapshots without a mutation predicate after sending the intent. Under multi-tab load, the first emission may belong to another tab’s mutation (false-ready / wrong-slice class; related to BUG-2026-07-21b). Filtered siblings (`requestWorkflowLoad`, `requestWorkflowDelete`) show the safer pattern.  
   **Proposed fix:** Filter on evidence of _this_ command (e.g. list length change, dirty-status flip) or fold into one internal wait composer.

4. **Severity:** Important  
   **Path / symbol:** `packages/shared/src/langflower-ws-waits.ts` — `requestWorkflowLoadSnapshot`  
   **Problem:** Still predicate-less by design (documented JSDoc): failed/unknown load keeps prior active id, so a success-id filter would hang. Residual multi-tab race remains for tests/MCP callers that only need “any post-intent snapshot”.  
   **Proposed fix:** Accept as documented edge case for single-client tests, or add optional `predicate` parameter; prefer `requestWorkflowLoad` when activation must be verified.

5. **Severity:** Important  
   **Path / symbol:** `packages/shared/src/langflower-config/resolve-wired-tool-options.ts` — `HARNESS_BUILTIN_TOOL_OPTIONS`, `DOMAIN_PACK_TOOL_OPTIONS`  
   **Problem:** Hardcoded tool ids / node-type maps duplicate `@langflower/tools` ownership. Parity test mitigates drift but there is no ADR explaining why the twin stays or when it can be removed.  
   **Proposed fix:** Single owner in tools with a shared-safe export surface, or ADR with exit criteria; keep parity test as gate.

6. **Severity:** Suggestion  
   **Path / symbol:** `packages/shared/src/types/langflower-workflow.ts` — `WorkflowListEntry`, `WorkflowMetadata`  
   **Problem:** Structurally identical readonly shapes — parallel type risk if one diverges silently.  
   **Proposed fix:** `type WorkflowListEntry = WorkflowMetadata` or shared `Pick` base type.

7. **Severity:** Suggestion  
   **Path / symbol:** `packages/shared/package.json` — `exports["."]`  
   **Problem:** Package root resolves to `constants/defaults`, while the real domain surface is `./langflower`. Surprising for newcomers and tooling.  
   **Proposed fix:** Point `"."` at `./langflower` or remove `"."` and require explicit subpaths.

8. **Severity:** Suggestion  
   **Path / symbol:** `packages/shared/src/execution/derive-run-settle-outcome.ts` — file name vs `deriveExecutionProgressStatus` export  
   **Problem:** Navigation tax — primary export name does not match module path.  
   **Proposed fix:** Rename file to `derive-execution-progress-status.ts` (or rename export to match file).

## Non-issues / looked OK

- No `interface`, no `any`, no `index.ts`, no `withLatestFrom`, no `export * from`.
- Dead `Execute*` protocol types confirmed removed; `langflower-server.ts` holds only `SessionReadyPayload` + `ExecutionProgressStatus`.
- Bootstrap JSDoc + state-sync table align with slim `SessionStateSnapshotPayload` and `emit-bootstrap.ts` order (**re-verified, not rubber-stamped**).
- `resolveUiSchemaOptions` — arrow function, exhaustive switch, `node.wiredTools` throws, unit test present.
- `waitSessionReady` / `waitSessionSnapshot` — subscribe-before-connect hot-bus pattern correct.
- Checkpoint helpers (`toCheckpointJsonValue`, `buildWorkflowFingerprint`) — pure, fail-closed, guarded `as` casts at JSON boundary only.
- `mergeLangflowerConfigLayers` / `mergeProviderModelOptions` — straightforward immutable merges.
- `EditorSelectedNodePayload` uses intersection with `WorkflowNodePersisted` — no parallel selected-node DTO.
- Bus partial configs use unique namespace prefixes before spread merge.
