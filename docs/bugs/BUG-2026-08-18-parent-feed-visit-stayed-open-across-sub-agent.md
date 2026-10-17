---
kind: bug
owner: docs
covers: []
status: current
date: 2026-08-18
flaw: Streaming on a port is a visi...
package: common-nodes
fixed: yes
---

### BUG-2026-08-18 — Parent feed visit stayed open across Sub-Agent

| Field                  | Value                                                                                                                                                                                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-08-18                                                                                                                                                                                                                                    |
| **Area**               | ui · execution · common-nodes                                                                                                                                                                                                                 |
| **Status**             | fixed                                                                                                                                                                                                                                         |
| **Symptom**            | Calling a Sub-Agent did not close the parent agent visit. After Writer finished, parent reasoning/draft appended into the old card (scrolled off-screen above Writer).                                                                        |
| **Repro**              | Helper → Writer. Ask Helper to delegate a task. Watch the work log: Helper stays `working…`; Writer streams below; Helper continuation grows the first Helper card.                                                                           |
| **Root cause**         | `toolLog` is `feed.streaming: true`, so the `→ Writer` frame kept the parent visit open (concurrent-streaming while-open). Live Sub-Agent chunks during `invoke` then made that open visit sit above the specialist card.                     |
| **Fix**                | Fold: a `common-sub-agent` frame stamps `closesPreviousVisit` and closes the previous visit (different `nodeId`). Production `→ Researcher_subagent(` toolLog does not close. Ordinary tools unchanged.                                       |
| **Design flaw signal** | Streaming on a port is a visit policy, not only a UI grow-merge hint. A canvas specialist is a new visit, not an in-card tool row. Visit close belongs in the fold from **node type**, not a toolLog regex or per-event feed override on `T`. |
| **Regression test**    | `packages/ui/src/app/features/feed-folding/tests/execution-feed.service-visits.test.ts` (Sub-Agent node type vs ordinary tool)                                                                                                                |
