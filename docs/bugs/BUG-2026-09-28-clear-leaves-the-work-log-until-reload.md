---
kind: bug
owner: docs
covers: []
status: current
date: 2026-09-28
flaw: Identity equality on nullable...
package: ui
fixed: yes
---

### BUG-2026-09-28 — Clear leaves the work log until reload

| Field                  | Value                                                                                                                                                                                                                                                                                                 |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-09-28                                                                                                                                                                                                                                                                                            |
| **Area**               | ui · feed · executionFeed                                                                                                                                                                                                                                                                             |
| **Status**             | fixed                                                                                                                                                                                                                                                                                                 |
| **Symptom**            | Work-log Clear does nothing. Reload shows an empty feed (server clear worked).                                                                                                                                                                                                                        |
| **Repro**              | Open the editor (bootstrap `executionFeed.snapshot` is `null`), run a workflow, click Clear. Feed rows stay until refresh.                                                                                                                                                                            |
| **Root cause**         | Regression of BUG-2026-07-23b. `composeFeedProjection` again paired the snapshot with the catalog through `combineLatest` + `distinctUntilChanged` on snapshot identity. Bootstrap `null` and Clear `null` compare equal, so the clear action never reached the scan. Live `runner.port` rows stayed. |
| **Fix**                | Drive snapshot actions from `executionFeed.snapshot` with `switchMap` + `catalog$.pipe(take(1))` so every emission, including a repeated `null`, applies. Catalog churn does not replay the snapshot.                                                                                                 |
| **Design flaw signal** | **Identity equality on nullable snapshots** — `null` cannot distinguish “idle bootstrap” from “cleared after live appends”. Event-sourcing clear must react to the emission, not only to a new payload identity.                                                                                      |
| **Regression test**    | `packages/ui/src/app/features/feed-folding/tests/execution-feed.service-replay.test.ts` — `clears live rows when a second null snapshot arrives`                                                                                                                                                      |
