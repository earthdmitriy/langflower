---
kind: bug
owner: docs
covers: []
status: current
date: 2026-06-28
flaw: Bind order vs wire validation
package: server
fixed: yes
---

### BUG-2026-06-28 — bootstrap load fails when passthrough outbound edge precedes inbound

| Field                  | Value                                                                                                                                                                                                                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Date**               | 2026-06-28                                                                                                                                                                                                                                                                                                                     |
| **Area**               | runtime · server · ws                                                                                                                                                                                                                                                                                                          |
| **Status**             | fixed                                                                                                                                                                                                                                                                                                                          |
| **Symptom**            | Client receives `session.state.snapshot` with `activeWorkflow: null` despite `currentWorkflowId: "example"`; canvas empty on load/reload.                                                                                                                                                                                      |
| **Repro**              | Start server on `demo-project` → connect WS → snapshot has catalog but no graph. `loadWorkflowIntoSession('example')` returns false.                                                                                                                                                                                           |
| **Root cause**         | `bindWorkflowToSessionEditor` adds persisted edges in file order. Passthrough outputs (`inferTypeFrom`) resolve wire type via `resolveInputPinnedWireType`, which only looked at upstream edges — not static input `wireType`. Outbound edges before inbound failed validation; bind aborted without setting `activeWorkflow`. |
| **Fix**                | `RuntimeEditor.resolveInputPinnedWireType` falls back to static input `wireType` when no upstream edge exists (dynamic inputs unchanged).                                                                                                                                                                                      |
| **Design flaw signal** | **Bind order vs wire validation** — persisted graph edge order must not affect load success; static port types are declared on the node definition.                                                                                                                                                                            |
| **Regression test**    | `packages/runtime/src/runtime.test.ts` — passthrough outbound before inbound; manual: demo-project `example` bind                                                                                                                                                                                                              |
