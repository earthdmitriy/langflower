---
kind: bug
owner: docs
covers: []
status: current
date: 2026-07-21
flaw: Settle must not fork live vs...
package: ui
fixed: yes
---

### BUG-2026-07-21 — Live settle wiped canvas chrome that reconnect snapshot restored

| Field                  | Value                                                                                                                                                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Date**               | 2026-07-21                                                                                                                                                                                                                                                   |
| **Area**               | execution · ui · detachable-long-run                                                                                                                                                                                                                         |
| **Status**             | fixed                                                                                                                                                                                                                                                        |
| **Symptom**            | After `runner.done`, node/edge chrome cleared to idle while the feed still showed the settled run. Reopen/reconnect restored chrome from `executionFeed.snapshot` — live settle and reconnect disagreed (detachable-long-run S2–S3).                         |
| **Repro**              | Run a linear string→finish graph; watch chrome clear on done. Reload: chrome returns from snapshot replay. Unit: former `clears on run done` chrome tests.                                                                                                   |
| **Root cause**         | `WorkflowExecutionService` cleared node/edge chrome maps on `runner.done` / `runner.interrupted`, while reconnect rebuilt the same maps from the feed log. Live and reconnect paths projected different settled visuals from the same events.                |
| **Fix**                | Stop clearing chrome on done/interrupt; keep final port states. New runs still reset via `runner.started`; null/idle snapshots still replace. Derive settle progress (`completed` / `failed` / `completed_with_errors`) from the event log for feed + CLI.   |
| **Design flaw signal** | **Settle must not fork live vs reconnect projections** — if reconnect replays the feed into chrome, live settle must leave the same chrome, not wipe it on a lifecycle side channel.                                                                         |
| **Regression test**    | `packages/ui/src/app/features/canvas/tests/lf-node-chrome.test.ts` (`keeps settled chrome on run done`); `lf-edge-chrome.test.ts`; `packages/ui/src/app/services/tests/execution-chrome-fold.test.ts`; `tests/integration/ws/detachable-long-run.ws.test.ts` |
