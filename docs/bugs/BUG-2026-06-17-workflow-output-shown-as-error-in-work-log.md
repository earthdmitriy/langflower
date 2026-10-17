---
kind: bug
owner: docs
covers: []
status: current
date: 2026-06-17
flaw: `runResult` mixed two roles
package: ui
fixed: yes
---

### BUG-2026-06-17 — workflow output shown as error in work log

| Field                  | Value                                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-06-17                                                                                                                                                    |
| **Area**               | ui · execution · work log                                                                                                                                     |
| **Status**             | fixed                                                                                                                                                         |
| **Symptom**            | After running the constant cluster, concatenated output (e.g. `Hello Langflower` ×4 from Collect) appears in red error styling at the bottom of the work log. |
| **Repro**              | Run `example.json` constant → collect → … cluster; observe work log footer after successful completion.                                                       |
| **Root cause**         | `handleProgress` stored `payload.output` in `runResult$`; `runError` treats any value other than known success sentinels as a failure banner.                 |
| **Fix**                | On `completed` / `completed_with_errors`, set `runResult` to status text only, not workflow output.                                                           |
| **Design flaw signal** | **`runResult` mixed two roles** — terminal status banner vs final workflow output string.                                                                     |
| **Regression test**    | `none` (UI banner; output belongs in system timeline entries per node)                                                                                        |
