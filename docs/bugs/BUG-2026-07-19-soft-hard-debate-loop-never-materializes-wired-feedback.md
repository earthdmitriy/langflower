---
kind: bug
owner: docs
covers: []
status: current
date: 2026-07-19
flaw: `defaultValue` is not a cycle...
package: common-nodes
fixed: yes
---

### BUG-2026-07-19 — Soft↔Hard debate loop never materializes (wired feedback)

| Field                  | Value                                                                                                                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-07-19                                                                                                                                                                                           |
| **Area**               | execution · common-nodes                                                                                                                                                                             |
| **Status**             | fixed                                                                                                                                                                                                |
| **Symptom**            | Soft↔Hard debate (`soft-vs-hard-harness` / fake-llm debate-loop) starts `running` but Soft never emits `response` / reasoning; UI looks stuck.                                                       |
| **Repro**              | Topic → Soft.userPrompt; Soft.response → Hard.userPrompt; Hard.response → Soft.feedback; no finish. Run with `common-fake-llm` (`tokenDelayMs: 0`).                                                  |
| **Root cause**         | Soft `combineInputs` included `feedback`. Wiring Hard→Soft.feedback marked the slot wired, so `applyPortDefaults` skipped `defaultValue: ''`. Soft waited for Hard; Hard waited for Soft.            |
| **Fix**                | ADR-016: init combine without feedback; feedback turn stream with `startWith` outside init (`openai-llm` + minimal split on `fake-llm`).                                                             |
| **Design flaw signal** | **`defaultValue` is not a cycle primer when the port is wired.** Loop-back turns need an explicit turn stream, not inventory-port defaults.                                                          |
| **Regression test**    | `packages/common-nodes/src/ai/nodes/fake-llm/debate-loop.node.test.ts`; `tests/integration/ws/execute-fake-llm-debate-loop.ws.test.ts`; openai multi-turn/init-recreate in `openai-llm/node.test.ts` |
