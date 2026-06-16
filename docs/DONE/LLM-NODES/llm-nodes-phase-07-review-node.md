# Phase 7+ — Review node (`accept` / `feedback` tools)

**Status:** landed (epic 03)  
**Depends on:** Tool-call loop + built-in tool registration mechanics  
**Index:** [llm-nodes-README.md](llm-nodes-README.md)

## Goal

Ship a **separate Review node** (not a role preset on the LLM node). The model
must call one of two **built-in tools**; the harness routes the tool payload to
the matching **output port**. Plain assistant text without a tool call is
**rejected** — the harness reminds the LLM to use a tool.

## Mechanics (normative)

```text
Inputs:  task / criteria, result (artifact under review), optional system/skill
Tools:   accept(payload?), feedback(notes)   ← only these for this node
Outputs: response  ← on accept (e.g. passthrough result + optional notes)
         feedback  ← on feedback tool (revision notes for upstream LLM)
```

1. **Forced tool use:** system/developer prompt states that the only valid
   completion is calling **exactly one** of `accept` or `feedback`. Free-form
   “LGTM” / essay answers are not acceptable.
2. **Harness reminder:** if the model returns text (or other tools) without
   `accept`/`feedback`, do not forward to success ports; re-prompt / continue
   the tool loop with a reminder that it must call one of these tools (cap with
   `maxIterations` / fail the node after N misses).
3. **Port routing:** tool name selects the output port; tool arguments become
   the port payload (define exact JSON schemas in implementation).
4. **No shell / no project tools** on Review by default — only the two review
   tools (security + focused contract).

## Relation to LLM roles

Review is **not** “Explorer with a different prompt.” It is a dedicated node
type with a closed tool set and port fan-out. Upstream LLM instances (Plan/Coder/…)
remain ordinary LLM nodes with their own allowlists.

## In scope (when unblocked)

- `common-review` (or renamed) reactive node using the shared LLM client + tool loop
- Built-in tool definitions `accept` / `feedback`
- Forced-tool prompt + reminder policy
- Wire into article-writing / adversarial / prompt-refining graphs
- Docs in `LLM_NODES.md` + use-cases Status updates where Review was the gap
- Unit/integration: model mocked to call `feedback` → feedback port emits; text-only
  → reminder path, no silent accept

## Out of scope for this phase file until tools exist

- Implementing the generic tool loop itself (prerequisite epic)
- MCP on Review
- Multi-gate human approval ([hitl-chat](../../features/hitl-chat.md) § Multi-gate HITL)

## Acceptance criteria

1. ✅ Review node in catalog; not a preset on `common-openai-llm`.
2. ✅ Calling `accept` emits on the accept/response port; `feedback` on feedback port.
3. ✅ Text-only model output does **not** complete the node successfully; harness
   issues a tool-use reminder (observable in tests).
4. ✅ After repeated non-compliance, node fails with a clear error (no silent pass).
5. ✅ Docs describe forced-tool contract and port mapping.
6. ✅ Verify green; relevant use-case Missing parts updated if Review was the blocker.

## Notes

- Pilot use-cases that need Review wait for this phase (user lock: after tools).
- Prefer structured tool arguments over parsing natural language for accept/fail.
