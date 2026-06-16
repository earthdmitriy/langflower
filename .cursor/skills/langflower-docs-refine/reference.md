# Docs refine — templates and roast checklists

Read from the parent [SKILL.md](SKILL.md). Paste the relevant block into
subagent prompts.

## Feature (UI spec) template

Path: `docs/features/<kebab>.md`

```markdown
# <Feature name>

## Goal

1–3 sentences: user-facing value. Note **Draft today** if overcrowded/incomplete;
point at validating use-case if any.

## Core Principles

- Bullet non-negotiables (always true regardless of implementation)
- Link peer features / use-cases for contracts owned elsewhere

## Feature Details

What the user sees and does: flows, states, edge cases.
**No file paths, no code.** MUST/MUST NOT for acceptance bars.
Tables OK for states, roles, layouts.

## Implementation Details

- Code paths, tests, protocol links only here
- Point to EXECUTION_ARCHITECTURE, REACTIVE_NODES, DIAGRAM_CANVAS, etc.
```

### Feature ownership

| Section                | Owns                 | Must not                |
| ---------------------- | -------------------- | ----------------------- |
| Goal                   | Promise              | Ports, WS event names   |
| Core Principles        | Constraints          | Implementation recipes  |
| Feature Details        | Observable UX        | File paths, class names |
| Implementation Details | Where to change code | New product claims      |

## Use-case template

Path: `docs/use-cases/<kebab>.md`

```markdown
# <Use case name>

**Status:** Draft | Partial | Blocked | Implementable — one line

## Value

2–4 sentences: customer outcome + mood; one clause what this is _not_.

## UX scenarios

### S1 — <short name>

**Who:** …
**Want:** … ← maps to Value
**Do:** …
**Expect:**

- MUST / MUST NOT …

### S2 — …

…

## UI specs

| Spec                                       | Scenarios covered |
| ------------------------------------------ | ----------------- |
| [feed-panel.md](../features/feed-panel.md) | S1, S2            |

Every `Sn` MUST appear in ≥1 row. Do not re-spec UI here.

## Runtime requirements

| Need | Why (scenario) | Today                      | Caution  |
| ---- | -------------- | -------------------------- | -------- |
| …    | S4             | Landed / Missing / Partial | do not … |

≤6 rows. Acid test: if never built, which Expect dies?
Prefer UI projection of existing events over new server surface.

## Workflow shape

_(Optional — only if the graph *is* the value.)_

## Status

### Missing parts

| Layer         | Gap | Sn  | Done when |
| ------------- | --- | --- | --------- |
| UI \| Runtime | …   | S…  | …         |

### Workarounds

…

### Demo / CI

…
```

### Use-case ownership

| Layer        | Owns                            | Must not                             |
| ------------ | ------------------------------- | ------------------------------------ |
| Value        | Product promise                 | Ports, paths                         |
| UX scenarios | Observable bar                  | Implementation choices               |
| UI specs     | Links to `docs/features/*` × Sn | Inline UI redesign essays            |
| Runtime      | Smallest backend for Expect     | Parallel APIs, speculative platforms |
| Workflow     | Graph evidence                  | Fake mermaid that ≠ demo             |

Retired: persona / multi-role-approval identity UC — multi-gate lives on
`hitl-chat.md`.

## Roast checklists

### Feature roast (max 12)

1. Goal soft / duplicated into Details?
2. Principles contradict Feature Details or a use-case?
3. Feature Details contain file paths / code (should be Impl only)?
4. Draft overcrowding claimed as shipped chat parity?
5. Soft language (`may`, `ideally`, `or equivalent`) on acceptance bars?
6. Missing peer links (use-case validator, hitl-chat, workflow-execution)?
7. Impl Details incomplete or inventing protocol?
8. Canvas/feed/inspector boundaries blurred?
9. Composer / Start-Stop rules diverge from feed-panel if overlapping?
10. No measurable Done when for Draft gaps?

### Use-case roast (max 12)

1. Value clear + mood + not? Or ADR dump?
2. Every Sn has Who + MUST Expects?
3. UI table covers every Sn? Fake coverage?
4. Runtime ≤6? Acid test? Anti-rows / laundry Landed?
5. Demo JSON / CLI / CI lies?
6. Mermaid ≠ demo without “target” label?
7. Soft language / umbrella Sn (“same as S1–S5”)?
8. Overlap with sibling UC (checkpoints vs detachable; grok density vs reconnect)?
9. Status Draft/Partial/Blocked honest vs Missing?
10. Invented Settings / persona / tiers / nodes?
11. Runtime monster (new platform “just in case”)?
12. Implementable bar requires forever-Missing items?

## Honesty defaults

| Claim              | Verify                                                           |
| ------------------ | ---------------------------------------------------------------- |
| Demo exists        | `demo-project/.langflower/workflows/<id>.json` nodes/edges       |
| Landed runtime     | Code + tests / FOUND_BUGS / epic Status                          |
| CLI line           | `packages/cli` actually prints it                                |
| Feed chat-density  | grok-feed + feed-panel Draft — not shipped dump                  |
| Disconnect survive | session disconnect docs / BUG-2026-06-26h — process must stay up |

## Subagent prompt scraps

**Draft:** “Overwrite PATH using TEMPLATE. Intent: …. No invent. Mark Missing.”

**Roast:** “Roast PATH. Checklist: …. Max 12 concrete fixes. Do NOT edit.”

**Fix:** “Overwrite PATH applying roast: …. Keep canonical headings. No invent.”
