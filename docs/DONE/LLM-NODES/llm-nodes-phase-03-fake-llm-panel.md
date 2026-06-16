# Phase 3 — Fake LLM panel + role presets (Plan / Coder / Explorer)

**Status:** done  
**Depends on:** [Phase 2](llm-nodes-phase-02-skills-bridge.md)  
**Index:** [llm-nodes-README.md](llm-nodes-README.md)

## Goal

Give `common-fake-llm` the Inspector role fields OpenAI LLM will share, and treat
**Plan / Coder / Explorer as instance presets** (prompts + default permission /
tool profile) — **not** separate palette node types.

## Product note

There is **one** LLM node type. Dropping “Coder” means applying a preset to
`params` / defaults (`systemPrompt`, `skillId`, future allowlist / permission
flags). Multiple instances on the canvas = multiple roles.

## In scope

- Shared panel fragment in `packages/common-nodes/src/ai/`:
    - `providerId`, `model`, `skillId` (selects + descriptions from phase 2)
    - Optional preset field or documented drop defaults, e.g. `rolePreset`:
      `'custom' | 'plan' | 'coder' | 'explorer'` that seeds systemPrompt / skill /
      future tool defaults (implementation: apply defaults on palette drop or when
      preset changes — do not invent three catalog types)
- Keep `tokenDelayMs` on fake-llm only
- Optional input `systemPrompt` (`inline: 'text-multiline'`)
- Each cycle: `await ec.readSkillMarkdown?.(skillId)` → effective system;
  mention provider/model/skill/preset in reasoning
- Pure `build-effective-system-prompt.ts`
- Document in `LLM_NODES.md`:
    - roles-as-config
    - panel `skillId` vs skill-refining via future **`read` tool** (skill file as
      tool input — not only panel attach)
- NODE.md + unit tests (stub skill reader)

## Out of scope

- `enabledToolIds` (phase 4)
- MCP investment (placeholder only)
- `common-openai-llm` (phase 5)
- Credential resolve in common-nodes
- Runtime permissions / shell policy UI (document shell-off recommendation only)

## Acceptance criteria

1. Inspector shows provider, model, skill (+ description caption) on fake-llm.
2. Skill select shows selected skill description (phase 2 catalog).
3. Plan/Coder/Explorer are available as **presets on one node type** (params /
   defaults), not as three separate `common-agent-*` catalog entries.
4. Two fake-llm instances persist different role fields independently.
5. Stubbed skill reader markdown appears in effective system / reasoning path.
6. Missing skill / empty `skillId` → no crash.
7. Existing fake-llm WS tests still pass.
8. `docs/LLM_NODES.md` states roles-as-config + skill-refining-via-`read` (future).
9. Verify --quick / relevant tests green.

## Notes / pitfalls

- Preset content can start as constants colocated with the node (system prompts
  from old node-library §21); refine later.
- Do not restore deleted `common-agent-plan` etc. as separate types.
