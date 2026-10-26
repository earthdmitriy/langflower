---
paths:
    - 'packages/ui/**'
---

# UI package

- **ngDiagram:** `DiagramModelService` + `provideNgDiagram()` on editor page.
- **State:** `WorkflowStore` (RxJS) ↔ `workflow-diagram.mapper` (TODO).
- **Transport:** WebSocket bus via `LangflowerSocketService`; HTTP only for
  ADR-approved bulk escape hatches.
- Components: standalone, `OnPush`. No duplicate port validation — use `shared`.
- **Inline inputs:** primitive port values on node body → `data.inputs`; `supportsInlinePortInput`.
- `tsconfig.json`: `composite: false` (Angular requirement).
- See `packages/ui/AGENTS.md` and `docs/architecture/NAVIGATION.md`.
