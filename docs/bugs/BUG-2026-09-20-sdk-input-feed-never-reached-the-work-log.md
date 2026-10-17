---
kind: bug
owner: docs
covers: []
status: current
date: 2026-09-20
flaw: Author contract without a run...
package: ui
fixed: yes
---

### BUG-2026-09-20 — SDK input `feed` never reached the work log

| Field                  | Value                                                                                                                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-09-20                                                                                                                                                                                         |
| **Area**               | runtime · ui · feed                                                                                                                                                                                |
| **Status**             | fixed                                                                                                                                                                                              |
| **Symptom**            | `makeInput(..., { feed: { role: 'result' } })` was accepted by the SDK and exercised in UI fixtures, but a marked input never appeared in the work log. Unmarked inputs stayed hidden as designed. |
| **Repro**              | Declare an input `feed` role, run the graph, inspect `runner.port` `'in'` tuples — slot 6 was always `null`. The fold then treated `null` as "ask the palette" and resolved no role for inputs.    |
| **Root cause**         | All six `'in'` emit sites called `emitPortEvent` without `defaultFeed`. The UI catalog fallback existed only to paper over that gap, and for inputs it always omitted the frame.                   |
| **Fix**                | Runtime stamps the **target** port `feed` (or `null`) on every `'in'` frame. The fold reads slot 6 only; catalog fallback / `resolveOutputFeedRole` deleted.                                       |
| **Design flaw signal** | **Author contract without a runtime path.** Accepting metadata the emitter never stamps trains a silent capability. If the UI then re-derives the same field from a catalog, the gap stays hidden. |
| **Regression test**    | `packages/ui/src/app/features/feed-folding/tests/execution-feed.service-inputs.test.ts` (`renders an input frame that declares feed result`); `packages/runtime/src/port-feed-meta.test.ts`        |
