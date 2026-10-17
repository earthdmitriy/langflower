---
kind: bug
owner: docs
covers: []
status: current
date: 2026-07-25
flaw: Catalog-driven selects must s...
package: ui
fixed: yes
---

### BUG-2026-07-25b — Deleted provider leaves Inspector stuck (false “local” select)

| Field                  | Value                                                                                                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-07-25                                                                                                                                                                                              |
| **Area**               | ui · config                                                                                                                                                                                             |
| **Status**             | fixed                                                                                                                                                                                                   |
| **Symptom**            | After deleting a provider (e.g. `local2`), Helper Inspector still showed Model error `Provider "local2" is not configured` while Provider looked like `local`; changing Provider in the UI did nothing. |
| **Repro**              | Node `providerId=local2` → remove `local2` from langflower.jsonc → open Inspector: select shows first remaining provider label; params stay `local2`; Model disabled with missing-provider error.       |
| **Root cause**         | HTML `<select>` with no matching `<option>` displays the first option without updating the bound value; re-choosing that label often skips `change`.                                                    |
| **Fix**                | `withOrphanSelectOptions` in `lf-inline-field` — keep stale values visible as `… (missing)` so the user can pick a live catalog entry.                                                                  |
| **Design flaw signal** | Catalog-driven selects must surface orphaned stored values; never rely on the browser’s first-option display as the true selection.                                                                     |
| **Regression test**    | `packages/ui/src/app/components/lf-inline-field.test.ts` (`withOrphanSelectOptions`)                                                                                                                    |
