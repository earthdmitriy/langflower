---
kind: bug
owner: docs
covers: []
status: current
date: 2026-07-11
flaw: Port sync mixed global stale...
package: ui
fixed: yes
---

### BUG-2026-07-11 — Dynamic port sync reads stale edges after addEdges

| Field                  | Value                                                                                                                                                                                                                                                                                               |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-07-11                                                                                                                                                                                                                                                                                          |
| **Area**               | ui · canvas                                                                                                                                                                                                                                                                                         |
| **Status**             | fixed (**superseded** — see BUG-2026-07-11c: this fix's own patch pipeline caused a follow-up staleness race and has since been deleted)                                                                                                                                                            |
| **Symptom**            | Multi-input and bypass ports did not grow/shrink correctly when edges were added or removed via bridge deltas; extra slots missing or not removed after disconnect                                                                                                                                  |
| **Repro**              | Add edge to merge node `value` input or bypass `ch` port; observe port rows. Remove last edge; spare slot should shrink. See `dynamic-port-update.test.ts`.                                                                                                                                         |
| **Root cause**         | `refreshNodePorts` read `diagramModel.edges()` after `addEdges`/`deleteEdges` (stale async middleware state), rebuilt all ports via `resolveNodePorts` with forbidden `Edge → persisted` conversion, and updated source nodes unnecessarily                                                         |
| **Fix**                | (historical) `buildDynamicPortUpdates` in `bridge-diagram.service.ts`; `FlowCanvasComponent.applyDynamicPortUpdates` uses pre-mutation `getConnectedEdges` per target node, patches via `getNodeDataForUpdate` + `updateNodeData` only. Deleted in BUG-2026-07-11c in favor of reactive derivation. |
| **Design flaw signal** | **Port sync mixed global stale model reads with full node rebuild** — dynamic slots must be derived from mutation payload + per-node connected edges before mutation, patched incrementally on `LfNodeData` lookups                                                                                 |
| **Regression test**    | `packages/ui/src/app/features/canvas/tests/dynamic-port-update.test.ts`                                                                                                                                                                                                                             |
