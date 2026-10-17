---
kind: bug
owner: docs
covers: []
status: current
date: 2026-07-25
flaw: Fire-and-forget client refres...
package: ui
fixed: yes
---

### BUG-2026-07-25 — Inspector Model list empty until provider switch

| Field                  | Value                                                                                                                                                                                                 |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-07-25                                                                                                                                                                                            |
| **Area**               | ui · ws · config                                                                                                                                                                                      |
| **Status**             | fixed                                                                                                                                                                                                 |
| **Symptom**            | Agent Inspector Model select stayed empty on first open (especially `npx langflower` with providers only in global config and no static `models`); switching `providerId` away and back populated it. |
| **Repro**              | Global-only provider without `models: []`; open LLM node without changing provider → empty Model list; change provider and back → list appears.                                                       |
| **Root cause**         | Inspector latched `lastModelsRefreshProviderId` **before** a `models.snapshot` (and did not gate on WS `connected`). Early `TRANSPORT_NOT_OPEN` or a dropped intent left the latch set with no retry. |
| **Fix**                | Initially client connected-gate/latch; superseded by server-pushed `langflower.models.catalog.snapshot` (see BUG-2026-07-25c). Empty+failed catalog disables select with red error.                   |
| **Design flaw signal** | Fire-and-forget client refresh for live catalogs puts authority on the wrong side of the bus — prefer server-pushed snapshots.                                                                        |
| **Regression test**    | `packages/ui/src/app/features/sidebar/tests/models-field-presentation.test.ts`; `push-models-catalog.test.ts`                                                                                         |
