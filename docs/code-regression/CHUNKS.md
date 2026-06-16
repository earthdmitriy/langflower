# Code regression — chunks

Date: 2026-07-22
Scope: full (architecture + principles re-audit; overwrite existing artifacts)

| Chunk                 | Paths                                                                                               | Status |
| --------------------- | --------------------------------------------------------------------------------------------------- | ------ |
| `shared`              | `packages/shared/src/`                                                                              | done   |
| `node-sdk`            | `packages/node-sdk/src/`                                                                            | done   |
| `runtime`             | `packages/runtime/src/`                                                                             | done   |
| `tools`               | `packages/tools/src/`                                                                               | done   |
| `common-nodes-ai`     | `packages/common-nodes/src/ai/`                                                                     | done   |
| `common-nodes-domain` | `packages/common-nodes/src/{crawl,kb,memory,obsidian,logic,flow}/`                                  | done   |
| `eval`                | `packages/eval/src/`                                                                                | done   |
| `langflower-mcp`      | `packages/langflower-mcp/src/`                                                                      | done   |
| `websocket-bridge`    | `packages/websocket-bridge/src/`                                                                    | done   |
| `server-bridge`       | `packages/server/src/bridge/`, `packages/server/src/websocket/` (absent — WS in `create-server.ts`) | done   |
| `server-core`         | `packages/server/src/` excluding `bridge/` and `websocket/`                                         | done   |
| `ui-editor`           | `packages/ui/src/app/features/editor/`                                                              | done   |
| `ui-sidebar-feed`     | `packages/ui/src/app/features/sidebar/`                                                             | done   |
| `ui-services`         | `packages/ui/src/app/services/`                                                                     | done   |
| `ui-rest`             | `packages/ui/src/app/` excluding features already chunked                                           | done   |
| `cli`                 | `packages/cli/src/`                                                                                 | done   |
| `integration-tests`   | `tests/integration/`                                                                                | done   |

Out of default map (not reviewed this run): `packages/common-nodes/src/{hitl,text,output,primitives}/`, `build/`.
