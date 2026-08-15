# Review

|              |                 |
| ------------ | --------------- |
| **Type**     | `common-review` |
| **Category** | AI              |

## Summary

Dedicated **Review** node (not an LLM role preset). Its job is **graph path
choice** via **node-private** control tools:

1. Internal tools `accept` / `feedback` (strong LLM descriptions) — defined under
   `ai/features/path-choice/`; imported only by Review / Critique — never merged into
   shared inventory or other LLM nodes.
2. Tool call payloads route to output ports: `accept` → `response` (passthrough
   of input `result`), `feedback` → `feedback` (revision notes).
3. Free-form / missing control tool → node appends a reminder user message and
   retries until `maxIterations`, then fail-closed.

**Requires a model with native tool / function calling.** Path choice reads
OpenAI-style `tool_calls` only; prose or markdown `tool_code` fences do not
route to `response` / `feedback`.

Built with `defineLlmNode`: shared inventory ports (`tools`, `mcp`,
`subagentRegistration`, `subagentResult`, `toolLog`, `subagent`) match
Fake/OpenAI LLM — Review is a **full agent plus** the accept/feedback fork, not
a yes/no stub.

## Inputs

| Port                   | Type                  | Notes                                          |
| ---------------------- | --------------------- | ---------------------------------------------- |
| `task`                 | string                | required — acceptance criteria                 |
| `result`               | string                | required — artifact under review               |
| `systemPrompt`         | string                | optional author criteria                       |
| `tools`                | tool-registration     | multi — optional inventory (domain packs, …)   |
| `mcp`                  | mcp-handle            | multi — ready handles (+ `EC.mcpHandles`)      |
| `subagentRegistration` | subagent-registration | multi — Sub-Agent catalog for `spawn_subagent` |
| `subagentResult`       | subagent-result       | merge — correlated spawn results               |

## Outputs

| Port            | Type           | Notes                                                                |
| --------------- | -------------- | -------------------------------------------------------------------- |
| `reasoning`     | string         | API reasoning tokens when provider emits them; feed role `reasoning` |
| `draftResponse` | string         | streamed content tokens before a tool call; feed role `draft`        |
| `toolLog`       | string         | tool lines + reminders; feed `tool`                                  |
| `response`      | string         | on **accept** — passthrough of `result`                              |
| `feedback`      | string         | on **feedback** — revision notes                                     |
| `subagent`      | subagent-spawn | when Review calls `spawn_subagent`                                   |

## Params

| Field            | Type    | Default  | Notes                                               |
| ---------------- | ------- | -------- | --------------------------------------------------- |
| `providerId`     | select  | —        | from `langflower.jsonc` providers                   |
| `model`          | select  | —        | per selected provider                               |
| `skillId`        | select  | —        | optional skill markdown                             |
| `maxIterations`  | number  | `5`      | caps non-compliant completions (`0` = unlimited)    |
| `contextSize`    | number  | `200000` | approx input token budget; shared OpenAI compaction |
| `compactOnError` | boolean | `false`  | retry once after context-length create error        |

## Forced tools (Review-private)

| Tool       | Port       | Arguments                        |
| ---------- | ---------- | -------------------------------- |
| `accept`   | `response` | optional `notes`                 |
| `feedback` | `feedback` | required `notes` (revision text) |

These chat tools must not appear on openai-llm / Fake inventories or harness
allowlists. They exist only on Review completion `tools` lists.
