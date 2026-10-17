---
kind: bug
owner: docs
covers: []
status: current
date: 2026-06-18
flaw: Assumed raw OpenAI tool JSON...
package: server
fixed: yes
---

### BUG-2026-06-18 — Agent tools rejected by OpenAI-compatible servers (missing parameters.type)

| Field                  | Value                                                                                                                                                                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-06-18                                                                                                                                                                                                                                |
| **Area**               | execution · server · agent                                                                                                                                                                                                                |
| **Status**             | fixed                                                                                                                                                                                                                                     |
| **Symptom**            | Agent run against LM Studio returned `AI_APICallError: Bad Request` with Zod `invalid_union_discriminator` on all tools (`parameters.type` expected `'object'`). Workflow failed with `NODE_EXECUTION_FAILED` / `NoOutputGeneratedError`. |
| **Repro**              | Run `coder` workflow with `lmstudio/local-model` and LM Studio on `http://127.0.0.1:1234/v1`; agent node with built-in harness tools.                                                                                                     |
| **Root cause**         | `buildOpenAiToolSchemas` returned a raw OpenAI tool **array**, passed to AI SDK v6 `streamText({ tools })`. SDK treated array indices as tool names and emitted empty parameter schemas without `type: 'object'`.                         |
| **Fix**                | `buildAiSdkToolSet` in `packages/server/src/llm/build-ai-sdk-tool-set.ts` — ToolSet via `tool()` + `jsonSchema()` + `inputSchema`; used in `execute-agent.ts` and `execute-review.ts`.                                                    |
| **Design flaw signal** | **Assumed raw OpenAI tool JSON is accepted by AI SDK `streamText`** — SDK v6 requires ToolSet + `inputSchema`; provider-specific serialization belongs in one adapter layer.                                                              |
| **Regression test**    | `packages/server/src/llm/build-ai-sdk-tool-set.test.ts`                                                                                                                                                                                   |
