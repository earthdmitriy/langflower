---
kind: bug
owner: docs
covers: []
status: current
date: 2026-06-16
flaw: Duplicate lifecycle hooks
package: ui
fixed: yes
---

### BUG-2026-06-16 — duplicate empty LLM streaming placeholder in work log

| Field                  | Value                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-06-16                                                                                                          |
| **Area**               | ui · execution · llm                                                                                                |
| **Status**             | fixed                                                                                                               |
| **Symptom**            | Two empty assistant placeholders above the LLM node during streaming.                                               |
| **Repro**              | Run LLM node; watch work log while streaming starts.                                                                |
| **Root cause**         | `onNodeRunning` fired twice per attempt (pre-execute and `onRunning` callback inside `executeCommonNode`).          |
| **Fix**                | Reuse existing assistant message id on second running event; `removeOrphanLlmPlaceholders` on complete.             |
| **Design flaw signal** | **Duplicate lifecycle hooks** — batch executor and node runtime both signal “running” without idempotency contract. |
| **Regression test**    | `none` (UI timeline; server emits duplicate running today by design — UI dedupes)                                   |
