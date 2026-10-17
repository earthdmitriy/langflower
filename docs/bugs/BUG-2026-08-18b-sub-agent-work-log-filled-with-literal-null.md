---
kind: bug
owner: docs
covers: []
status: current
date: 2026-08-18
flaw: `statefulObservable( input: c...
package: common-nodes
fixed: yes
---

### BUG-2026-08-18b — Sub-Agent work log filled with literal `null`

| Field                  | Value                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-08-18                                                                                                                                                                                                                                                                                                                                                             |
| **Area**               | ui · common-nodes                                                                                                                                                                                                                                                                                                                                                      |
| **Status**             | fixed                                                                                                                                                                                                                                                                                                                                                                  |
| **Symptom**            | Researcher Sub-Agent visit showed repeating Tool / Reasoning / DRAFT cards whose bodies were the string `null` (e.g. `Reasoning: context null`).                                                                                                                                                                                                                       |
| **Repro**              | Plan → Researcher. Ask Plan to delegate. Watch the Researcher work-log card while it streams.                                                                                                                                                                                                                                                                          |
| **Root cause**         | Sub-Agent wrapped a chunk `Subject` in `statefulObservable({ input })`. Each token re-emits a loading sentinel; `pipeValue` passes loading to **every** demuxed port. Runtime telemetry is `pending`+`null` (JSON has no `undefined`). Fold only dropped `pending`+`undefined`, so growing-merge appended `"null"` and sibling ports opened empty Tool/Draft segments. |
| **Fix**                | Drive the specialist cycle with `context$.pipeValue(switchMap(() => chunks$))` (inner chunks are values, not per-token loads). Fold also drops `pending`+`null`.                                                                                                                                                                                                       |
| **Design flaw signal** | `statefulObservable({ input: chunks$ })` is not a paced session. Loading is not a feed value; WS/JSON pending is `null`, not `undefined`.                                                                                                                                                                                                                              |
| **Regression test**    | `packages/ui/src/app/features/feed-folding/tests/execution-feed.service-inputs.test.ts` (pending null); `packages/common-nodes/src/ai/nodes/sub-agent/node.test.ts` (no sibling pending per chunk)                                                                                                                                                                     |
