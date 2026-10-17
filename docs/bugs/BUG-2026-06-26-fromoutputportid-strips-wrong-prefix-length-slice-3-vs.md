---
kind: bug
owner: docs
covers: []
status: current
date: 2026-06-26
flaw: Off-by-one in string prefix r...
package: ui
fixed: yes
---

### BUG-2026-06-26 — fromOutputPortId strips wrong prefix length (slice(3) vs slice(4))

| Field                  | Value                                                                                                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-06-26                                                                                                                                                       |
| **Area**               | ui · canvas · port-id                                                                                                                                            |
| **Status**             | fixed                                                                                                                                                            |
| **Symptom**            | Edge draw sent `fromPort: [':value', 0]` instead of `['value', 0]`; output port names received a leading colon                                                   |
| **Repro**              | Draw edge between two nodes; inspect `editor.addEdge.requested` payload — `fromPort[0]` has `:` prefix                                                           |
| **Root cause**         | `fromOutputPortId` used `portId.slice(3)` but `out:` is 4 characters, leaving a leading `:`. `fromInputPortId` was correct (`in:` = 3 chars → `slice(3)` works). |
| **Fix**                | `diagram-port-id.ts`: `slice(3)` → `slice(4)` in `fromOutputPortId`                                                                                              |
| **Design flaw signal** | **Off-by-one in string prefix removal** — `in:` and `out:` have different lengths but shared the same slice index; should use constant or `replace`              |
| **Regression test**    | `packages/ui/src/app/features/canvas/flow-canvas.component.test.ts` — "emits editor.addEdge.requested with correct from/to ports"                                |
