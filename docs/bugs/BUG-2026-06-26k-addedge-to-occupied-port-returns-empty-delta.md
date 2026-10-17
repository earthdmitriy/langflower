---
kind: bug
owner: docs
covers: []
status: current
date: 2026-06-26
flaw: Editor policy vs runtime stri...
package: server
fixed: yes
---

### BUG-2026-06-26k — addEdge to occupied port returns empty delta

| Field                  | Value                                                                                                                                                                                                                                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-06-26                                                                                                                                                                                                                                                                                                     |
| **Area**               | server · bridge · ws · editor                                                                                                                                                                                                                                                                                  |
| **Status**             | fixed                                                                                                                                                                                                                                                                                                          |
| **Symptom**            | Drawing a new wire to an already-connected input port yields `editor.addEdge.delta` `[]`; old edge stays, new connection never appears.                                                                                                                                                                        |
| **Repro**              | Connect `string-1 → preview.text`, then connect `string-2 → preview.text` — WS shows empty add delta.                                                                                                                                                                                                          |
| **Root cause**         | `RuntimeEditor.addEdge` rejects occupied target slots by design; server `applyEditorAddEdge` returned `[]` without removing the incumbent edge first.                                                                                                                                                          |
| **Fix**                | Server replace flow: find edge on target port, `removeEdge` then `addEdge`; bridge emits `editor.removeEdge.delta` then `editor.addEdge.delta`. Runtime unchanged.                                                                                                                                             |
| **Follow-up fix**      | Replace used `applyEditorRemoveEdge`, which runs runtime `cleanupInvalidEdges` and cascaded removal of downstream passthrough wires before the replacement edge was added. `RuntimeEditor.replaceEdge` now performs the atomic swap and rolls back when cleanup would prune any edge.                          |
| **Follow-up fix 2**    | Persisted workflow kept stale edge ids after load (`activeWorkflow` from disk vs runtime UUIDs). Replace removed by runtime id only, so the old wire stayed in `example.json` and a second wire was appended — bind now preserves edge ids; persisted remove matches endpoints; append dedupes by target port. |
| **Design flaw signal** | **Editor policy vs runtime strictness** — canvas replace-on-reconnect is an editor concern; runtime may stay strict while server orchestrates remove-then-add.                                                                                                                                                 |
| **Regression test**    | `packages/server/src/workflow/apply-editor-mutation.test.ts`; `tests/integration/ws/editor.ws.test.ts` — replace on occupied port                                                                                                                                                                              |
