---
kind: bug
owner: docs
covers: []
status: current
date: 2026-06-16
flaw: Run lifecycle was implicit
package: ui
fixed: yes
---

### BUG-2026-06-16 — partial run after cancelled HITL runs wrong cluster

| Field                  | Value                                                                                                                                                                                                                                                                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-06-16                                                                                                                                                                                                                                                                                                                                           |
| **Area**               | execution · server · ui · hitl                                                                                                                                                                                                                                                                                                                       |
| **Status**             | fixed                                                                                                                                                                                                                                                                                                                                                |
| **Symptom**            | After Run on LLM → Stop while Ask User waits → Run another disconnected cluster, the LLM cluster runs again instead of only the clicked cluster.                                                                                                                                                                                                     |
| **Repro**              | 1) `runFromNode` on LLM. 2) Stop during `execution.awaiting_input`. 3) `runFromNode` on a node in a separate connected component (e.g. Constant in `example.json`).                                                                                                                                                                                  |
| **Root cause**         | (1) `WorkflowExecutorService` started a new session without awaiting the previous one — two runs overlapped and WS events interleaved. (2) `runFeedbackReruns` had no partial-run scope — seeded LLM + Ask User outputs could trigger LLM rerun after an unrelated cluster finished. (3) UI kept stale `mustFresh` outputs in the seed after cancel. |
| **Fix**                | Serialize runs in `workflow-executor.service.ts` (`finishActiveRun` before start; session-safe `finally`). Scope `runFeedbackReruns` to partial-run `scope`. Strip `mustFresh` outputs on cancel in `workflow-execution.service.ts`; auto-`stopRun` before new `startRun`. `UserInputGateway` rejects with `RunCancelledError`.                      |
| **Design flaw signal** | **Run lifecycle was implicit** — no single owner for “one active run”, and global side effects (`runFeedbackReruns`, seed cache) ignored partial-run boundaries. Execution model doc claimed isolation that the executor did not enforce.                                                                                                            |
| **Regression test**    | none at the cited executor file (`workflow-executor.service.test.ts` is deleted). Nearest live: `packages/runtime/src/testing/workflows/start-wire-defer.workflow.test.ts` (interrupt); `tests/integration/ws/execute-workflow.ws.test.ts` (`startNode`).                                                                                            |
