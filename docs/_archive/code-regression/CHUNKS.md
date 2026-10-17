# Code regression — chunks

Date: 2026-09-20
Scope: full
Mode: **delta** (reconcile 2026-09-19 reports + [LEDGER.md](LEDGER.md); do not
re-audit from scratch). Goal: measure progress after epics 47–48 and confirm
closed defects stay closed.

Same map as 2026-09-19. `packages/server/src/websocket/` is still absent.
`common-nodes` `run-host/` stays in `common-nodes-rest`. No `kb/` or `obsidian/`.
Historical `node-definitions.md` stays deleted.

| Chunk                 | Paths                                                                                                                                                                                  | Status |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `shared`              | `packages/shared/src/`                                                                                                                                                                 | done   |
| `node-sdk`            | `packages/node-sdk/src/`                                                                                                                                                               | done   |
| `runtime`             | `packages/runtime/src/`                                                                                                                                                                | done   |
| `tools`               | `packages/tools/src/`                                                                                                                                                                  | done   |
| `compiler`            | `packages/compiler/src/`                                                                                                                                                               | done   |
| `common-nodes-ai`     | `packages/common-nodes/src/ai/`                                                                                                                                                        | done   |
| `common-nodes-domain` | `packages/common-nodes/src/{crawl,memory,logic,flow}/`                                                                                                                                 | done   |
| `common-nodes-rest`   | `packages/common-nodes/src/{hitl,text,output,primitives,embeddings,mcp,langflower-tools,tools,run-host}/` plus `catalog.ts`, `resolve-workflow-node-definition.ts`                     | done   |
| `eval`                | `packages/eval/src/`                                                                                                                                                                   | done   |
| `langflower-mcp`      | `packages/langflower-mcp/src/`                                                                                                                                                         | done   |
| `websocket-bridge`    | `packages/websocket-bridge/src/`                                                                                                                                                       | done   |
| `server-bridge`       | `packages/server/src/bridge/`                                                                                                                                                          | done   |
| `server-core`         | `packages/server/src/` excluding `bridge/`                                                                                                                                             | done   |
| `ui-editor`           | `packages/ui/src/app/features/editor/`                                                                                                                                                 | done   |
| `ui-sidebar-feed`     | `packages/ui/src/app/features/sidebar/`                                                                                                                                                | done   |
| `ui-feed`             | `packages/ui/src/app/features/feed/`, `packages/ui/src/app/features/feed-folding/`                                                                                                     | done   |
| `ui-canvas`           | `packages/ui/src/app/features/canvas/`, `packages/ui/src/app/features/canvas-node-status-folding/`                                                                                     | done   |
| `ui-composer`         | `packages/ui/src/app/features/composer/`                                                                                                                                               | done   |
| `ui-palette`          | `packages/ui/src/app/features/palette/`                                                                                                                                                | done   |
| `ui-services`         | `packages/ui/src/app/services/`                                                                                                                                                        | done   |
| `ui-rest`             | `packages/ui/src/app/` excluding features already chunked (`editor`, `sidebar`, `feed`, `feed-folding`, `canvas`, `canvas-node-status-folding`, `composer`, `palette`) and `services/` | done   |
| `cli`                 | `packages/cli/src/`                                                                                                                                                                    | done   |
| `integration-tests`   | `tests/integration/`                                                                                                                                                                   | done   |
| `launcher`            | `launcher/src/` (skip `target/`), `launcher/scripts/`, `launcher/docs/`, `launcher/package.json`, `launcher/README.md`, `launcher/AGENTS.md`                                           | done   |

Out of this run: `build/`.

After the delta, 2026-09-20 drained the behavior + docs/delete
baskets (22 Important → LEDGER Closed). Chunk `## Findings` now hold
only still-open items. Remaining Important=7 are the shuffling cluster
in [SUMMARY.md](SUMMARY.md).
