---
kind: bug
owner: docs
covers: []
status: current
date: 2026-07-17
flaw: Nullable session facts must b...
package: ui
fixed: yes
---

### BUG-2026-07-17d — delete active workflow crashed UI on null graph

| Field                  | Value                                                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-07-17                                                                                                                                                                            |
| **Area**               | ui · shared · ws                                                                                                                                                                      |
| **Status**             | fixed                                                                                                                                                                                 |
| **Symptom**            | Deleting the active workflow left the editor broken: `TypeError: Cannot read properties of null (reading 'graph')` in `workflow-execution.service.ts`.                                |
| **Repro**              | Load a workflow → Delete → confirm.                                                                                                                                                   |
| **Root cause**         | Server correctly emits `workflow.current.snapshot` with `activeWorkflow: null`, but shared typed it as non-null and UI folds/canvas read `.graph` unconditionally.                    |
| **Fix**                | `WorkflowCurrentSnapshotPayload.activeWorkflow` is `                                                                                                                                  | null`; null-safe node maps in `WorkflowExecutionService`; canvas container skips `lf-flow-canvas` when no active workflow. |
| **Design flaw signal** | **Nullable session facts must be typed and handled at every snapshot consumer.** A successful delete is a first-class empty state, not an edge the UI can ignore.                     |
| **Regression test**    | Nearest live fold: `packages/ui/src/app/services/tests/execution-live-graph-fold.test.ts` (nullable `activeWorkflow` in fixtures). No remaining `workflow-execution.service.test.ts`. |
