---
kind: bug
owner: docs
covers: []
status: current
date: 2026-06-16
flaw: Editor-scoped state
package: ui
fixed: yes
---

### BUG-2026-06-16 — WorkflowCatalogService NG0201 in editor

| Field                  | Value                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-06-16                                                                                           |
| **Area**               | ui · angular di                                                                                      |
| **Status**             | fixed                                                                                                |
| **Symptom**            | `NG0201` — no provider for `WorkflowSyncService` when using workflow picker.                         |
| **Repro**              | Open editor with workflow picker after catalog was `providedIn: 'root'`.                             |
| **Root cause**         | Catalog service injected editor-scoped `WorkflowSyncService` from root scope.                        |
| **Fix**                | Provide `WorkflowCatalogService` on `EditorPageComponent` instead of root.                           |
| **Design flaw signal** | **Editor-scoped state** was not documented; root singletons must not depend on page-scoped services. |
| **Regression test**    | `none` (runtime DI; manual editor smoke)                                                             |
