# Phase 2 — Server skills reader + bridge catalog

**Status:** done  
**Depends on:** [Phase 1](llm-nodes-phase-01-secrets-config.md)  
**Index:** [llm-nodes-README.md](llm-nodes-README.md)

## Goal

Own skill discovery and skill body reads on the **server**. Expose a catalog
with **enough metadata for UX** (id, display name, short description) on bridge
snapshots — not the full `SKILL.md` body. Inject a re-reading skill loader into
run context for later LLM phases.

## UX — skill picker (gap today → fix here / phase 3)

**Today:** `InlineSelectOption` is `{ title, value }` only;
[`lf-inline-field`](../../packages/ui/src/app/features/canvas/components/lf-inline-field.component.ts)
renders `{{ option.title }}` with **no description**. A folder-name-only skill
select is not enough to choose a role.

**Required:**

| Layer            | What user sees                                                                                                                                                          |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Catalog entry    | `id`, `name`, `description` (short)                                                                                                                                     |
| Skill `<select>` | Option label = `name` (fallback `id`); **below the select**, a caption for the **currently selected** skill showing `description` (muted); empty state if none selected |
| Option hover     | Native `title` attribute on `<option>` = description (best-effort; some browsers ignore)                                                                                |

**Description source (server `listSkills`):**

1. Prefer Cursor-style YAML frontmatter on `SKILL.md`: `name`, `description`
2. Else `name` = folder id; `description` = first non-empty prose line of the
   body, truncated to **≤280 chars** (no markdown dump of full skill)
3. Full file body still **only** via `readSkillMarkdown` at run time — **not** on WS

## In scope

- Server module [`packages/server/src/skills/`](../../packages/server/src/skills/):
    - `listSkills(projectDir)` → `{ id, name, description }[]` from
      `.langflower/skills/<id>/SKILL.md` (skip dirs without file; parse frontmatter
      / truncated fallback as above)
    - `readSkillMarkdown(projectDir, skillId)` → full UTF-8 body or `''`; reject
      path traversal (single path segment only)
- Extend `LangflowerConfig` with optional
  `skills?: readonly { id: string; name: string; description: string }[]`
  (in-memory only; **not** written to `langflower.jsonc`)
- Merge `listSkills()` when building `langflower.config.snapshot` /
  `session.state.snapshot.langflowerConfig`
- `optionsSource: 'langflower.skills'` → `InlineSelectOption` with
  `title: name`, `value: id`, `description`
- Extend `InlineSelectOption` with optional `description?: string`; Inspector
  select shows selected-option description caption (shared widget — also used
  by tools in phase 4)
- Bootstrap: ensure `.langflower/skills/` exists
- Extend `ExecutionContext` with optional
  `readSkillMarkdown?: (skillId: string) => Promise<string>`; server graph-bind /
  run start wires it to server reader (**fresh file read every call**)
- Document re-read policy + skill picker UX in `docs/LLM_NODES.md`
- Bridge JSDoc: skills catalog (incl. short description) on config snapshot;
  **no** full skill body on WS; **no** new bus events

## Out of scope

- Fake-llm / openai consuming skills in prompts (phase 3+)
- `fs.watch` / live catalog without reconnect
- Full-skill markdown preview panel / modal (caption + tooltip only in this phase)
- Skill-refining use-case E2E — when tools exist, refining loads the skill file
  via the **`read` (read file) tool** as an agent input, not only via panel
  `skillId`. Panel catalog remains for static attach / demos.

## Re-read policy (normative)

| What                       | When                                                                                                       |
| -------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Catalog (`listSkills`)     | Every config/session snapshot build (WS connect / reconnect / any re-emit of `langflower.config.snapshot`) |
| Body (`readSkillMarkdown`) | Every call — LLM cycles must call per activation; no cross-cycle cache                                     |
| UI dropdown                | Follows last config snapshot only                                                                          |

**Known limitation (document in LLM_NODES.md):** new skill folders appear in the
select after reconnect (or other snapshot re-emit), not via `fs.watch` in this
phase.

## Acceptance criteria

1. Unit: `listSkills` returns ids for folders with `SKILL.md`; ignores empty dirs.
2. Unit: frontmatter `name` / `description` win over folder id / truncated body;
   description length capped (≤280).
3. Unit: `readSkillMarkdown` rejects `../` / absolute / nested segments; returns
   `''` for missing skill.
4. Unit: second `readSkillMarkdown` after file change returns updated content
   (proves no stale cache).
5. Bridge/unit: snapshot includes `skills: [{ id, name, description }]` and
   **never** includes the full markdown body (description ≠ full file).
6. Shared: `resolveUiSchemaOptions` returns skill options with `title` +
   `description` from `config.skills`.
7. UI: skill select shows a description caption for the selected skill (unit or
   component test / documented manual check).
8. Bootstrap creates `.langflower/skills/` on new projects.
9. Run-context wiring test (or server bind test): injected
   `ExecutionContext.readSkillMarkdown` delegates to server reader.
10. `docs/LLM_NODES.md` documents layout, frontmatter fields, picker UX, re-read
    table, bridge note.
11. No new entries under `fromClientToServer` / no `skills.*` bus events.
12. Verify (or targeted unit + shared/server/ui build) green.

## Notes / pitfalls

- Stuffing skills into `LangflowerConfig` is a FS projection, not disk config —
  keep that clear in docs to avoid “write skills into jsonc” mistakes.
- Do not load skill bodies in the UI.
