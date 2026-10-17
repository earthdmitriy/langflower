---
kind: bug
owner: docs
covers: []
status: current
date: 2026-07-25
flaw: Unset select values need an e...
package: ui
fixed: yes
---

### BUG-2026-07-25d — Empty `providerId` hides live catalog models

| Field                  | Value                                                                                                                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-07-25                                                                                                                                                                               |
| **Area**               | ui · config                                                                                                                                                                              |
| **Status**             | fixed                                                                                                                                                                                    |
| **Symptom**            | WS showed a full `langflower.models.catalog.snapshot`, but Inspector Model stayed empty; Provider looked selected.                                                                       |
| **Repro**              | Fresh skeleton workflow (`providerId: ""`) with one global provider → open LLM Inspector without changing Provider.                                                                      |
| **Root cause**         | HTML `<select>` with value `""` paints the first provider label while params stay `""`; Model resolved `catalogs[""]`. Same class as BUG-2026-07-25b, for unset rather than deleted ids. |
| **Fix**                | Blank `Select…` option for `""`; treat empty providerId as unset; auto-bind the sole configured provider; keep models catalog projection eagerly hot.                                    |
| **Design flaw signal** | Unset select values need an explicit blank option; never infer “selected provider” from the painted label.                                                                               |
| **Regression test**    | `packages/ui/src/app/components/lf-inline-field.test.ts` (empty-string blank option)                                                                                                     |
