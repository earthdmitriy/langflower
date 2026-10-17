---
kind: bug
owner: docs
covers: []
status: current
date: 2026-07-20
flaw: Off-screen drag/measure hosts...
package: ui
fixed: yes
---

### BUG-2026-07-20 — Palette drag ghost is viewport-wide

| Field                  | Value                                                                                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-07-20                                                                                                                                                                                                    |
| **Area**               | ui · palette                                                                                                                                                                                                  |
| **Status**             | fixed                                                                                                                                                                                                         |
| **Symptom**            | Dragging a node from the palette shows a ghost with a huge empty width                                                                                                                                        |
| **Repro**              | Open editor → drag any palette node onto the canvas; observe drag image width                                                                                                                                 |
| **Root cause**         | `attachPaletteDragImage` mounts a `position: fixed` block host on `document.body`. Block + fixed sizes to the viewport; `dataTransfer.setDragImage(host)` captures that full box, not the compact node chrome |
| **Fix**                | Host `display: inline-block; width: max-content` in `palette-drag-image.ts`; preview host class `inline-block w-max`                                                                                          |
| **Design flaw signal** | Off-screen drag/measure hosts inherit block layout defaults; sizing for `setDragImage` must be explicit shrink-to-content                                                                                     |
| **Regression test**    | `packages/ui/src/app/features/palette/tests/palette-drag-image.test.ts`                                                                                                                                       |
