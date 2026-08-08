---
name: Langflower workflow writer
description: >-
    Guides authors writing and editing `.langflower/workflows/*.json` graphs
    (catalog node types, real ports, Soft↔Hard loops, Sub-Agent L0 wiring).
---

# Langflower workflow writer

You help the user **author valid Langflower workflow JSON** under
`.langflower/workflows/`.

## Honesty (do not invent)

- Use only **catalog** node `type` strings that exist in the project palette /
  common-nodes. Do **not** invent types (e.g. there is no `common-hitl` —
  use `common-hitl-review-gate`).
- Use only **real port ids** from each node’s definition / `NODE.md`. Wrong
  ports are stripped on load (graceful repair) — inventing ports breaks the
  graph.
- Identity is the **filename stem** (`my-flow.json` → `workflowId: my-flow`).
  Do not put `id` inside `metadata`.
- Tool allowlists use plain builtin ids: `read`, `glob`, `grep`, `edit`,
  `write`, `create`, `delete`, `bash` — never `Bash(ls)`-style strings.
- LLM `rolePreset` values are only: `custom` | `plan` | `coder` | `explorer`.
  Unknown values silently become `custom`.

## On-disk shape

```json
{
	"$schema": "../schemas/workflow.schema.json",
	"metadata": {
		"name": "Display name",
		"description": "optional",
		"createdAt": "ISO-8601",
		"updatedAt": "ISO-8601"
	},
	"graph": {
		"viewport": { "x": 0, "y": 0, "scale": 1 },
		"nodes": [],
		"edges": []
	}
}
```

Schema: `.langflower/schemas/workflow.schema.json`. Samples:
`.langflower/workflows/*.json`.

## Ports you must get right

| Node type                               | Key ports                                                                                                            |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `common-chat-input`                     | out `message` (no wireable in)                                                                                       |
| `common-openai-llm` / `common-fake-llm` | in `userPrompt`, `systemPrompt`, `feedback`, `subagentRegistration`, `subagentResult`; out `response`, `subagent`, … |
| `common-hitl-review-gate`               | in `result`; out `response`, `feedback`                                                                              |
| `common-merge`                          | in/out **`value`** only (not `step` / `output`)                                                                      |
| `common-review`                         | in `task`, `result`, `systemPrompt`; out `response`, `feedback`                                                      |
| `common-sub-agent`                      | out `registration`, `result`; in `task`, `systemPrompt`                                                              |
| `common-finish`                         | in `value`                                                                                                           |
| `common-string`                         | in/out `value`                                                                                                       |

## Soft↔Hard loops

Typical HITL revise loop:

1. LLM `response` → Review Gate `result`
2. Gate `feedback` → (optional Merge `value`) → LLM `feedback`
3. Gate `response` → next stage (coder, finish, …)

Do **not** feed Merge output into both gates and LLM feedback on every tick
without a clear phase split.

## Sub-Agent L0 (registration + spawn)

Mirror `.langflower/workflows/kb-navigate.json`:

- Sub-Agent `registration` → parent `subagentRegistration`
- Parent `subagent` → Sub-Agent `task`
- Sub-Agent `result` → parent `subagentResult`

## Load repair (product fact)

If a workflow lists in the catalog but contains unknown node types or bad
ports, Langflower **loads what it can**: drops invalid nodes/edges, opens the
rest as **dirty**. Save persists the cleaned graph. Prefer writing a valid
graph the first time.

## When drafting

1. Pick a stable filename stem and metadata name.
2. Place nodes with real `type` / `params` / `inputs` / `ui.position`.
3. Wire edges with `[portId, slotIndex]` tuples.
4. Prefer copying structure from an existing sample, then editing.
5. Remind the user to reload the workflow in the topbar and Save if repair ran.
