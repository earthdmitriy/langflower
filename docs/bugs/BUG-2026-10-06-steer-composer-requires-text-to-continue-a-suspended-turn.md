---
kind: bug
owner: docs
covers: []
status: current
date: 2026-10-06
flaw: A port-level HITL kind of `te...
package: ui
fixed: yes
---

### BUG-2026-10-06 — Steer composer requires text to continue a suspended turn

| Field                  | Value                                                                                                                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-10-06                                                                                                                                                                                                                                        |
| **Area**               | ui · hitl                                                                                                                                                                                                                                         |
| **Status**             | fixed                                                                                                                                                                                                                                             |
| **Symptom**            | After retry budget exhaustion the feed says the turn is paused for Steer or Resume, but the composer only shows Send, disabled until the operator types.                                                                                          |
| **Repro**              | Run an LLM node until provider stream creation emits no result and transient retries are exhausted. The recovery notice opens Steer. Continue is missing; Send stays inert on an empty draft.                                                     |
| **Root cause**         | `steerControl` is a single textarea HITL control. The footer treated every textarea submit as “needs non-empty text” and wrapped only strings as `{ kind: 'steer' }`. `{ kind: 'resume' }` already continued the loop, but no control emitted it. |
| **Fix**                | Continue (and Enter on an empty Steer draft) emits `{ kind: 'resume' }`. Send still requires text. `wrapSteerHitlPayload` leaves object payloads unchanged.                                                                                       |
| **Design flaw signal** | A port-level HITL kind of `textarea` was treated as the whole action set. Resume was a payload the loop accepted and the copy promised, with no composer affordance.                                                                              |
| **Regression test**    | `packages/ui/src/app/features/composer/tests/hitl-action-payload.test.ts`                                                                                                                                                                         |
