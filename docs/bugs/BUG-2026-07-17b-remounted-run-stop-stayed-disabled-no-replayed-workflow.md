---
kind: bug
owner: docs
covers: []
status: current
date: 2026-07-17
flaw: Do not derive enablement from...
package: ui
fixed: yes
---

### BUG-2026-07-17b — remounted Run/Stop stayed disabled (no replayed workflow snapshot)

| Field                  | Value                                                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-07-17                                                                                                                                                                            |
| **Area**               | ui                                                                                                                                                                                    |
| **Status**             | fixed                                                                                                                                                                                 |
| **Symptom**            | Stop next to the HITL tab/label was always disabled / greyed out.                                                                                                                     |
| **Repro**              | Start a HITL run so the composer chrome mounts a compact `lf-run-button` (footer button destroyed).                                                                                   |
| **Root cause**         | `isDisabled` read `activeWorkflow` from `workflow.current.snapshot.pipe(startWith(null))`. Subjects do not replay; a freshly mounted button stayed on `null` until the next snapshot. |
| **Fix**                | Gate Run on singleton `WorkflowExecutionService.hasRunnableGraph()` (`shareReplay` workflow fold); never disable while `isRunning()`.                                                 |
| **Design flaw signal** | **Do not derive enablement from a non-replaying bus Subject inside a component that remounts.** Prefer a root service projection with `shareReplay`, or keep the control mounted.     |
| **Regression test**    | none — `hasRunnableGraph` is on `WorkflowExecutionService`; composer `run-button.component.ts` reads it. Do not recreate the deleted WES unit file.                                   |
