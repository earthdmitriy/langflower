---
kind: bug
owner: docs
covers: []
status: current
date: 2026-06-18
flaw: Agent loop used OpenAI JSON h...
package: server
fixed: yes
---

### BUG-2026-06-18 — Agent tool loop step 2+ InvalidPromptError (legacy ModelMessage)

| Field                  | Value                                                                                                                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-06-18                                                                                                                                                                                                                |
| **Area**               | execution · server · runtime · agent                                                                                                                                                                                      |
| **Status**             | fixed                                                                                                                                                                                                                     |
| **Symptom**            | After first successful tool call, agent loop failed with `AI_InvalidPromptError` (`role: tool` message had string `content`). Downstream Ask User showed unhandled `statefulObservable` errors.                           |
| **Repro**              | Run `coder` workflow with LM Studio; prompt that triggers a tool call (e.g. `read spec.md`); observe failure on second `streamText` iteration.                                                                            |
| **Root cause**         | Agent loop appended legacy OpenAI messages (`toolCalls`, string tool `content`). Tool invocations ran imperatively in server outside runtime `statefulObservable` error lifecycle.                                        |
| **Fix**                | `build-ai-sdk-messages.ts` — ModelMessage content-parts + `system` option; `runAgentToolCalls` in `@langflower/runtime` wraps each tool step in `statefulObservable`; `execute-agent.ts` delegates tool batch to runtime. |
| **Design flaw signal** | **Agent loop used OpenAI JSON history while LLM client moved to AI SDK v6** — message serialization and tool execution must share runtime lifecycle and error$ contract.                                                  |
| **Regression test**    | `packages/server/src/llm/build-ai-sdk-messages.test.ts`, `packages/runtime/src/agent/run-agent-tool-calls.test.ts`                                                                                                        |
