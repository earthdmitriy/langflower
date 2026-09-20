---
name: langflower-ui
description: >-
    Guides Langflower Angular UI: ngDiagram canvas, palette, feed, composer,
    LangflowerBridgeService. Use when editing editor features, diagram mapping,
    WebSocket client, or workflow state in packages/ui.
disable-model-invocation: true
---

# Langflower UI

## Start here

1. `packages/ui/AGENTS.md`
2. `packages/ui/docs/TYPOGRAPHY.md` — fonts, tokens, Aria, Tailwind theme
3. `docs/architecture/NAVIGATION.md` — feature → file map
4. `docs/STATUS.md` — canvas and bridge **done**; feed / Settings **partial**

## Feature map

| Feature         | Path                                                          |
| --------------- | ------------------------------------------------------------- |
| Shell           | `features/editor/components/editor-shell.component.ts`        |
| Canvas          | `features/canvas/components/flow-canvas.component.ts`         |
| Inline inputs   | `app/components/lf-inline-field.component.ts`                 |
| Palette         | `features/palette/components/palette-sidebar.component.ts`    |
| Topbar          | `features/topbar/`                                            |
| Inspector       | `features/sidebar/components/lf-inspector-panel.component.ts` |
| Feed (work log) | `features/feed/` + `features/feed-folding/`                   |
| Composer        | `features/composer/`                                          |
| Diagram ports   | `diagram/resolve-diagram-node-ports.ts`                       |
| Workflow bridge | `services/bridge-diagram.service.ts`                          |
| WebSocket       | `services/langflower-bridge.service.ts`                       |
| Run gate        | `services/workflow-execution.service.ts`                      |

Do **not** restore `node-inline-inputs.component.ts`,
`workflow-diagram.mapper.ts`, `diagram.config.ts`,
`connection-validation.middleware.ts`, `features/toolbar/`,
`features/properties/`, `langflower-socket.service.ts`,
`editor-page.component.ts`, or `features/sidebar/spec.md`.

## ngDiagram

- `provideNgDiagram()` on the canvas host (`flow-canvas.component.ts`).
- Canvas topology is projected from the server workflow
  (`BridgeDiagramService`). Do not add a local `validateConnection`
  middleware file.
- Inline primitive inputs on node body: `supportsInlinePortInput`, port
  `inline` → `lf-inline-field`.
- **Typography:** `docs/TYPOGRAPHY.md`, `src/theme/`, `.lf-text-*` — no raw font sizes in SCSS.

## Patterns

- Standalone + `OnPush`.
- RxJS in services; `async` pipe in templates.
- **ADR-012:** WebSocket bus default; `HttpClient` only for ADR-approved bulk
  escape hatches.
- Inbound WS follows `@langflower/shared/langflower-bus-config` through
  `@langflower/websocket-bridge`.
- Import types from `@langflower/shared` only.

## Verify

```bash
node build/tools/agent-run.mjs build-ui
npm run lint
```
