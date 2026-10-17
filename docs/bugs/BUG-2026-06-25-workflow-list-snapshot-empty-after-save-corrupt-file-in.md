---
kind: bug
owner: docs
covers: []
status: current
date: 2026-06-25
flaw: Catalog listing treated files...
package: server
fixed: yes
---

### BUG-2026-06-25 — workflow.list.snapshot empty after save (corrupt file in catalog)

| Field                  | Value                                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Date**               | 2026-06-25                                                                                                                           |
| **Area**               | server                                                                                                                               |
| **Status**             | fixed                                                                                                                                |
| **Symptom**            | Save succeeds but following `workflow.list.snapshot` has `workflows: []`                                                             |
| **Repro**              | Place invalid JSON in `.langflower/workflows/`; save any valid workflow via WS                                                       |
| **Root cause**         | `WorkflowService.list()` used `Promise.all` over all files; one parse failure rejected the batch and the outer `catch` returned `[]` |
| **Fix**                | Per-file try/catch in `workflow.service.ts`; skip invalid files, return valid entries                                                |
| **Design flaw signal** | Catalog listing treated filesystem as atomic all-or-nothing; partial corruption must not hide valid workflows                        |
| **Regression test**    | `packages/server/src/workflow/workflow.service.test.ts`; `tests/integration/ws/workflows.ws.test.ts`                                 |
