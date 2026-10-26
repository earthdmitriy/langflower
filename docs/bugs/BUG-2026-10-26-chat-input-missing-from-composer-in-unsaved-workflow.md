---
kind: bug
owner: ui
covers:
    - 'packages/ui/src/app/features/composer/**'
status: current
date: 2026-10-26
flaw: state-ownership
package: ui
fixed: yes
---

### BUG-2026-10-26 — chat input missing from the composer in an unsaved workflow

| Field               | Value                                                                                                                                                                                                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**            | 2026-10-26                                                                                                                                                                                                                                                                               |
| **Area**            | ui · composer                                                                                                                                                                                                                                                                            |
| **Symptom**         | In a new "Untitled" workflow with a Chat Input node, the composer panel is blank: no textarea and no "No pending human-in-the-loop steps" hint.                                                                                                                                          |
| **Repro**           | Create a workflow, add `common-chat-input` from the palette, leave it unsaved. Open the composer.                                                                                                                                                                                        |
| **Root cause**      | `ComposerService` took its node-id → node-type map from `workflow.current.snapshot` only, while the chat-entry tab list came from the live graph. Nodes added after the empty snapshot arrive as `editor.addNodes` deltas, so the map stayed empty. `hitlControls()` then returned `[]`. |
| **Fix**             | `nodeTypeById` is now computed from `WorkflowExecutionService.activeGraph()` via `nodeTypeByIdFromGraph`.                                                                                                                                                                                |
| **Design flaw**     | Two folds of the same graph (snapshot-only and snapshot plus deltas) lived side by side, so they could disagree.                                                                                                                                                                         |
| **Regression test** | `packages/ui/src/app/services/tests/execution-live-graph-fold.test.ts` (node types survive an add after an empty snapshot)                                                                                                                                                               |
