---
kind: bug
owner: docs
covers: []
status: current
date: 2026-07-23
flaw: Identity equality on nullable...
package: ui
fixed: yes
---

### BUG-2026-07-23b — Clear clears canvas chrome but not the work-log feed

| Field                  | Value                                                                                                                                                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-07-23                                                                                                                                                                                                                                                                            |
| **Area**               | ui · feed · executionFeed                                                                                                                                                                                                                                                             |
| **Status**             | fixed                                                                                                                                                                                                                                                                                 |
| **Symptom**            | Work-log Clear removes node/edge highlights but leaves feed rows. Tab reload shows an empty feed (server clear worked).                                                                                                                                                               |
| **Repro**              | Run any workflow → Clear in work log → canvas chrome gone, feed still full.                                                                                                                                                                                                           |
| **Root cause**         | Clear re-broadcasts `executionFeed.snapshot = null` after bootstrap already sent `null`. Feed fold used `combineLatest` + `distinctUntilChanged` on snap identity (`null === null`), so the clear was suppressed while live turns stayed in the scan. Chrome fold has no such filter. |
| **Fix**                | Drive snapshot actions from `executionFeed.snapshot` with `switchMap` + `catalog$.pipe(take(1))` so every feed emission (including repeated null) applies, without re-folding on catalog churn.                                                                                       |
| **Design flaw signal** | **Identity equality on nullable snapshots** — `null` cannot distinguish “idle bootstrap” from “cleared after live appends”. Event-sourcing clear must react to the emission, not only to a new payload identity.                                                                      |
| **Regression test**    | `packages/ui/src/app/features/feed-folding/tests/execution-feed.service-replay.test.ts` — `replaces history from snapshots and clears it on null`                                                                                                                                     |
