---
kind: bug
owner: docs
covers: []
status: current
date: 2026-10-05
flaw: Two views, one lock.
package: ui
fixed: yes
---

### BUG-2026-10-05 — wired inputs stay editable in the inspector

| Field                  | Value                                                                                                                                                                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-10-05                                                                                                                                                                                                                             |
| **Area**               | ui · inspector                                                                                                                                                                                                                         |
| **Status**             | fixed                                                                                                                                                                                                                                  |
| **Symptom**            | Connecting a wire disables the on-node input control, but the same field in the inspector still accepts edits and can overwrite `inputs`. Expand was also offered on that wired field.                                                 |
| **Repro**              | Wire an upstream node into a multiline input (for example an LLM system prompt). The canvas textarea is disabled. Open the inspector and edit the same input, or click Expand.                                                         |
| **Root cause**         | Canvas passes `disabled` from `row.connected`. The inspector only disabled inline inputs while `isRunning()`, and never read live edges when deciding whether the authored value was still in use.                                     |
| **Fix**                | Inspector input rows mark `connected` from `activeGraph` edges (`toNodeId` + `toPort[0]`). A wired input is disabled, Expand is hidden, and `onInputChange` does not emit. Canvas passes `expandable: false` for a connected port.     |
| **Design flaw signal** | **Two views, one lock.** Read-only-because-wired was implemented only on the canvas row. Any second editor of the same port must use the same edge fact, not a local “this surface is for authoring” assumption.                       |
| **Regression test**    | `packages/ui/src/app/features/sidebar/tests/lf-inspector-panel.expand.test.ts` — `locks a wired input and hides Expand`; `packages/ui/src/app/components/lf-inline-field.expand.test.ts` — `hides Expand when the input port is wired` |
