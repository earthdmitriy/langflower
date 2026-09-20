# Code regression — server-bridge

## Meta

- Paths: `packages/server/src/bridge/` (36 files; no `packages/server/src/websocket/`)
- Date: 2026-09-20
- Mode: delta
- Coverage: Reconciled every 2026-09-19 finding against current source. Deep-read: `wire-runner-handlers.ts` (`startHeld` / `beginSeededRun` / resume / HITL / feed-clear), `wire-project-bootstrap-handlers.ts`, `compile-and-hot-swap-custom-nodes.ts`, `langflower-tools-rpc.ts`, `attach-langflower-bridge.ts`, `emit-bootstrap.ts`, `wire-workflow-handlers.ts`, `forward-runner-event.ts`, `get-live-wired-tools.ts`, `build-execution-context.ts` (`buildContextSeeds` / `setMcpDispose`), `BRIDGE.md`. Sampled remaining `wire-*.ts`, binds, outbound/log, inbound guards, colocated tests. ts-scan: `LangflowerBridge` owner is `langflower-bridge.types.ts`; re-export on `attach-langflower-bridge.ts` L35 has no consumer (all in-package imports use the owner; `create-server.ts` imports only `attachLangflowerBridge`). Not a line-audit of every handler branch.
- Previous report: 2026-09-19 — Critical=1 Important=2 Suggestion=5 (old unnumbered list; IDs assigned here to match LEDGER + finding text)

## Previous findings (delta mode)

| id                                         | severity   | status     | evidence                                                                                                                                                                                                                            |
| ------------------------------------------ | ---------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server-bridge-seeded-run-lock`            | Critical   | fixed      | LEDGER Closed 2026-09-19 (BUG-2026-09-19). `startHeld` + `isStartBusy()` still wrap seed + `start` / `startNode` / HITL cold-start / resume. Rollback in `finally` only when this attempt never announced a `RunId`. Do not reopen. |
| `server-bridge-bootstrap-hot-swap`         | Important  | fixed      | Closed 2026-09-20 — see LEDGER.                                                                                                                                                                                                     |
| `server-bridge-rpc-snapshot-wait`          | Important  | fixed      | Closed 2026-09-20 — see LEDGER.                                                                                                                                                                                                     |
| `server-bridge-resume-composer-drift`      | Suggestion | fixed      | Exclusive-lock drift is gone: resume and `beginSeededRun` share `isStartBusy` / `startHeld` and the same `!started` rollback. Remaining “fold into one composer” is streamlining, not a listed class.                               |
| `server-bridge-langflower-bridge-reexport` | Suggestion | still-open | `export type { LangflowerBridge }` still on `attach-langflower-bridge.ts` L35. ts-scan: zero consumers of that re-export.                                                                                                           |
| `server-bridge-workflow-mutation-silent`   | Suggestion | still-open | `workflow.saveCurrent` / `renameCurrent` / `create` / `copy` / `delete` still no-op on graph lock or `!ok` and then `syncAfterWorkflowMutation` with no `workflow.*.failed`.                                                        |

## Principles check

- **Thin server / inject-only composer — PASS.** `build-execution-context.ts` still injects tools/common-nodes factories only. No `kb/` / `crawl/` / `mcp/` / `llm/` trees in this folder. Thin binds unchanged.
- **Intent/fact bridge — PASS.** Clients emit `*.requested`; session-shared facts use `bridgeEmit`; `runner.resume.failed` / `workflow.load.failed` / `project.bootstrap.result` stay `clientEmit`.
- **No barrels / `type` not `interface` / no `withLatestFrom` — PASS (one leftover re-export).** No `index.ts`. Zero `interface`. Zero `withLatestFrom`. Bridge `.subscribe` is the transport edge. Re-export of `LangflowerBridge` remains (`dead-export`).
- **One writer / run gate — PASS (listed class closed).** `startHeld` is the exclusive in-flight token. `session.runnerStatus` is still set by the same composer; overlapping start cannot seed or roll back a live run. LEDGER `server-bridge-seeded-run-lock` stays closed.
- **Functional errors — FAIL (listed class).** Workflow save/rename/create/copy/delete still swallow lock / `!ok` with no failed fact (`fail-open-io`).
- **Delete obsolete — FAIL (listed class).** Type re-export aggregator still present (`dead-export`).
- **Epic 47 feed stamp — PASS.** This chunk forwards `runner.port` tuples as-is (`forwardRunnerEvent`). No catalog fallback, no `resolveOutputFeedRole`, no palette-role rewrite. Feed clear still idle-only. Do not invent a catalog-fallback recurrence.

## FOUND_BUGS signals

- **BUG-2026-09-19** — addressed, not a recurrence: `startHeld` still held across `await seedLiveContext`; second start returns `false` before seed; rollback only if this attempt never announced a `RunId`.
- **BUG-2026-08-16** — bootstrap now calls `compileAndHotSwapCustomNodes({ force: true })` (LEDGER 2026-09-20). Update / RPC compile already went through that composer.
- **BUG-2026-07-17** — feed clear still gated when `runnerStatus === 'running'`. Not a finding.
- **BUG-2026-09-20** — no catalog-fallback path in this folder. Runtime stamps feed; bridge does not invent slot 6.

## Glue / adapters / parallel types

none

ADR-backed copies, not flagged: thin `bindCreateChatCompletionStream` / `bindCreateEmbedding` / `listProviderModels` (ADR-014). `getLiveWiredTools` peek stays session-scoped inventory (BUG-2026-08-16 / ADR-016) and imports `flattenToolHandles` from common-nodes. Channel `as unknown as` casts stay transport glue, not `twin-without-adr`.

## Streamlining & simplifications

none

(`server-bridge-resume-composer-drift` no longer qualifies. Do not file “fold resume into `beginSeededRun`” as a defect.)

## Design-flaw fixes

none

(Shipped 2026-09-20: bootstrap calls `compileAndHotSwapCustomNodes({ force: true })`; palette RPC waits for its own `requestId` snapshot. See LEDGER.)

## Findings

1.  - id: `server-bridge-langflower-bridge-reexport`

- class: dead-export
- severity: Suggestion
- first-seen: 2026-09-19
- status: open
- path: `packages/server/src/bridge/attach-langflower-bridge.ts` — `export type { LangflowerBridge }`
- evidence: Re-export aggregator. ts-scan references all import from `langflower-bridge.types.ts`. `create-server.ts` imports only `attachLangflowerBridge`.
- proposed fix: Delete the re-export.

2.  - id: `server-bridge-workflow-mutation-silent`

- class: fail-open-io
- severity: Suggestion
- first-seen: 2026-09-19
- status: open
- path: `packages/server/src/bridge/wire-workflow-handlers.ts` — `workflow.saveCurrent.requested` / `renameCurrent` / `create` / `copy` / `delete`
- evidence: Load emits `workflow.load.failed` (`GRAPH_LOCKED` / load error). Save/rename/create/copy/delete no-op on lock or `save` `!ok` and still `syncAfterWorkflowMutation` with no failed fact. The requester cannot tell “ignored” from “saved.”
- proposed fix: Unicast a `workflow.*.failed` (or one mutation-failed event) on lock and on `!ok`; do not treat the sync as success.

## Non-issues / looked OK

- **LEDGER `server-bridge-seeded-run-lock`:** `startHeld` stayed. `beginSeededRun` rejects when `startHeld || runnerStatus === 'running'` before the first `await`. Resume unicasts `BUSY`. HITL cold-start uses the same token. Do not reopen.
- Historical leftovers stayed deleted: no `wrap-builtin-tool-handles.ts`, no `LIVE_WIRED_TOOLS_NODE_TYPES`, no `resolveLiveContextPortId` / `applyObservableContextSeeds`, no `enabledToolIds`, no local flatten copy, no catalog-fallback / `resolveOutputFeedRole`.
- Always-on telemetry still registered before connect (BUG-2026-07-14). `forwardRunnerEvent` is a thin tuple → `runner.port` / `runner.done` fan-out (epic 47 feed slot rides the tuple; this folder does not rewrite it).
- Feed-clear idle gate, `sameCanvasViewport` no-op, permission / ask-user replay on reconnect. Custom palette on connect is emit-only.
- `bind-llm-context.ts` / `bind-embed-context.ts` remain thin secret binds. Stream-factory `throw` on missing credentials is the host contract.
- `createLangflowerToolsRpc` is in-process bus RPC. Intent allow-list still rejects `editor.addNode.requested`.
- No barrels, no `interface`, no `withLatestFrom`. `client-index.ts` is a WeakMap, not an `index.ts` barrel.
- Outbound channel casts and the BRIDGE.md draft-step omission stay in this section (not findings).
