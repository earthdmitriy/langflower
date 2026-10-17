---
kind: bug
owner: docs
covers: []
status: current
date: 2026-06-26
flaw: Event-sourcing vs snapshot tr...
package: ui
fixed: yes
---

### BUG-2026-06-26d — editor deltas unicast + snapshot broadcast broke multi-tab canvas sync

| Field                  | Value                                                                                                                                                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-06-26                                                                                                                                                                                                                                                                            |
| **Area**               | server · shared protocol · ui · bridge-diagram                                                                                                                                                                                                                                        |
| **Status**             | fixed                                                                                                                                                                                                                                                                                 |
| **Symptom**            | Two browser tabs: tab A moves a node — tab B moves the node but connected edges stay frozen at stale SVG paths.                                                                                                                                                                       |
| **Repro**              | Open two tabs on the same workflow → connect nodes with an edge in tab A → drag a node in tab A → tab B receives only `workflow.current.snapshot`, not the node delta; snapshot applies positions via `adapter.updateNodes()` (no edge routing).                                      |
| **Root cause**         | Server sent `editor.*.settled` only to the initiating client (`clientEmit`) and broadcast a full `workflow.current.snapshot` after every editor mutation. Remote tabs never received the incremental fact; snapshot path bypassed `edgesRoutingMiddleware`.                           |
| **Fix**                | Rename `editor.*.settled` → `editor.*.delta`; broadcast deltas to all tabs via `bridgeEmit`; remove `broadcastWorkflowCurrentSnapshot` from editor handlers. Reserve `workflow.current.snapshot` for load/save/rename/connect. UI patches `canvasState.activeWorkflow` on each delta. |
| **Design flaw signal** | **Event-sourcing vs snapshot transport** — incremental canvas edits must broadcast the same delta to every tab; full snapshot replace is for bootstrap/load/save only, not live moves.                                                                                                |
| **Regression test**    | `tests/integration/ws/editor.ws.test.ts` — "broadcasts editor.updateNode.delta to all tabs without workflow snapshot"                                                                                                                                                                 |
