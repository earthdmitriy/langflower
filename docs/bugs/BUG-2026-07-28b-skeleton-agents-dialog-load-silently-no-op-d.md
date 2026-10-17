---
kind: bug
owner: docs
covers: []
status: current
date: 2026-07-28
flaw: Multi fan-in needs `multi` +...
package: common-nodes
fixed: yes
---

### BUG-2026-07-28b — Skeleton `agents-dialog` load silently no-op'd

| Field                  | Value                                                                                                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-07-28                                                                                                                                                                                                                            |
| **Area**               | ws · server · common-nodes                                                                                                                                                                                                            |
| **Status**             | fixed                                                                                                                                                                                                                                 |
| **Symptom**            | Loading `agents-dialog` from the catalog left the prior workflow active; WS showed only `workflow.current.snapshot` of the old id — no error.                                                                                         |
| **Repro**              | Open a project with skeleton samples; load `agents-dialog` while another workflow is active.                                                                                                                                          |
| **Root cause**         | (1) LLM `feedback` was unintentionally single-slot; two edges both targeting `proposer.feedback[0]` failed `addEdge` occupancy. (2) `workflow.load.requested` discarded bind/load Results and always re-emitted the current snapshot. |
| **Fix**                | Restore `feedback` `multi: 'merge'`; distinct slots in `agents-dialog`; emit unicast `workflow.load.failed`; activate rolls back previous bind on failure.                                                                            |
| **Design flaw signal** | Multi fan-in needs `multi` + distinct slots in persisted graphs; expected failures must surface as bus facts (`Result` → client event), not silent success-shaped snapshots.                                                          |
| **Regression test**    | `packages/common-nodes/src/ai/nodes/openai-llm/node.test.ts` (dual feedback slots); load Result path in `load-workflow-into-session` / handler.                                                                                       |
