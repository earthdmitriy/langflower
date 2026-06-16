# Phase 4 — Per-tool author-time allowlists (MCP skipped)

**Status:** done  
**Depends on:** [Phase 3](llm-nodes-phase-03-fake-llm-panel.md)  
**Index:** [llm-nodes-README.md](llm-nodes-README.md)

## Goal

Each LLM **instance** can enable/disable individual **wired tools** via Inspector
checkboxes (author-time allowlist). Show **name + description** per tool.

**MCP is out of investment for this epic:** keep `mcp` input port + wire type as
placeholders with `TODO` comments; no fake-mcp node, no MCP multiselect UX, no
invoke.

## Allowlist ≠ runtime permissions

This phase only stores `enabledToolIds` on the instance. It does **not** implement
ask/deny/escalation. Document the split in `LLM_NODES.md` (see README).

## UX — tool toggles

| Control          | Presentation                                              |
| ---------------- | --------------------------------------------------------- |
| Tool multiselect | Checkbox + **name**; muted **description** when non-empty |
| Empty wire set   | Hint: “Wire tool-registration nodes to enable toggles”    |
| MCP              | No picker; port may remain on node for future wiring      |

Reuse `InlineSelectOption.description` from phase 2.

## In scope

- Panel: `enabledToolIds` — `tool-id-list`, `optionsSource: 'node.wiredTools'`
- Inspector resolves wired tools from edges into `tools` / `tools@N` →
  `{ value: toolId, title: name, description }`
- Multiselect: title + optional description line
- `filterEnabledRegistrations` — `undefined` = all; else allowlist; new wires
  append when explicit array (opt-out)
- Fake-llm filters tools before reasoning inventory
- `mcp` port: leave wired/`multi` as today or minimal stub; code comments
  `TODO(mcp): client + allowlist + invoke — deferred`
- UI unit for wired tool options + description rendering
- Docs: allowlist semantics; MCP deferred; permissions split

## Out of scope

- `common-fake-mcp-server` node
- MCP allowlist UI / `enabledMcpIds` productization
- Real tool-call / MCP invoke
- Runtime permission ladder
- OpenAI node (phase 5)

## Acceptance criteria

1. Two wired fake-tool-registration → two tool checkboxes with name + description.
2. Uncheck one → omitted from fake-llm inventory; other remains.
3. `enabledToolIds` unset → all wired tools; `[]` → none.
4. Second LLM instance keeps its own allowlist.
5. No new MCP registration node in catalog; MCP path documented as TODO/placeholder.
6. UI unit covers tool options + description line.
7. Docs: allowlist vs permissions; MCP skipped.
8. Fake-llm WS tests green; verify for touched packages.

## Notes / pitfalls

- Registration nodes should keep `toolId` / `name` / `description` on inline inputs.
- Do not block phase 4 on MCP.
