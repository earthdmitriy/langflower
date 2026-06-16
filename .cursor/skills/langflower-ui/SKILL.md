---
name: langflower-ui
description: >-
    Guides Langflower Angular UI: ngDiagram canvas, palette, toolbar, properties,
    LangflowerSocketService, WorkflowStore. Use when editing editor features,
    diagram mapping, WebSocket client, or workflow state in packages/ui.
disable-model-invocation: true
---

# Langflower UI

## Start here

1. `packages/ui/AGENTS.md`
2. `packages/ui/docs/TYPOGRAPHY.md` — fonts, tokens, Aria, Tailwind theme
3. `docs/NAVIGATION.md` — feature → file map
4. `docs/STATUS.md` — canvas done, services stub

## Feature map

| Feature         | Path                                                     |
| --------------- | -------------------------------------------------------- |
| Shell           | `features/editor/editor-page.component.ts`               |
| Canvas          | `features/canvas/flow-canvas.component.ts`               |
| Inline inputs   | `features/canvas/node-inline-inputs.component.ts` (stub) |
| Palette         | `features/palette/node-palette.component.ts`             |
| Toolbar         | `features/toolbar/`                                      |
| Properties      | `features/properties/`                                   |
| Diagram model   | `diagram/diagram-model.service.ts`                       |
| Workflow bridge | `diagram/workflow-diagram.mapper.ts` (TODO)              |
| WebSocket       | `services/langflower-socket.service.ts`                  |
| State           | `services/workflow-store.service.ts`                     |

## ngDiagram

- `provideNgDiagram()` on editor page.
- `ngDiagramPaletteDrop` on canvas host.
- Connection middleware: `diagram/connection-validation.middleware.ts` (TODO — use `canConnectPorts`).
- Inline primitive inputs on node body: `supportsInlinePortInput`, `data.inputs` — `spec.md` §3.2.
- **Typography:** `docs/TYPOGRAPHY.md`, `src/theme/`, `.lf-text-*` — no raw font sizes in SCSS.

## Patterns

- Standalone + `OnPush`.
- RxJS in services; `async` pipe in templates.
- **ADR-012:** WebSocket bus default; `HttpClient` only for ADR-approved bulk
  escape hatches.
- Inbound WS follows `@langflower/shared/langflower` bus config through
  `@langflower/websocket-bridge`.
- Import types from `@langflower/shared` only.

## Verify

```bash
node build/tools/agent-run.mjs build-ui
npm run lint
```
