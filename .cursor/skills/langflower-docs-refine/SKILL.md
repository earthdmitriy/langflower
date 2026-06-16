---
name: langflower-docs-refine
description: >-
    Draft, roast, and fix Langflower product docs via a three-phase subagent
    pipeline. Refines docs/features UI specs (Goal→Principles→Details→Impl) and
    docs/use-cases (Value→UX→UI specs→Runtime→Status). Use when the user asks to
    draft/roast/fix docs, refine UI specs or use-cases, run the docs refine
    loop, or create/update feed-panel, hitl-chat, inspector, or other feature/
    use-case markdown with honesty against demos and code.
---

# Langflower — docs refine (draft → roast → fix)

Docs-only. No product code unless the user asks. English for protocol/UI
contracts; match existing doc language.

## Critical rules

1. **Customer value / Goal is source of truth** — lower layers only serve it.
2. **Do not invent** shipped features, demos, or runtime. Align with real demo
   JSON / code / Status. Prefer _Missing_ over false Landed.
3. **Prefer UI projection of existing events** over new server surface
   (thin server; avoid Runtime monsters).
4. **MUST language** in Expects / Feature Details that are acceptance bars.
5. **Ask** when Value/Goal is ambiguous — do not guess product intent.
6. Run phases **in sequence** with Task subagents: draft → roast → fix.
   Do not skip roast. After roast completes, spawn fix with the roast list.

## When to use

- Refine or create a `docs/features/*.md` UI spec
- Refine or create a `docs/use-cases/*.md`
- User says: draft/roast/fix, docs refine loop, UI specs refining
- Honesty pass after demos/code drifted from docs

## Choose target kind

| Kind                  | Path                       | Canonical shape                                                   |
| --------------------- | -------------------------- | ----------------------------------------------------------------- |
| **Feature (UI spec)** | `docs/features/<name>.md`  | Goal → Core Principles → Feature Details → Implementation Details |
| **Use case**          | `docs/use-cases/<name>.md` | Value → UX scenarios → UI specs → Runtime → Workflow? → Status    |

Hierarchy for use cases: Value → UX projection → UI specs (feature links) →
minimal Runtime. See [reference.md](reference.md).

## Pipeline (required)

Copy and track:

```text
Refine progress:
- [ ] 0. Scope (path, kind, related demos/features)
- [ ] 1. DRAFT subagent — write/overwrite doc
- [ ] 2. ROAST subagent — critique only, no edits
- [ ] 3. FIX subagent — apply roast, overwrite
- [ ] 4. Index/README links if new file
- [ ] 5. Report summary to user
```

### 0. Scope

Read before spawning:

- Target file (if exists)
- [docs/features/README.md](../../../docs/features/README.md) and/or
  [docs/use-cases/README.md](../../../docs/use-cases/README.md)
- Related demos under `demo-project/.langflower/workflows/` when claiming
  alignment
- Sibling docs the UC/feature links to

### 1. DRAFT subagent

`Task` / `generalPurpose` (or `explore` only for research — writer must edit).

Prompt must include:

- Absolute path to write
- Kind = feature | use-case
- Paste the matching template from [reference.md](reference.md)
- User’s intent / Value in their words
- “Do not invent shipped; mark Draft/Missing; English”

Return: path + section headings.

### 2. ROAST subagent

After draft completes, spawn a **new** Task. **Do not edit files.**

Prompt must include:

- Absolute path
- Kind + checklist from [reference.md](reference.md) § Roast checklists
- Related feature/use-case peers for contradiction checks
- “Max 12 numbered items with concrete fix instructions”

Return: numbered roast only.

### 3. FIX subagent

After roast completes, spawn a **new** Task with the roast list pasted in.

Prompt must include:

- Absolute path + “overwrite applying these fixes”
- Keep canonical section order
- “No invent; MUST language; Runtime ≤6 acid-test if use-case”
- For features: no code paths in Feature Details; Impl Details only at end

Return: brief what-changed summary.

### 4. Indexes

If new file: add README Index / Status summary rows. Scrub dead links.
Do not restore retired use cases (e.g. multi-role-approval / persona).

## Multi-file batches

For each file: full draft → roast → fix **before** the next file.
Do not parallelize phases for the same file. Different files may run in
parallel only if the user asks for parallel refine.

## Done criteria

- Canonical headings present; no leftover Goal/Actors/Narrative on use-cases
- Every UX `Sn` appears in UI specs table (use-cases)
- Roast items addressed or explicitly deferred with reason in Status
- Demo/JSON claims match reality or are labeled target/Missing
