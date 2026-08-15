# Critique

|              |                   |
| ------------ | ----------------- |
| **Type**     | `common-critique` |
| **Category** | AI                |

## Summary

Dedicated **Critique** node (adversarial red-team). Same path-choice kernel as
Review (`accept` / `feedback` via `ai/features/path-choice/`), different LLM framing:

1. First input is the **original assignment / topic** — not acceptance criteria
   to fulfill.
2. Second input is the **packet to attack** (e.g. proposer draft).
3. `accept` → `response` (passthrough of `packet`) means «agreed enough to stop».
4. `feedback` → revision findings for the upstream author.
5. Free-form / missing control tool → reminder, retry, then fail-closed.

**Requires a model with native tool / function calling.**

Built with `defineLlmNode` from `@langflower/node-sdk`.

## Inputs

| Port                   | Type                  | Notes                                     |
| ---------------------- | --------------------- | ----------------------------------------- |
| `assignment`           | string                | required — original assignment / topic    |
| `packet`               | string                | required — artifact under attack          |
| `systemPrompt`         | string                | optional author attack rubric             |
| `tools`                | tool-registration     | multi — optional inventory                |
| `mcp`                  | mcp-handle            | multi — ready handles (+ `EC.mcpHandles`) |
| `subagentRegistration` | subagent-registration | multi — Sub-Agent catalog                 |
| `subagentResult`       | subagent-result       | merge — correlated spawn results          |

## Outputs

| Port            | Type           | Notes                                                                |
| --------------- | -------------- | -------------------------------------------------------------------- |
| `reasoning`     | string         | API reasoning tokens when provider emits them; feed role `reasoning` |
| `draftResponse` | string         | streamed content tokens before a tool call; feed role `draft`        |
| `toolLog`       | string         | tool lines + reminders; feed `tool`                                  |
| `response`      | string         | on **accept** — passthrough of `packet`                              |
| `feedback`      | string         | on **feedback** — attack / revision notes                            |
| `subagent`      | subagent-spawn | when Critique calls `spawn_subagent`                                 |

## Params

| Field            | Type    | Default  | Notes                                               |
| ---------------- | ------- | -------- | --------------------------------------------------- |
| `providerId`     | select  | —        | from `langflower.jsonc` providers                   |
| `model`          | select  | —        | per selected provider                               |
| `skillId`        | select  | —        | optional skill markdown                             |
| `maxIterations`  | number  | `5`      | caps non-compliant completions (`0` = unlimited)    |
| `contextSize`    | number  | `200000` | approx input token budget; shared OpenAI compaction |
| `compactOnError` | boolean | `false`  | retry once after context-length create error        |
