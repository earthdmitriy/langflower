---
kind: bug
owner: docs
covers: []
status: current
date: 2026-07-21
flaw: Per-token demo pacing is an e...
package: common-nodes
fixed: yes
---

### BUG-2026-07-21c — Fake LLM final response appeared missing

| Field                  | Value                                                                                                                                                                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-07-21                                                                                                                                                                                                                               |
| **Area**               | execution · common-nodes                                                                                                                                                                                                                 |
| **Status**             | fixed                                                                                                                                                                                                                                    |
| **Symptom**            | Fake LLM streamed `reasoning` and `draftResponse`, but downstream `response` appeared never to arrive in the default demo configuration.                                                                                                 |
| **Repro**              | Subscribe to `common-fake-llm.response` with its default `tokenDelayMs: 40`; the final value arrived after approximately 35 seconds.                                                                                                     |
| **Root cause**         | The fake provider delayed every whitespace token in two deliberately long text blocks. The terminal `response` is emitted only after both streams finish, so the 40 ms default accumulated into a long silent wait for downstream ports. |
| **Fix**                | Stream sentence-sized chunks instead of whitespace tokens. The visible stream remains paced at 40 ms, while the terminal response follows promptly.                                                                                      |
| **Design flaw signal** | **Per-token demo pacing is an end-to-end latency contract.** When terminal work is sequenced after a stream, token granularity controls downstream completion time, not merely UI animation.                                             |
| **Regression test**    | `packages/common-nodes/src/ai/nodes/fake-llm/node.test.ts` — standard Fake LLM stream test now runs with the default delay and requires `response`.                                                                                      |
