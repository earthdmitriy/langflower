---
kind: bug
owner: docs
covers: []
status: current
date: 2026-06-18
flaw: Mock LLM state split
package: server
fixed: yes
---

### BUG-2026-06-18 — Mock agent cached script / reset callIndex broke mock matching

| Field                  | Value                                                                                                                                                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Date**               | 2026-06-18                                                                                                                                                                                                                                             |
| **Area**               | execution · server · agent · mock-llm                                                                                                                                                                                                                  |
| **Status**             | fixed                                                                                                                                                                                                                                                  |
| **Symptom**            | Bootstrap plan and agent mock integration tests returned default mock text (`Mock response`, bootstrap default greeting) instead of scripted tool-loop / plan content. LLM+HITL feedback loop timed out waiting for second `execution.awaiting_input`. |
| **Repro**              | Run `plan` workflow with seeded `mock-llm.json.tpl`, or `llm-hitl` with `callIndex` + `hasFeedback` entries; observe wrong mock content or hung HITL loop.                                                                                             |
| **Root cause**         | `createAgentExecuteFn` cached `scriptPromise` (stale script) and/or reset `callIndex` to 0 on every agent invocation, so multi-step tool loops and feedback-loop second calls matched the wrong mock entry.                                            |
| **Fix**                | Reload `mock-llm.json` on each mock agent call; persist per-run `llmCallIndex` as `startCallIndex` and advance from `executeMockAgentLoop` `finalCallIndex`. File: `packages/server/src/agent/execute-agent.ts`.                                       |
| **Design flaw signal** | **Mock LLM state split** — script freshness and call-index cursor are separate concerns; caching one while resetting the other breaks ordered `when.callIndex` scripts.                                                                                |
| **Regression test**    | Live Fake LLM WS: `tests/integration/ws/execute-fake-llm.ws.test.ts`.                                                                                                                                                                                  |
