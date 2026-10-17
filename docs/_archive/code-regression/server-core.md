# Code regression — server-core

## Meta

- Paths: `packages/server/src/` excluding `bridge/` — `bootstrap/`, `checkpoint/`, `config/`, `create-server.ts`, `harness/`, `palette/`, `session/`, `skills/`, `workflow/`, `listen-http-server.ts`, `server-context.ts`
- Date: 2026-09-20
- Mode: delta
- Coverage: Representative re-read of production files (not every test assertion). Deep-read: `create-server.ts`, `server-context.ts`, `config/{langflower-config.service,config.service,resolve-provider-credentials,resolve-draft-provider-credentials,langflower-secrets}`, `session/{langflower-session,settings-draft-session,reset-session-execution-feed}`, `workflow/{workflow.service,workflow-document,load-workflow-into-session,activate-workflow-in-session,copy-workflow-to-session,create-empty-workflow-in-session,rename-active-workflow,apply-editor-mutation (head)}`, `checkpoint/{run-checkpoint-session,workflow-checkpoint-store,list-resumable-checkpoints}`, `palette/custom-palette.service`, `harness/pending-permission-asks`, `skills/read-skill-markdown`, `bootstrap/{project-bootstrap.service,copy-force,resolve-skeleton-root}`. ts-scan: `copyWorkflowToSession`, `parseWorkflowDocument`, `runnerStatus` refs (session write + bridge writes), `CustomNodeRegistry` exports, `ConfigService` exports, `toPackErrors` (unresolved), `CustomNodeRegistry.clear` (unresolved). Leftover check: `langflower.ts` absent under `packages/server`. `bridge/` sampled only as consumer of `runnerStatus` (out of chunk).
- Previous report: 2026-09-19 — Critical=0 Important=3 Suggestion=3 (numbered items; kebab ids assigned here for ledger stability)

## Previous findings (delta mode)

| id                                      | severity  | status     | evidence                                                                                                                                                                                                                                                              |
| --------------------------------------- | --------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server-core-config-read-fail-open`     | Important | fixed      | Closed 2026-09-20 — see LEDGER.                                                                                                                                                                                                                                       |
| `server-core-runner-status-two-writers` | Important | still-open | Session constructor still copies `status$` into `runnerStatus`. ts-scan writes: `langflower-session.ts:74` plus `wire-runner-handlers.ts` `= 'running'` / `= 'idle'` (four sites). `isGraphLocked` / `buildExecutionFeed` still read the copy.                        |
| `server-core-draft-credentials-twin`    | Important | still-open | `resolve-draft-provider-credentials.ts` still declares its own `ENV_REF_PATTERN`, `resolveEnvRef`, `ResolvedCredentials`, and `ResolveDraftProviderCredentialsResult`. Owner `resolve-provider-credentials.ts` still does not export `resolveEnvRef`. Not in ADR-039. |

## Principles check

- **PASS — thin server / ADR-014.** No `src/{kb,crawl,mcp,llm,api}/`. Harness files are WS HITL pause/reply registries only. Skills are `.langflower/skills/` catalog / markdown read. Checkpoints stay under `.langflower/runs/`. Config/secrets bind and redact stay here. Session holds an MCP dispose hook only (`LangflowerSession.setMcpDispose`).
- **PASS — leftover bundler vs `@langflower/compiler`.** No `esbuild`, no `compileProjectNodes`, no `node-compile/`, no `toPackErrors` (ts-scan unresolved), no `palette/compile-and-hot-swap-custom-nodes.ts`. `createServer` warms via `CustomPaletteService.update` → `loadProjectNodes`. Hot-swap composer stays in `bridge/` (out of chunk).
- **PASS — no barrels / `withLatestFrom`.** No `index.ts` under `packages/server`. No `withLatestFrom` in this chunk. Public exports remain `./create-server`, `./bootstrap`, `./server-context`.
- **PASS — composer entry points.** `createServer` (context → warm palette → HTTP → bridge → listen), `activateWorkflowInSession`, `loadWorkflowIntoSession`, `copyWorkflowToSession`, `seedSkeletonContent` stay flat sibling lists.
- **PASS — delete obsolete / LEDGER leftover.** `langflower.ts` stayed deleted (`legacy-langflower-ts-entry`). Also still gone: `toPackErrors`, `utils/parse-jsonc.ts`, `ConfigService.write` (class exports `read` only), `CustomNodeRegistry.clear` (`setNodes` / `get` only).
- **PASS — reuse owner types / ADR-039.** Workflow / config / palette / checkpoint payloads use `@langflower/shared` concrete subpaths. Soft glue kept: `toPaletteDefinition` (JSON-safe palette), `redactLangflowerConfigForBridge` (secrets). Pack errors assigned as `loaded.errors` (no mapper).
- **PASS — HITL correlation.** `PendingPermissionAsks.reply` keys by `askId` and checks `runId` — not an uncorrelated wait.
- **PASS — checkpoint I/O Results.** `WorkflowCheckpointStore.load` still splits `NOT_FOUND` / `CORRUPT`. List marks corrupt rows instead of dropping the catalog.
- **PASS — `fail-open-io` on config read.** ENOENT vs INVALID; merge writes do not clobber an unparsed file (LEDGER `server-core-config-read-fail-open`, 2026-09-20).
- **FAIL — `two-writers`.** `runnerStatus` is still a writable mirror with session subscribe + bridge assigns (`server-core-runner-status-two-writers`).
- **FAIL — `twin-without-adr`.** Draft credential probe still copies `{env:VAR}` resolution (`server-core-draft-credentials-twin`).

## FOUND_BUGS signals

none

Same-mechanism checks (not new findings):

- **BUG-2026-07-29** (compile on every WS connect) — does not recur on the start path. `createServer` → `warmCustomPalette` → `loadProjectNodes` before listen.
- **BUG-2026-07-22c** (editor ↔ session dual-write) — topology does not recur. Load path is `bindWorkflowToSessionEditor` then session assign; live edits go through `syncActiveWorkflowTopologyFromEditor`. Analog remains on `runnerStatus` (Finding `server-core-runner-status-two-writers`).
- **BUG-2026-09-19** (overlapping start rollback) — token lives in `bridge/wire-runner-handlers.ts` (out of chunk). This chunk still supplies the copied `runnerStatus` field those handlers write.
- **BUG-2026-09-19c** (settings draft index identity) — does not recur. `applyDraftPatch` / `idleConnectionsForDraft` key by `providerConnectionKey(row)` / `row.id`.
- **BUG-2026-06-25** (corrupt file empties catalog) — `WorkflowService.list` still skips unreadable/unparsable files instead of failing the whole list.
- **Workflow parse-as-not-found (closed in AC)** — `WorkflowService.load` still splits `ENOENT` → `NOT_FOUND` vs JSON/parse → `INVALID_GRAPH`. Config read now uses the same split (LEDGER 2026-09-20).

## Glue / adapters / parallel types

- **No `*Adapter` / `*Mapper` / `*Bridge` types** by name in this chunk.
- **Identity pack-error mapper — still gone.** `CustomPaletteService.update` assigns `loaded.errors` directly. Shared WS snapshot types stay the DAG twin (ADR-039).
- **Soft, keep:** `toPaletteDefinition` (strip `getInstance` / `inferTypeFrom` for BUG-2026-07-29 JSON-safe palette); `redactLangflowerConfigForBridge` (secrets off the bus); `withSkillsCatalog` (FS catalog onto in-memory config).
- **Unnecessary glue (still open):** `resolve-draft-provider-credentials.ts` copies `ENV_REF_PATTERN` + `resolveEnvRef` and declares twin Result / credentials types next to `resolve-provider-credentials.ts` (`server-core-draft-credentials-twin`).
- **`ConfigService` vs `LangflowerConfigService`** — two documents (`config.json` port vs `langflower.jsonc`), not two parsers of one file. Port `write` still deleted.

## Streamlining & simplifications

none

## Design-flaw fixes

none

## Findings

1.  - id: `server-core-runner-status-two-writers`

- class: two-writers
- severity: Important
- first-seen: 2026-09-19
- status: open
- path: `packages/server/src/session/langflower-session.ts` constructor `status$` subscribe + `runnerStatus`; consumers `isGraphLocked`, `buildExecutionFeed`
- evidence: This file copies `status$` into a public writable field (REACTIVITY: do not subscribe merely to copy a stream). ts-scan also shows bridge handler writes in `wire-runner-handlers.ts` (`'running'` / `'idle'`). Graph lock and Clear policy read the copy, not the runner. Dual-write can drift if the writers disagree.
- proposed fix: One writer. Prefer a sync `RuntimeRunner` status (or `getValue` on the status subject) and read it in `isGraphLocked`. Keep the subscribe for HITL `denyAll` / `failAll` / `releaseMcpRuntime` only. Stop assigning `session.runnerStatus` from handlers.

2.  - id: `server-core-draft-credentials-twin`

- class: twin-without-adr
- severity: Important
- first-seen: 2026-09-19
- status: open
- path: `packages/server/src/config/resolve-draft-provider-credentials.ts` `ENV_REF_PATTERN` / `resolveEnvRef` / `ResolvedCredentials`; owner `packages/server/src/config/resolve-provider-credentials.ts`
- evidence: Identical `{env:VAR}` resolution and a parallel credentials Result type, not listed in ADR-039 and with no parity test. Draft path already calls `resolveProviderCredentials` for the saved-layer fallback; only the pending-key branch reimplements env-ref.
- proposed fix: Export `resolveEnvRef` (or fold draft into `resolveProviderCredentials` with an override). Delete the copied pattern and twin Result type.

## Non-issues / looked OK

- **LEDGER `legacy-langflower-ts-entry`:** `packages/server/**/langflower.ts` stayed deleted. Do not reopen.
- **Historical leftovers stayed deleted:** `toPackErrors`, `utils/parse-jsonc.ts`, `ConfigService.write`, `CustomNodeRegistry.clear`, `palette/compile-and-hot-swap-custom-nodes.ts`.
- Workflow boolean/null Results, looser `isRecord`, and branded `as` at the FS boundary are not listed classes.
- **Resolver `params` still forwarded.** `ResolveNodeDefinition` / `createServerContext` / bind / checkpoint / selected-node pass `{ type, params }`.
- **No leftover server bundler.** Start path is `hasCustomNodePacks` + `loadProjectNodes`.
- **No KB / crawl / MCP / LLM / REST trees** under this chunk.
- **HITL registries** match AGENTS: WS pause/reply only; `reply` is `askId` + `runId` gated.
- **Workflow topology composers** keep document → editor on load and editor → document on live edit (BUG-2026-07-22c).
- **`toPaletteDefinition` strip** is the BUG-2026-07-29 serializable-palette fix, not a type twin.
- **`ConfigService` vs `LangflowerConfigService`** are two files, not duplicate parsers of the same document.
- **Skills catalog** is allowed `.langflower/skills/` read; `isSafeSkillId` gates `readSkillMarkdown`. Empty string on missing file is the documented contract, not a write-clobber path.
- **Checkpoint store** atomic write + `persistChain` stays FS ownership; list marks corrupt entries.
- **`resetSessionExecutionFeed`** only clears the log + `runId` (Clear / document switch).
- **`resolveSkeletonRoot`** fail-closes with a thrown error when no skeleton directory exists.
- **Settings draft** keys connections by row id (`providerConnectionKey`), not array index.
- Remaining `function` exports / local `isRecord` taste / `pathExists` duplication are style or working extras — not findings.
