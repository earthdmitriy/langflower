---
kind: bug
owner: docs
covers: []
status: current
date: 2026-07-21
flaw: Session-shared run gate must...
package: ui
fixed: yes
---

### BUG-2026-07-21f — Runner lifecycle unicast hid Run only on the starting tab

| Field                  | Value                                                                                                                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-07-21                                                                                                                                                                                         |
| **Area**               | ws · server · ui                                                                                                                                                                                   |
| **Status**             | fixed                                                                                                                                                                                              |
| **Symptom**            | Starting a run in tab A switched A to Stop; tab B kept showing Run. Telemetry (`output-emitted` / `done`) still appeared on B.                                                                     |
| **Repro**              | Open two editor tabs on the same server; click Run in one; peer tab Run/Stop chrome does not flip.                                                                                                 |
| **Root cause**         | `wire-runner-handlers` emitted `runner.started` / `startNode.started` / `interrupted` / `resume.started` via `clientEmit` (initiator only). UI `isRunning` already folds those facts from the bus. |
| **Fix**                | Broadcast those lifecycle facts with `bridgeEmit` (keep `runner.resume.failed` unicast).                                                                                                           |
| **Design flaw signal** | **Session-shared run gate must fan-out like editor deltas** — lifecycle facts that drive multi-tab chrome are not RPC replies to the clicking client.                                              |
| **Regression test**    | `tests/integration/ws/ws-session-sync.ws.test.ts` — broadcasts `runner.started` and `runner.interrupted` to peer clients                                                                           |
