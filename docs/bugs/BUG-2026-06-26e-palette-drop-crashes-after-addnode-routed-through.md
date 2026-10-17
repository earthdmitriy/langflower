---
kind: bug
owner: docs
covers: []
status: current
date: 2026-06-26
flaw: Competing drop ownership
package: ui
fixed: yes
---

### BUG-2026-06-26e — palette drop crashes after addNode routed through diagramModel.addNodes

| Field                  | Value                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-06-26                                                                                                                                                                                                                                                                                                                                                              |
| **Area**               | ui · bridge-diagram                                                                                                                                                                                                                                                                                                                                                     |
| **Status**             | fixed                                                                                                                                                                                                                                                                                                                                                                   |
| **Symptom**            | Drop from palette → `TypeError: Cannot use 'in' operator to search for 'label' in undefined` in `lf-node`; node may flash without label/ports.                                                                                                                                                                                                                          |
| **Repro**              | Open editor → drop any palette node after protocol switch to `editor.addNode.delta` (no post-mutation snapshot).                                                                                                                                                                                                                                                        |
| **Root cause**         | Two add paths raced. `ng-diagram`'s built-in `PaletteDropDirective` handles `drop` on `<ng-diagram>` during the target phase and emits a `paletteDropNode` command with `{}` when no `text/plain` payload exists, creating a local node without `data`. The app's parent `(drop)` bubble handler then also sent `editor.addNode.requested`.                             |
| **Fix**                | Add capture-phase native `dragover` / `drop` listeners on `lf-flow-canvas` for Langflower palette MIME. They call the existing app handlers and `stopImmediatePropagation()` before the event reaches `<ng-diagram>`. The server delta add path uses `adapter.updateNodes` + `upsertDiagramNodes` so existing nodes stay in place and the new node carries full `data`. |
| **Design flaw signal** | **Competing drop ownership** — component-level bubble handlers are too late when a child directive owns the same DOM event. Palette drops must have one owner at the capture boundary before ng-diagram can synthesize local nodes.                                                                                                                                     |
| **Regression test**    | pending user confirmation — update `flow-canvas.component.test.ts` settled → delta mocks                                                                                                                                                                                                                                                                                |
