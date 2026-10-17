---
kind: bug
owner: docs
covers: []
status: current
date: 2026-08-04
flaw: Same as BUG-2026-07-25d: unse...
package: ui
fixed: yes
---

### BUG-2026-08-04 — Empty `model` paints first catalog label

| Field                  | Value                                                                                                                                                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-08-04                                                                                                                                                                                      |
| **Area**               | ui · config                                                                                                                                                                                     |
| **Status**             | fixed                                                                                                                                                                                           |
| **Symptom**            | Inspector Model showed a live catalog id (e.g. gemma) while `params.model` stayed `""`; Review threw `Model is required for Review chat`. Switching model away and back wrote a real id.        |
| **Repro**              | Skeleton / `kb-create` Review node with `providerId: "local"` and `model: ""`; open Inspector with a populated models catalog.                                                                  |
| **Root cause**         | `withSelectEmptyOption` prepended `Select…` for providers/skills but not `langflower.models`. With `value === ""`, no `<option>` got `[selected]`; the browser painted the first catalog entry. |
| **Fix**                | Prepend blank `Select…` for `langflower.models` (same as providers). No sole-model auto-bind (live catalogs can briefly show one entry).                                                        |
| **Design flaw signal** | Same as BUG-2026-07-25d: unset catalog selects need an explicit blank option; never trust the browser’s first-option paint as the stored value.                                                 |
| **Regression test**    | `packages/ui/src/app/features/sidebar/tests/select-empty-option.test.ts` (`langflower.models` Select…)                                                                                          |
