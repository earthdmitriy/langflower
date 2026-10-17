---
kind: product
owner: docs
covers: []
status: current
---

## By package

### `@langflower/shared` — **partial**

| Area                    | Status   | Path                                                                                                                       |
| ----------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------- |
| `DataType` union        | partial  | `types/data-type.ts`                                                                                                       |
| Node / workflow types   | partial  | `types/node-definition.ts`, `workflow.ts`                                                                                  |
| Config schema           | partial  | `types/config.ts`                                                                                                          |
| `canConnectPorts`       | **done** | `validators/connection-validator.ts`                                                                                       |
| WebSocket bus registry  | **done** | `langflower-bus-config.ts`, `langflower.ts`                                                                                |
| Defaults                | **done** | `constants/defaults.ts`                                                                                                    |
| Partial-run plan        | **done** | Cluster scope is `RuntimeRunner.startNode` (not a shared `partial-run-plan.ts`). Feed does not trim the graph client-side. |
| Langflower config (LLM) | **done** | `types/langflower-config.ts`, `langflower.jsonc`                                                                           |

### `@langflower/server` — **partial**

| Area                                 | Status      | Path                                                                                                                                                                                      |
| ------------------------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createServer`                       | **done**    | `create-server.ts`                                                                                                                                                                        |
| API routers                          | partial     | `api/workflows-router.ts` (bulk REST)                                                                                                                                                     |
| Node registry                        | **done**    | System via `PaletteService`; custom via `CustomPaletteService` + resolve merge                                                                                                            |
| Custom node compiler                 | **done**    | `@langflower/compiler` + `customPalette.*` bus; contract [ADR-030](../adr/030-custom-node-pack-layout-and-npm-model.md)                                                                   |
| Workflow CRUD                        | **done**    | `workflow/workflow.service.ts`                                                                                                                                                            |
| Config service                       | **done**    | `config/`                                                                                                                                                                                 |
| Langflower config (project + global) | **done**    | `config/langflower-config.service.ts` — project `.langflower/langflower.jsonc` + OS user global merge (epic 18; ADR-002)                                                                  |
| Global user config + Settings UI     | **done**    | Gear aside + write-only keys + Project Bootstrap ([settings-panel](use-cases/settings-panel.md) **Ready**)                                                                                |
| Workflow executor                    | **done**    | Runtime runner via bridge (`bridge/` + `@langflower/runtime`)                                                                                                                             |
| Project bootstrap                    | **done**    | `bootstrap/project-bootstrap.service.ts` — full skeleton on missing `.langflower/`; Settings force reseed; empty-provider opens Global Settings; the OpenAI port error points at Settings |
| WebSocket                            | **done**    | `bridge/attach-langflower-bridge.ts` (+ `bridge/BRIDGE.md`)                                                                                                                               |
| Session survives UI disconnect       | **done**    | Same process keeps run; [detachable-long-run](use-cases/detachable-long-run.md) S1                                                                                                        |
| Skeleton seed (`my-nodes` + samples) | **done**    | `packages/server/skeleton/` is the seed source of truth (first-run + Settings Bootstrap). `dist/skeleton/` is not required. Catalog UI is an optional tail                                |
| Harness sandbox                      | **partial** | `@langflower/tools` + thin `server/src/harness/` (permissions); epic 01/02                                                                                                                |

### `@langflower/ui` — **partial**

| Area                            | Status      | Path                                                                                                                                                                                       |
| ------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Editor layout                   | **done**    | `features/editor/`                                                                                                                                                                         |
| ngDiagram canvas                | **done**    | `features/canvas/`, `diagram/`                                                                                                                                                             |
| Connection / topology           | **done**    | Server workflow is source of truth; UI `BridgeDiagramService` projects edges. No `connection-validation.middleware.ts`. Type rules: `canConnectPorts`.                                     |
| Workflow ↔ diagram map          | **done**    | `services/bridge-diagram.ts`                                                                                                                                                               |
| Inline node inputs              | **done**    | `app/components/lf-inline-field.component.ts`                                                                                                                                              |
| Typography / theme              | **done**    | `packages/ui/docs/TYPOGRAPHY.md`, `src/theme/`                                                                                                                                             |
| Palette                         | **done**    | `features/palette/`                                                                                                                                                                        |
| Topbar / workflow chrome        | **partial** | `features/topbar/` — project folder, workflow file tab, scrolling session tabs; Settings gear (epic 18)                                                                                    |
| Right sidebar — feed (work log) | **done**    | `features/feed/` + `features/feed-folding/` — chat-dense (epic 17) + hide unmarked (epic 43); [feed-panel](features/feed-panel.md) **done**, [grok-feed](use-cases/grok-feed.md) **Ready** |
| Right sidebar — inspector       | **done**    | `lf-inspector-panel` — selection swap + post-Save LLM option rebind (epic 18; [inspector](features/inspector.md))                                                                          |
| Right sidebar — Settings aside  | **done**    | Server-driven Settings; empty-provider Global open; [settings-panel](features/settings-panel.md) **Ready**                                                                                 |
| WebSocket + execution           | **done**    | `langflower-bridge.service.ts`, `workflow-execution.service.ts`                                                                                                                            |
| WorkflowStore                   | **done**    | `services/workflow-store.service.ts`                                                                                                                                                       |

### `langflower` CLI — **done** (compose layer)

| Area                                     | Status   | Path                                                                                                                        |
| ---------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------- |
| `langflower start`                       | **done** | `src/start-command.ts` — bootstrap + `createServer` + port/project logs + run-settle lines (epic 19)                        |
| Run settle stdout (“work done” / failed) | **done** | Epic 19 — [detachable-long-run](use-cases/detachable-long-run.md) S4                                                        |
| Commander wiring                         | **done** | `src/cli.ts` / `src/index.ts` (process entry, not a re-export barrel)                                                       |
| `langflower eval`                        | **done** | `src/eval-command.ts` — default `runCase` + optional `--replay` ([eval-regression-gate](use-cases/eval-regression-gate.md)) |

### Desktop launcher — **done** (supervisor)

| Area                          | Status   | Path                                                                                                                                                                                       |
| ----------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Slint window + CLI spawn      | **done** | `launcher/` — one child per project; `--no-open -p`; software renderer; no WebView2 ([ADR-038](../adr/038-launcher-is-a-cli-supervisor.md)); [author guide](../../launcher/docs/README.md) |
| Recents                       | **done** | user-global `launcher.json`                                                                                                                                                                |
| Open editor in system browser | **done** | localhost `http://127.0.0.1:` after READY; **?** opens [launcher.md](../assets/public/launcher.md) on GitHub                                                                               |
| User manual                   | **done** | [docs/assets/public/launcher.md](../assets/public/launcher.md)                                                                                                                             |
| GitHub Release zips           | **done** | unsigned Win x64/ARM64 `.exe` + ad-hoc signed (not notarized) macOS arm64/x64 `Langflower.app` on tag `launcher-v*` (not npm `v*`)                                                         |
