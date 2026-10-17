---
kind: bug
owner: docs
covers: []
status: current
date: 2026-09-19
flaw: `combineLatest` catalog tick...
package: ui
fixed: yes
---

### BUG-2026-09-19b — Composer HITL tabs return after settle (stale feed hydrate)

| Field                  | Value                                                                                                                                                                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-09-19                                                                                                                                                                                                                 |
| **Area**               | ui · composer · hitl                                                                                                                                                                                                       |
| **Status**             | fixed                                                                                                                                                                                                                      |
| **Symptom**            | After `runner.done`, a palette or workflow tick can reopen HITL composer tabs from the cached `executionFeed.snapshot`. Same class as BUG-2026-07-17c.                                                                     |
| **Repro**              | Hydrate awaiting from a feed snap → emit `runner.done` → re-emit palette/workflow without a new feed snap. Tabs come back.                                                                                                 |
| **Root cause**         | `hardReset` cleared `ids` and `live`. `hydrate$` is `combineLatest` of feed + catalog, so a catalog-only tick re-applies `computeHitlFromEvents` on the same events array. Server does not push a new feed snap on settle. |
| **Fix**                | Remember last feed `events` identity + `runId`. Ignore hydrate when it is the same array, or the same `runId` after a reset-to-empty.                                                                                      |
| **Design flaw signal** | **`combineLatest` catalog tick ≠ new snapshot.** After settle, a cached snap is not new evidence. Gate hydrate on snap identity / run id, not every combine emission.                                                      |
| **Regression test**    | `packages/ui/src/app/features/composer/tests/execution-hitl-fold.test.ts`                                                                                                                                                  |
