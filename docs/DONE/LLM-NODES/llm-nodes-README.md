# LLM nodes — phased plan index (completed)

**Archived** under [`docs/DONE/`](../README.md). Phases 1–6 landed; phase 7
Review sketched here and delivered via [epic 03](../EPICS/03-review-node.md).
Agent runtime epics: [DONE/EPICS](../EPICS/README.md).

Parent plan: Cursor plan `openai_llm_nodes` (Real OpenAI LLM nodes).

## Disclaimer (read first)

Phases **1–6** deliver an **LLM node foundation**: secrets, skills catalog UI,
per-instance role fields, OpenAI-compatible **chat streaming**, live model list.

They do **not** satisfy [docs/use-cases/](../use-cases/README.md) **Agent runtime
prerequisites** (tool invoke loop, built-in harness tools, runtime permissions).
After phase 6 every agent use-case remains **Blocked** / at best authorable with
text-only LLM. Do not market phases 1–6 as “coding agent ready.”

Tool execution, Review-as-tools, and use-case Partial pilots land **after** the
tool-loop epic (see Deferred / phase 7+).

## Product model (locked)

| Concept                        | Meaning                                                                                                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **LLM node**                   | One type (`common-fake-llm` / `common-openai-llm`). Roles are **instance config**, not separate palette types.                                                      |
| **Plan / Coder / Explorer**    | Presets on an LLM instance: default `systemPrompt`, default skill(s), default **permission / tool allow** profile — same node type, different params.               |
| **Author-time tool allowlist** | Inspector checkboxes over wired (or future built-in) tool ids — which tools this instance may use when tool-loop exists.                                            |
| **Runtime permissions**        | Separate concern (ask gates, staged escalation). **Not** the same as allowlist UI. Split epic after tools.                                                          |
| **Skill select (panel)**       | Convenience: append skill markdown into system for demos / static roles.                                                                                            |
| **Skill refining (use-case)**  | Skill file is loaded via **`read` (read file) tool** during the agent loop — not only via panel `skillId`. Panel catalog remains for static attach.                 |
| **MCP**                        | **Skipped** in phases 1–6: keep port / types / TODOs / placeholders only — no fake-mcp node, no invoke.                                                             |
| **Shell / bash**               | Popular LLM security hole. Product should **recommend turning shell off** for agent instances (default-deny or strong UX nudge). Detail after tools.                |
| **Review**                     | **Separate node** (phase 7+): built-in tools `accept` + `feedback` route payloads to output ports; forced tool-use prompt + harness reminder. Depends on tool-loop. |

## Phase order

| Phase | File                                                                             | Goal                                                              |
| ----- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1     | [llm-nodes-phase-01-secrets-config.md](llm-nodes-phase-01-secrets-config.md)     | Config parse + secret redact + server credential resolve          |
| 2     | [llm-nodes-phase-02-skills-bridge.md](llm-nodes-phase-02-skills-bridge.md)       | Server skills reader + catalog on bridge (picker UX)              |
| 3     | [llm-nodes-phase-03-fake-llm-panel.md](llm-nodes-phase-03-fake-llm-panel.md)     | Fake LLM panel + **role presets** (Plan/Coder/Explorer as config) |
| 4     | [llm-nodes-phase-04-wired-allowlists.md](llm-nodes-phase-04-wired-allowlists.md) | Per-tool allowlists (wired); MCP port placeholder only            |
| 5     | [llm-nodes-phase-05-openai-llm.md](llm-nodes-phase-05-openai-llm.md)             | Real OpenAI-compatible LLM node (streaming, no tool loop)         |
| 6     | [llm-nodes-phase-06-fetch-models.md](llm-nodes-phase-06-fetch-models.md)         | Live model list via `models.list()`                               |
| 7+    | [llm-nodes-phase-07-review-node.md](llm-nodes-phase-07-review-node.md)           | Review node (`accept` / `feedback` tools) — **after tool-loop**   |

Do not start phase _N+1_ until phase _N_ acceptance criteria are green (phase 7
blocked on a future tool-loop epic, not on phase 6 alone).

## Cross-cutting docs (land with phases)

- `docs/LLM_NODES.md` — disclaimer, roles-as-config, picker UX, secrets, Review
  sketch, shell-off recommendation
- `docs/CONFIG.md` — openai package + `{env:}` + skills dir; live models (phase 6)

## Picker UX (skills / tools)

**Gap (current code):** `InlineSelectOption` = `{ title, value }` only.

| Picker          | Phase | What we show                                                                   |
| --------------- | ----- | ------------------------------------------------------------------------------ |
| Skill           | 2–3   | `name` + description caption; short description on bridge; full body not on WS |
| Tools allowlist | 4     | Multiselect: name + description from upstream registration                     |
| MCP             | —     | Placeholder port only; no picker investment                                    |
| Model           | 1 / 6 | Model id (+ optional API name in phase 6)                                      |

## Allowlist vs permissions (split)

```text
Author-time allowlist (phase 4)     Runtime permissions (later epic)
─────────────────────────────       ────────────────────────────────
Which tools appear / may be bound   Whether a call is allowed now
Instance params enabledToolIds      ask / deny / escalate / session policy
Not a security boundary alone       Security boundary + HITL gates
```

Document both in `LLM_NODES.md`; do not implement runtime escalation in phases 1–6.

## Explicitly deferred

| Item                                                               | When                                                                                              |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Tool-call loop, built-in `read`…`bash`, `toolLog`, `maxIterations` | After phase 6 (separate epic)                                                                     |
| MCP client / invoke                                                | After tools; placeholders only until then                                                         |
| Runtime permission ladder / `permission.ask`                       | After tools; split from allowlists                                                                |
| Review node (`accept` / `feedback`)                                | **landed** — [Phase 7](llm-nodes-phase-07-review-node.md) / [epic 03](../EPICS/03-review-node.md) |
| Use-case Partial pilot (e.g. prompt-refining)                      | **After tool implementation** (user lock)                                                         |
| Skill refining E2E via `read` tool                                 | After tools                                                                                       |
| `fs.watch` skills catalog                                          | Optional later                                                                                    |
| Vercel AI SDK; persist fetched models to jsonc                     | Out                                                                                               |
