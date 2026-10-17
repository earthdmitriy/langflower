---
kind: bug
owner: docs
covers: []
status: current
date: 2026-10-16
flaw: A mutation required the recor...
package: server
fixed: yes
---

### BUG-2026-10-16 — a corrupt session cannot be deleted while another is open

| Field                  | Value                                                                                                                                                                                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-10-16                                                                                                                                                                                               |
| **Area**               | server · sessions · topbar                                                                                                                                                                               |
| **Status**             | fixed                                                                                                                                                                                                    |
| **Symptom**            | × on an inactive tab fails with “Workflow session is not the active session”. A file with an outdated schema cannot be selected, so it can never be deleted.                                             |
| **Repro**              | Bind a valid session. Leave a second file that fails schema parse. Click × on that tab and confirm.                                                                                                      |
| **Root cause**         | `deleteWorkflowSession` treated “bound to a different id” as a stale tab. Select already refuses corrupt files, so the guard made those files permanent.                                                 |
| **Fix**                | Delete unlinks any listed file for the open workflow. The bound session is left only when that file is the one being deleted. The tab asks in a modal before sending `workflowSession.delete.requested`. |
| **Design flaw signal** | **A mutation required the record to be current.** Delete is not a stale-tab action. Binding is required to replace the canvas, not to remove a file.                                                     |
| **Regression test**    | `workflow-session-actions.test.ts` (`deletes a session that is not bound, including a corrupt file`); `workflow-topbar.component.test.ts` (`confirms deletion of a session that is not open`)            |
