---
kind: bug
owner: docs
covers: []
status: current
date: 2026-07-19
flaw: Inventory filtering ≠ executi...
package: common-nodes
fixed: yes
---

### BUG-2026-07-19b — Tool allowlist filtered inventory only, not invoke

| Field                  | Value                                                                                                                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-07-19                                                                                                                                                             |
| **Area**               | execution · common-nodes                                                                                                                                               |
| **Status**             | fixed                                                                                                                                                                  |
| **Symptom**            | `enabledToolIds` hid tools from the model inventory, but a hallucinated `tool_calls` name could still invoke any builtin via `ctx.harness`.                            |
| **Repro**              | Internal loop with inventory `['read']`; completion returns `write` tool call → harness wrote the file.                                                                |
| **Root cause**         | Allowlist applied only in `mergeToolInventory`; `runInternalToolLoop` invoked harness without checking the filtered tools list.                                        |
| **Fix**                | Reject non-allowlisted tool ids before invoke in `run-internal-tool-loop.ts` (handler path or `harness.invoke`).                                                       |
| **Design flaw signal** | **Inventory filtering ≠ execution gate.** Author-time allowlists must be enforced at invoke, not only at prompt/tool-definition assembly.                              |
| **Regression test**    | `packages/common-nodes/src/ai/run-internal-tool-loop.test.ts`                                                                                                          |
| **Follow-up**          | Domain/custom tools no longer use a harness `toolId` map — attach `registration.handler` ([ADR-019](../adr/019-toolhandle-invocation-not-harness-toolid-registry.md)). |
