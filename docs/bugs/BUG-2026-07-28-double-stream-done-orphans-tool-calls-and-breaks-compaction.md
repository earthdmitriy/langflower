---
kind: bug
owner: docs
covers: []
status: current
date: 2026-07-28
flaw: Duplicate reduce of the same...
package: common-nodes
fixed: yes
---

### BUG-2026-07-28 — double stream.done orphans tool_calls and breaks compaction

| Field                  | Value                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-07-28                                                                                                                                                                                                                                                                                                                                                |
| **Area**               | common-nodes · LLM · tool loop · context compaction                                                                                                                                                                                                                                                                                                       |
| **Status**             | fixed                                                                                                                                                                                                                                                                                                                                                     |
| **Symptom**            | Feed shows `Provider failure: Cannot compact history: incomplete assistant tool_calls / tool result block`, retries 1/2 and 2/2, then pauses for Steer/Resume. Resume often fails the same way.                                                                                                                                                           |
| **Repro**              | OpenAI-compatible agent tool round that later exceeds `contextSize` and triggers proactive compaction (or seed history with an incomplete assistant/`tool_calls` block).                                                                                                                                                                                  |
| **Root cause**         | On `provider.done` with `tool_calls`, `providerFactAction` reduced `stream.done` in the scan **and** `decisionPackets` `run-tools` reduced `stream.done` again. Tools closed only the second assistant block; the first orphan stayed incomplete and failed `toBlocks`. Compaction errors were classified as recoverable `unknown` and uselessly retried. |
| **Fix**                | Scan skips `stream.done` when tool calls are present (policy owns the sole commit); path-choice builds synthetic history from `roundCheckpoint`; empty-pending tools roll back to checkpoint; `Cannot compact history:` → `protocol` with Steer and no transient retries.                                                                                 |
| **Design flaw signal** | **Duplicate reduce of the same provider fact** — scan + policy must not both append the same assistant/`tool_calls` block; structural history failures are not transient provider outages.                                                                                                                                                                |
| **Regression test**    | `ai/features/llm-loop/run-agent-loop.test.ts` (single closed tool block; compaction protocol → Steer without retries), `ai/features/llm-loop/llm-loop-reducer.test.ts` (classify), `ai/features/path-choice/run-path-choice-tool-loop.test.ts` (historySync pair), `ai/features/openai/llm-context-compaction.test.ts` (incomplete block reject)          |
