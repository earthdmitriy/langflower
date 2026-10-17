---
kind: bug
owner: docs
covers: []
status: current
date: 2026-09-19
flaw: Index identity for user-owned...
package: shared
fixed: yes
---

### BUG-2026-09-19c — Settings draft pending keys follow array index

| Field                  | Value                                                                                                                             |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-09-19                                                                                                                        |
| **Area**               | shared · settings                                                                                                                 |
| **Status**             | fixed                                                                                                                             |
| **Symptom**            | After deleting provider row 0, row 1 can inherit the deleted row's pending `apiKey` / connection status. BUG-2026-07-22b class.   |
| **Repro**              | Two providers, pending key on index 0, `mergeDraftPatch` / `applyDraftPatch` with only the second row remaining.                  |
| **Root cause**         | `mergeDraftPatch` and `providerConnectionKey` keyed write-only secrets and connection map by array index.                         |
| **Fix**                | Match pending `apiKey` / secret `value` and connection keys by `row.id`. Empty-id rows do not inherit.                            |
| **Design flaw signal** | **Index identity for user-owned rows.** Rows that can be inserted/removed need a stable id, not the current array slot.           |
| **Regression test**    | `packages/ui/src/app/features/sidebar/tests/settings-draft.test.ts`; `packages/server/src/session/settings-draft-session.test.ts` |
