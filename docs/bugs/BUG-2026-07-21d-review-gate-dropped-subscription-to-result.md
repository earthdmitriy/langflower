---
kind: bug
owner: docs
covers: []
status: current
date: 2026-07-21
flaw: Passthrough / prompt outputs...
package: common-nodes
fixed: yes
---

### BUG-2026-07-21d — Review Gate dropped subscription to `result`

| Field                  | Value                                                                                                                                                                                                                                                                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-07-21                                                                                                                                                                                                                                                                                                      |
| **Area**               | hitl · execution · common-nodes                                                                                                                                                                                                                                                                                 |
| **Status**             | fixed                                                                                                                                                                                                                                                                                                           |
| **Symptom**            | Fake LLM streamed `reasoning` / `draftResponse`, but `response` never appeared in WS/runtime when wired only into Review Gate.`result` (demo `fake-llm.json`).                                                                                                                                                  |
| **Repro**              | Wire `Fake LLM.response → Review Gate.result` and `Review Gate.feedback → Fake LLM.feedback`. Run; wait for stream to finish. No `output-emitted` for `llm.response`. Unit: `emits response when Review Gate feedback is wired`.                                                                                |
| **Root cause**         | Removing the `preview` passthrough left `result` consumed only via `withLatestFrom` on Approve. Wired upstream edges need a lasting subscriber on the target input/output chain; without `preview`, nothing pulled `result`, so the LLM `response` edge stayed cold.                                            |
| **Fix**                | Restore `configureOutput('preview', result)` and HITL `promptFrom: 'preview'` on approve / request-changes.                                                                                                                                                                                                     |
| **Design flaw signal** | **Passthrough / prompt outputs are demand drivers, not just UI.** Dropping an “unused” output can silently stop pulling upstream reactive edges. `withLatestFrom` alone does not create run-lifetime demand — now **forbidden** without human OK ([architecture/REACTIVITY.md](../architecture/REACTIVITY.md)). |
| **Regression test**    | `packages/common-nodes/src/ai/nodes/fake-llm/node.test.ts` — `emits response when Review Gate feedback is wired`                                                                                                                                                                                                |
