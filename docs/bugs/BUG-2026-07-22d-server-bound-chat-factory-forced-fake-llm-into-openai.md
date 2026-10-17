---
kind: bug
owner: docs
covers: []
status: current
date: 2026-07-22
flaw: Optional test-injection field...
package: common-nodes
fixed: yes
---

### BUG-2026-07-22d — Server-bound chat factory forced Fake LLM into OpenAI resolve

| Field                  | Value                                                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Date**               | 2026-07-22                                                                                                                                                               |
| **Area**               | server · common-nodes · fake-llm                                                                                                                                         |
| **Status**             | fixed                                                                                                                                                                    |
| **Symptom**            | WS `execute-fake-llm` timed out; runtime errors `Provider "fake" is not configured` while Fake should stream the imitate path.                                           |
| **Repro**              | Run `tests/integration/ws/execute-fake-llm.ws.test.ts` after LLM session-shell drain (server always injects `createChatCompletionStream`).                               |
| **Root cause**         | `buildExecutionContext` bound OpenAI `createChatCompletionStream` on every node; Fake treated any EC factory as “enable tool loop” and called `resolveProvider("fake")`. |
| **Fix**                | Omit `createChatCompletionStream` for `common-fake-llm`; prefer scripted factory over injected EC factory when `scriptedToolTurns` is set.                               |
| **Design flaw signal** | Optional test-injection field reused as always-on server bind without per-node product semantics — Fake’s default imitate path was overridden silently.                  |
| **Regression test**    | `packages/server/src/bridge/build-execution-context.test.ts` — omits factory for Fake; `tests/integration/ws/execute-fake-llm.ws.test.ts`                                |
