# WS bridge — call stack

Transport wiring for `langflowerWsConfig`. Domain logic for workflows lives in
`session/`, `workflow/`, `palette/`, `config/` — this folder mostly
subscribes to bus intents and emits snapshots / deltas.

**Thin server:** do not reintroduce KB/crawl/MCP/LLM implementations under
`packages/server/src/`. Inject from `@langflower/tools` /
`common-nodes` via [`build-execution-context.ts`](build-execution-context.ts)
and [`bind-llm-context.ts`](bind-llm-context.ts). See
[server AGENTS.md](../AGENTS.md) and
[PRINCIPLES.md § Thin server](../../../../docs/PRINCIPLES.md#thin-server--do-not-grow-domain-here).

## Entry

```
create-server.ts
  → createServerContext
  → warm custom palette (compile packs or applyEmptyOk)
  → createWsBridge(langflowerWsConfig)
  → attachLangflowerBridge(bridge, context)
  → listenHttpServer  (CLI opens browser only after this returns)
```

Read [`attach-langflower-bridge.ts`](attach-langflower-bridge.ts) first —
it is the composer entry (sibling wire steps, explicit order). Pattern:
[PRINCIPLES.md](../../../../docs/PRINCIPLES.md) § Composer entry points.

## Attach order

1. **Always-on runner fan-out** — `session.runtime.runner.events$` →
   [`forward-runner-event.ts`](forward-runner-event.ts) for every indexed
   client. Independent of connections/runs so initial `pending` events
   during `runner.start()` are not dropped (`events$` is a non-replaying
   Subject). Late clients get backlog via `executionFeed.snapshot`.
   See [FOUND_BUGS.md](../../../docs/FOUND_BUGS.md) (pending race).
2. **Connect / disconnect** — [`client-index.ts`](client-index.ts) +
   [`emit-bootstrap.ts`](emit-bootstrap.ts).
3. **Intent handlers** (bus namespaces):
    - [`wire-workflow-handlers.ts`](wire-workflow-handlers.ts)
    - [`wire-palette-handlers.ts`](wire-palette-handlers.ts)
    - [`wire-editor-handlers.ts`](wire-editor-handlers.ts)
    - [`wire-runner-handlers.ts`](wire-runner-handlers.ts)

Detach: unsubscribe root + per-client subs, `clearClientIndex`,
`session.dispose()`.

## Diagnostic bridge logs

When effective `serverLogs` is enabled (merged project > global; omitted
defaults to on), every server process writes an append-only JSONL trace to
`.langflower/logs/<UTC timestamp>-<pid>-<id>.log`. The server attaches this
observer before bootstrap and domain wires, so it records decoded client
intents, broadcast and client-targeted outbound frames (including bootstrap),
connection lifecycle, bridge status, and normalized bridge errors. Settings
Save updates the live enable gate without restart; when disabled, channel
subscriptions stay attached but writes are skipped (no log file until
enabled).

The logger recursively redacts values under known secret-bearing object keys
such as `apiKey`, `providerApiKeys`, `authorization`, `token`, and
`credentials`. Ordinary prompt and tool text remains diagnostic data, so do not
share a log without reviewing it. If the directory or file cannot be written,
the server continues serving and prints one concise stderr diagnostic instead.

## Bootstrap emit order (connect / reconnect)

Authoritative implementation: [`emit-bootstrap.ts`](emit-bootstrap.ts).

1. `session.state.snapshot` (version + dividers + selected node + settings; slim — not fat feed)
2. `runner.snapshot`
3. `executionFeed.snapshot`
4. `runner.checkpoints.snapshot`
5. `toolConfig.snapshot`
6. `workflow.list.snapshot`
7. `workflow.current.snapshot` (includes graph + `viewport` when a workflow is active)
8. `session.ready`
9. `langflower.config.snapshot`
10. `langflower.models.catalog.snapshot` (async after config — does not block palette)
11. Replay in-flight `runner.permission.ask` (if any)
12. `palette.snapshot` (system catalog)
13. `customPalette.snapshot` (warm emit from createServer compile —
    no compile-on-connect; `compiling` only on explicit
    `customPalette.update.requested` / project bootstrap seed)

There is no separate `viewport.snapshot` event — pan/zoom reconnects from
`workflow.current.snapshot` / live `editor.viewport.delta`.

## Intent → wire → domain → outbound

| Intent                                 | Wire file                         | Domain                           | Typical outbound                                                                  |
| -------------------------------------- | --------------------------------- | -------------------------------- | --------------------------------------------------------------------------------- |
| `workflow.list.requested`              | `wire-workflow-handlers`          | `workflowService.list`           | `workflow.list.snapshot`                                                          |
| `workflow.load.requested`              | `wire-workflow-handlers`          | `loadWorkflowIntoSession`        | `workflow.current.snapshot` (+ `workflow.load.failed` / `workflow.load.repaired`) |
| `workflow.saveCurrent.requested`       | `wire-workflow-handlers`          | `buildSaveCurrentPayload` + save | current (+ list if catalog changed)                                               |
| `workflow.renameCurrent.requested`     | `wire-workflow-handlers`          | `renameActiveWorkflow`           | current (+ list)                                                                  |
| `workflow.create.requested`            | `wire-workflow-handlers`          | `createEmptyWorkflowInSession`   | `workflow.current.snapshot`                                                       |
| `workflow.copy.requested`              | `wire-workflow-handlers`          | `copyWorkflowToSession`          | current (+ list)                                                                  |
| `workflow.delete.requested`            | `wire-workflow-handlers`          | `workflowService.delete`         | current + list                                                                    |
| `palette.reload.requested`             | `wire-palette-handlers`           | `paletteService.reload`          | `palette.snapshot` (system)                                                       |
| `customPalette.update.requested`       | `wire-custom-palette-handlers`    | `customPaletteService.update`    | `customPalette.snapshot`                                                          |
| `langflower.config.save.requested`     | `wire-config-handlers`            | `writeSettings` + merge          | `langflower.config.snapshot` + `langflower.models.catalog.snapshot`               |
| `project.bootstrap.requested`          | `wire-project-bootstrap-handlers` | `bootstrapProject` force seed    | `project.bootstrap.result` + workflow/customPalette snapshots                     |
| `editor.addNode.requested`             | `wire-editor-handlers`            | `applyEditorAddNode`             | `editor.addNodes`, status                                                         |
| `editor.updateNode.requested`          | `wire-editor-handlers`            | `applyEditorUpdateNode`          | `editor.updateNodes`, status, selection                                           |
| `editor.addEdge.requested`             | `wire-editor-handlers`            | `applyEditorAddEdge`             | add/delete edges, status                                                          |
| `editor.paste.requested`               | `wire-editor-handlers`            | `applyEditorPaste`               | `editor.addNodes` then `addEdges`, status                                         |
| `editor.removeEdge.requested`          | `wire-editor-handlers`            | `applyEditorRemoveEdge`          | `editor.deleteEdges`, status                                                      |
| `editor.removeNode.requested`          | `wire-editor-handlers`            | `applyEditorRemoveNode`          | `editor.deleteNodes`, status                                                      |
| `editor.viewport.requested`            | `wire-editor-handlers`            | session graph viewport           | `editor.viewport.delta`, status                                                   |
| `editor.dividers.requested`            | `wire-editor-handlers`            | session + config persist         | `editor.dividers.snapshot`                                                        |
| `editor.settings.requested`            | `wire-editor-handlers`            | session settings chrome          | `editor.settings.snapshot`                                                        |
| `editor.selectNode.requested`          | `wire-editor-handlers`            | `buildSelectedNodePayload`       | `editor.settings.snapshot` (if closing) + `editor.nodeSelected`                   |
| `runner.start.requested`               | `wire-runner-handlers`            | `runner.start`                   | `runner.started` (broadcast) + live                                               |
| `runner.startNode.requested`           | `wire-runner-handlers`            | `runner.startNode`               | `runner.startNode.started` (broadcast)                                            |
| `runner.interrupt.requested`           | `wire-runner-handlers`            | `runner.interrupt`               | `runner.interrupted` (broadcast)                                                  |
| `runner.hitl.event`                    | `wire-runner-handlers`            | `pushIntoInput`                  | runtime events (+ cold-start `started`)                                           |
| `runner.permission.reply`              | `wire-runner-handlers`            | `permissionAsks.reply`           | (ask cleared)                                                                     |
| `runner.executionFeed.clear.requested` | `wire-runner-handlers`            | `clearEventLog` (idle only)      | `executionFeed.snapshot`                                                          |

Lifecycle gate (`runner.started` / `startNode.started` / `interrupted` /
`resume.started`) uses **`bridgeEmit`** so every open tab updates Run/Stop.
`runner.resume.failed` and `workflow.load.failed` stay **`clientEmit`**
(error to the requester).

Outbound helpers: [`bridge-outbound.ts`](bridge-outbound.ts)
(`clientEmit` / `bridgeEmit`).

## Shared siblings

| File                         | Role                                    |
| ---------------------------- | --------------------------------------- |
| `inbound-guards.ts`          | `isInboundEvent`                        |
| `client-index.ts`            | WeakMap of connected clients            |
| `langflower-bridge.types.ts` | `LangflowerBridge` / `LangflowerClient` |

Protocol registry:
[`packages/shared/src/langflower-bus-config.ts`](../../shared/src/langflower-bus-config.ts).
High-level sync model: [docs/ARCHITECTURE.md](../../../docs/ARCHITECTURE.md)
§ WebSocket Protocol.
