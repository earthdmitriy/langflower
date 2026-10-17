---
kind: bug
owner: docs
covers: []
status: current
date: 2026-08-31
flaw: Dedup keyed only on graph val...
package: common-nodes
fixed: yes
---

### BUG-2026-08-31 — Tool invoke hung on the second Run of the same canvas

| Field                  | Value                                                                                                                                                                                                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-08-31                                                                                                                                                                                                                                                            |
| **Area**               | common-nodes · tool-invoke                                                                                                                                                                                                                                            |
| **Status**             | fixed                                                                                                                                                                                                                                                                 |
| **Symptom**            | `common-tool-invoke` ran on the first Start, then hung on the next Start. Loading another workflow and coming back unstuck it.                                                                                                                                        |
| **Repro**              | Wire MCP tools → Tool invoke (fixed `toolId` + `args`) → Preview. Start, wait for result, Start again without rematerializing.                                                                                                                                        |
| **Root cause**         | `bind()` runs once per canvas instance; instances survive `done` → next `start`. Instance-local `lastCallKey` was `toolId`+`args` only, so the second run skipped with `EMPTY` after `withLoading` had already stamped pending. Rematerialize discarded the instance. |
| **Fix**                | Include `runId` in `lastCallKey`. Decide skip/empty/error **before** `withLoading` so a reconnect skip does not leave the output pending.                                                                                                                             |
| **Design flaw signal** | Dedup keyed only on graph values treats a new run as a tools reconnect. Run identity belongs in any instance-local “already did this” gate. Skipping after a loading stamp leaves the port pending forever.                                                           |
| **Regression test**    | `packages/common-nodes/src/tools/tool-invoke/node.test.ts` — same instance, new `runId`, same toolId/args → second `invoke`; reconnect still skips inside one run                                                                                                     |
