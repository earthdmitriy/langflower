# Code regression — server-core

## Meta

- Paths: `packages/server/src/` excluding `bridge/` and `websocket/` (`bootstrap/`, `checkpoint/`, `config/`, `harness/`, `palette/`, `session/`, `skills/`, `utils/`, `workflow/`, `create-server.ts`, `server-context.ts`)
- Date: 2026-07-22
- Coverage: Full inventory of ~45 production/test modules in the chunk. Deep read: `server-context.ts`, `create-server.ts`, `session/*`, `workflow/{activate,load,copy,create-empty,apply-editor-mutation,workflow.service,workflow-document,rename,build-save-current-payload}`, `checkpoint/*`, `config/{langflower-config.service,resolve-provider-credentials,redact-langflower-config,config.service}`, `palette/palette.service.ts`, `skills/*`, `harness/pending-permission-asks.ts`, `bootstrap/project-bootstrap.service.ts`. Re-verified prior report findings (2026-07-21/22 fixes). `bridge/` out of scope except as consumer of these composers.

## Principles check

- **Thin server — PASS:** No `kb/` / `crawl/` / `mcp/` / `llm/` domain trees under `packages/server/src/`. Checkpoint FS (`.langflower/runs/`), skills catalog (`.langflower/skills/`), config/secrets redact, workflow CRUD, palette strip, and HITL permission registry match `packages/server/AGENTS.md`. Only type import from `@langflower/tools` is `PermissionAskRequest` in `harness/pending-permission-asks.ts` (WS pause/reply boundary). Domain factories stay in tools/common-nodes (injected from bridge, not reimplemented here).
- **Immutability — PASS (session bag exception):** Editor topology sync returns new graph objects via spread; `LangflowerSession` holds mutable run/session fields by design (single in-process session bag).
- **RxJS folds — PASS (N/A mostly):** Only session-owned `status$.subscribe` for MCP dispose / permission deny-all (`session/langflower-session.ts`). No `withLatestFrom` in this chunk. Handler subscriptions live under `bridge/` (out of scope).
- **Feature-sliced / composers — PASS:** Workflow activate/load/copy/create/rename and editor mutators document sibling steps; `activateWorkflowInSession` and `applyEditorAddNode` list explicit call order.
- **No barrels (`index.ts`) — PASS:** No `index.ts` in `packages/server/`; public entry via `package.json` exports `./create-server`, `./bootstrap`, `./server-context`.
- **`type` not `interface` — PASS:** Local contracts use `type` (`ServerContext`, checkpoint load results, `ResolveNodeDefinition`, etc.).
- **Arrow functions — FAIL (style):** Residual `export function` / `function` in `create-server.ts`, `bootstrap/project-bootstrap.service.ts`, `session/build-session-bootstrap.ts`, `session/build-selected-node-payload.ts`, `workflow/build-save-current-payload.ts`, `utils/parse-jsonc.ts`, and many internal helpers in `config/langflower-config.service.ts` (workflow/palette/server-context already mostly arrows).
- **Prepare-then-mutate — PASS:** `WorkflowService.list` uses filter → map → filter → sort; editor composers prepare payloads then mutate editor once, then sync session.
- **Dead / obsolete parallel APIs — PASS:** No `toPersistedFile`, `upsertActiveWorkflowNode`, activate-local default resolver, `routerChannels` on server `ResolveNodeDefinition`, or palette fake-compile error path.

## FOUND_BUGS signals

- **BUG-2026-07-22c** (editor ↔ session dual-write) — **mitigated here:** `syncActiveWorkflowTopologyFromEditor` is the single writer after editor mutations; regression in `apply-editor-mutation.test.ts`. Do not reintroduce parallel edge/node helpers.
- **BUG-2026-07-22b / BUG-2026-07-20** (bypass slot identity) — residual in this chunk: `RunCheckpointSession.observe` keys ports by `event.portId` string; `resumeOptionsFromCheckpoint` unwraps `snap.value` with branded `as RunId` / `as NodeId[]`. Relies on runtime emitting canonical ids (`bypass-ports` in runtime); server must not invent a second encoding.
- **BUG-2026-07-17** (feed-clear mid-run) — gate lives in bridge clear handler; session test documents `runnerStatus === 'running'` as the fact source — no special-case folds here.
- **BUG-2026-07-17d** (nullable active workflow) — session `activeWorkflow: … | null`; delete paths must stay null-safe in bridge/UI (outside this chunk).
- **BUG-2026-07-19d** (Windows checkpoint FS lifetime) — `RunCheckpointSession.persistChain` serializes disk writes; teardown flake remains harness/integration-side.
- **BUG-2026-07-21f** (multi-tab run gate) — session holds shared `runnerStatus` / `runId`; broadcast ownership is bridge/WS.

## Glue / adapters / parallel types

- No `*Adapter` / `*Mapper` classes in this chunk.
- **Soft glue (acceptable):** `toPaletteDefinition` strips `getInstance` for WS palette payloads (`palette/palette.service.ts`); `redactLangflowerConfigForBridge` strips secrets before bootstrap/snapshot (`config/redact-langflower-config.ts`); `stripBridgeOnlyProviderFields` drops UI-only `hasApiKey` on config save (`config/langflower-config.service.ts`).
- **Parallel resolver contract (latent):** `ResolveNodeDefinition` accepts `{ type, params }`, but `server-context.ts` `defaultResolveDefinition` and `@langflower/common-nodes` `resolveWorkflowNodeDefinition` both ignore `params` today. Not a live bug until per-instance ports land; same class as the addressed activate/context split.
- ADR-backed adapters: none in this chunk (LLM bind / execution ctx composer are under `bridge/`).

## Streamlining & simplifications

- Thread `params` through `defaultResolveDefinition` → `resolveWorkflowNodeDefinition` when common-nodes gains per-instance resolution (single change across both packages).
- Remove unused `projectDir` parameter from `materializeRuntimeNode` (`workflow/apply-editor-mutation.ts`) or use it when instance bind needs project context.
- Inline `listResumableCheckpoints` into its sole bridge caller if it stays a fingerprint + `store.listResumable` one-liner.
- Collapse repeated `isRecord` helpers in `config/` + `checkpoint/` into one local util when touching those files.
- Convert remaining `function` declarations to arrows on touch (especially exported composers in `create-server.ts`, `build-session-bootstrap.ts`).
- Narrow `resumeOptionsFromCheckpoint` branded ids via runtime brand helpers or shape validation instead of bare `as`.

## Design-flaw fixes

1. **Resolver params ignored (latent)** — `ResolveNodeDefinition` and editor materialize/validate paths already pass `params`; default resolver and catalog lookup do not. When `WorkflowNodePersisted` gains per-instance channels/ports, validate-on-load and materialize-on-edit could diverge silently. Fix both `server-context.ts` and `common-nodes/resolve-workflow-node-definition.ts` together.
2. **Editor ↔ session topology (addressed)** — Live path: mutate `RuntimeEditor`, then `syncActiveWorkflowTopologyFromEditor`. Load path: document → editor via `bindWorkflowToSessionEditor`. Keep this direction explicit; do not add session-first topology writes.
3. **Checkpoint resume boundary (monitor)** — Port keys in checkpoints must stay aligned with runtime `bypass-ports` helpers; any server-side port-id formatting would re-open BUG-2026-07-20 class bugs.

## Findings

1. **Severity:** Critical — **addressed (epic 28, 2026-07-21; re-verified 2026-07-22)**  
   **Path / symbol:** ~~`packages/server/src/index.ts`~~  
   **Problem:** Package-root barrel re-exported entry symbols; PRINCIPLES forbid `index.ts`.  
   **Fix applied:** Barrel deleted; concrete `package.json` subpath exports only.

2. **Severity:** Important — **addressed (2026-07-22; re-verified)**  
   **Path / symbol:** `workflow/load-workflow-into-session.ts`, `copy-workflow-to-session.ts`, `create-empty-workflow-in-session.ts` → `activateWorkflowInSession`; `server-context.ts`  
   **Problem:** Activate paths fell back to activate’s incomplete local default resolver instead of `ServerContext.resolveDefinition`.  
   **Fix applied:** Required `resolveDefinition` on activate/load/copy/create; single `defaultResolveDefinition` only in `createServerContext`.

3. **Severity:** Important — **addressed (2026-07-22; re-verified)**  
   **Path / symbol:** `workflow/workflow-document.ts` — `ResolveNodeDefinition`; `server-context.ts`  
   **Problem:** Dead `routerChannels` parallel contract on server resolver type.  
   **Fix applied:** Removed from server `ResolveNodeDefinition` until persisted nodes carry per-instance channels.

4. **Severity:** Important — **addressed (2026-07-22; re-verified, BUG-2026-07-22c)**  
   **Path / symbol:** `workflow/apply-editor-mutation.ts` — `syncActiveWorkflowTopologyFromEditor`  
   **Problem:** Separate helpers updated editor and session document; missed dual-write diverged save vs run.  
   **Fix applied:** Single-writer sync from editor after every topology mutation; old upsert/edge helpers deleted.

5. **Severity:** Important — **addressed (2026-07-22; re-verified)**  
   **Path / symbol:** `palette/palette.service.ts` — `PaletteService.reload`  
   **Problem:** Fake “not implemented” error when `.langflower/nodes` existed — obsolete parallel API.  
   **Fix applied:** System catalog only; user sources ignored until real compilation exists elsewhere.

6. **Severity:** Important  
   **Path / symbol:** `server-context.ts` — `defaultResolveDefinition`; `@langflower/common-nodes` — `resolveWorkflowNodeDefinition`  
   **Problem:** `ResolveNodeDefinition` and call sites (`apply-editor-mutation.ts`, `build-selected-node-payload.ts`) pass `{ type, params }`, but the default resolver and catalog lookup only use `type`. Latent bind/validate split when per-instance resolution depends on `params`.  
   **Proposed fix:** Forward `node.params` in `defaultResolveDefinition`; extend common-nodes resolver in the same change when instance-aware definitions ship.

7. **Severity:** Suggestion — **addressed (2026-07-22; re-verified)**  
   **Path / symbol:** ~~`workflow/workflow-document.ts` — `toPersistedFile`~~  
   **Problem:** Identity glue before save.  
   **Fix applied:** Deleted; `WorkflowService.save` serializes `document` directly.

8. **Severity:** Suggestion — **addressed (2026-07-22; re-verified)**  
   **Path / symbol:** `workflow/workflow.service.ts` — `list`  
   **Problem:** Built list entries inside `for` + `continue`.  
   **Fix applied:** filter → map → filter → sort.

9. **Severity:** Suggestion  
   **Path / symbol:** Chunk-wide `function` declarations (`create-server.ts`, `bootstrap/project-bootstrap.service.ts`, `session/build-session-bootstrap.ts`, `session/build-selected-node-payload.ts`, `workflow/build-save-current-payload.ts`, `utils/parse-jsonc.ts`, `config/langflower-config.service.ts` internals)  
   **Problem:** Violates PRINCIPLES/AGENTS arrow-function norm.  
   **Proposed fix:** Convert on touch; no behavior change.

10. **Severity:** Suggestion  
    **Path / symbol:** `config/langflower-config.service.ts`, `config/redact-langflower-config.ts`, `config/resolve-provider-credentials.ts`, `checkpoint/workflow-checkpoint-store.ts` — local `isRecord`  
    **Problem:** Same guard copied four times.  
    **Proposed fix:** One shared local guard (e.g. `utils/is-record.ts`) when next editing config/checkpoint — only if two+ consumers remain after touch.

11. **Severity:** Suggestion  
    **Path / symbol:** `checkpoint/list-resumable-checkpoints.ts` — `listResumableCheckpoints`  
    **Problem:** Thin fingerprint wrapper over `WorkflowCheckpointStore.listResumable`.  
    **Proposed fix:** Inline at sole bridge caller or keep until a second caller appears.

12. **Severity:** Suggestion  
    **Path / symbol:** `checkpoint/run-checkpoint-session.ts` — `resumeOptionsFromCheckpoint` (`as RunId` / `as NodeId[]`)  
    **Problem:** Branded id casts at resume boundary; can paper over identity mismatches (BUG-2026-07-20 class).  
    **Proposed fix:** Narrow via runtime brand constructors or validate string shapes before cast.

13. **Severity:** Suggestion  
    **Path / symbol:** `workflow/apply-editor-mutation.ts` — `materializeRuntimeNode` (`projectDir` parameter)  
    **Problem:** `projectDir` is accepted but never used — dead API surface on a hot bind path.  
    **Proposed fix:** Drop the parameter from materialize/bind call chain, or wire it when instance bind needs project context.

## Non-issues / looked OK

- Thin-server placement for checkpoint store, skills FS catalog, config redact/credentials, and `PendingPermissionAsks` matches AGENTS allowed ownership.
- Workflow composers (`activate` / `copy` / `rename` / editor apply*) list sibling steps; no hidden A→B→C chains inside those files.
- Domain types for workflows, config, checkpoints, palette payloads come from `@langflower/shared/langflower` — no parallel domain mirrors invented in-session.
- `resolveProviderCredentials` correctly stays server-only (env expansion); never exposed on bridge payloads.
- Checkpoint `persistChain` + atomic write address Windows rename races without growing domain logic.
- No `interface` keyword in production types sampled; no `withLatestFrom` in this chunk.
- `ConfigService` (`config.json` port) vs `LangflowerConfigService` (`langflower.jsonc`) are distinct files/purposes, not duplicate parsers of the same document.
- `renameActiveWorkflow` partial-save semantics (disk graph vs dirty in-memory) are intentional and documented.

## Status

Report: `docs/code-regression/server-core.md`  
Critical=0 Important=1 Suggestion=5
