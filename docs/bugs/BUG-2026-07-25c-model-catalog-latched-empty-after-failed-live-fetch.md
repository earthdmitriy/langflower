---
kind: bug
owner: docs
covers: []
status: current
date: 2026-07-25
flaw: Live option catalogs are serv...
package: ui
fixed: yes
---

### BUG-2026-07-25c — Model catalog latched empty after failed live fetch

| Field                  | Value                                                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-07-25                                                                                                                                                                            |
| **Area**               | ui · ws · config                                                                                                                                                                      |
| **Status**             | fixed                                                                                                                                                                                 |
| **Symptom**            | Inspector Model stayed on muted “No models available” even after LM Studio / `baseURL` were correct; server `models.refresh` returned a full list when probed.                        |
| **Repro**              | First fetch empty (missing `/v1` or provider briefly down) → fix config → keep Inspector open without provider change: list never refreshes.                                          |
| **Root cause**         | Live catalogs were **client-authoritative** (`models.refresh.requested` + Inspector latch). Empty/wrong first answers left the UI owning retry policy instead of the server.          |
| **Fix**                | Server-pushed `langflower.models.catalog.snapshot` after config on connect/Save; UI folds only (`ModelsCatalogProjectionService`); removed client refresh intent and latch machinery. |
| **Design flaw signal** | Live option catalogs are server facts (like palette/config), not Inspector RPC. Client latch/retry is a smell that authority is on the wrong side of the bus.                         |
| **Regression test**    | `packages/server/src/bridge/push-models-catalog.test.ts`; `packages/ui/src/app/services/tests/models-catalog-projection.service.test.ts`                                              |
