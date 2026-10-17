---
kind: bug
owner: docs
covers: []
status: current
date: 2026-07-27
flaw: Silent success on truncated p...
package: common-nodes
fixed: yes
---

### BUG-2026-07-27b — `finish_reason=length` and opaque errors looked finished or dead

| Field                  | Value                                                                                                                                                                                                                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-07-27                                                                                                                                                                                                                                                                   |
| **Area**               | common-nodes · LLM · provider recovery                                                                                                                                                                                                                                       |
| **Status**             | fixed                                                                                                                                                                                                                                                                        |
| **Symptom**            | LM Studio could end a stream with `finish_reason: "length"` and the loop treated it as a normal done (or stalled without operator recourse). Opaque unclassified throws were `recoverable: false`, so the cycle died with little Steer path.                                 |
| **Repro**              | OpenAI-compatible stream whose last choice has `finish_reason: "length"` (possibly truncated tool JSON); or throw an unclassified Error from the factory with `maxTransientRetries: 0`.                                                                                      |
| **Root cause**         | Stream adapter ignored `finish_reason`; classifier marked `unknown` (and stream-without-done protocol) as non-recoverable, so failures either looked like success or hard-stopped the Observable.                                                                            |
| **Fix**                | Plumb `finishReason` on `done` / `provider.done`; treat length / incomplete tool JSON as `output-truncation` (no tool run; compact+retry or Steer); mark `unknown` and stream-without-done as recoverable with mandatory `toolLog` then retry/Steer. Auth/config stay fatal. |
| **Design flaw signal** | **Silent success on truncated provider output** and **opaque failure as Observable death** — anything not clearly auth/config must surface diagnostics and enter retry → Steer, never silent complete or silent kill.                                                        |
| **Regression test**    | `ai/features/openai/create-chat-completion-stream.test.ts` (`mapFinishReason`), `ai/features/llm-loop/run-agent-loop.test.ts` (length → no tools + Steer; unknown → Steer; 401 fatal), `ai/features/llm-loop/llm-loop-reducer.test.ts` (unknown recoverable)                 |
