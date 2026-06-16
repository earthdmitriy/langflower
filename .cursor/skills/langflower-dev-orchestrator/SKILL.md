---
name: langflower-dev-orchestrator
description: >-
    Orchestrates Langflower epic implementation via subagents: pick next TODO
    epic, context collector, developer, principles reviewer (loop), move epic to
    DONE, commit, repeat. Use when the user asks to run the development
    orchestrator, drain TODO epics, implement the next epic, epic implementation
    loop, or queue through docs/TODO/EPICS.
---

# Langflower — development orchestrator

Implements queued product epics end-to-end. Orchestrator **coordinates** only —
implementation and review happen in Task subagents. One epic at a time unless
the user names a different epic or stop condition.

## Critical rules

1. **Order is fixed** — pick → context → develop → review → (loop) → move to
   DONE → commit → next epic. Do not skip review. Do not commit before review
   passes and AC + verify are green.
2. **Epic file is the contract** — Goal / In scope / Out of scope / Acceptance
   criteria. Do not invent scope. Prefer AskQuestion when AC or product intent
   is ambiguous ([AGENTS.md](../../../AGENTS.md) § When stuck).
3. **Principles are the review bar** — [PRINCIPLES.md](../../../docs/PRINCIPLES.md),
   [REACTIVITY.md](../../../docs/REACTIVITY.md), thin server, no barrels, no
   glue adapters without ADR, delete dead code.
4. **Verify before DONE** —
   `node build/tools/agent-run.mjs verify` (or epic’s stated gate). Then
   `dead-code` → delete findings → `check-exports` → re-verify if needed.
5. **No background `npm run dev` / `langflower start`** unless the user asks to
   keep the server up — prefer verify / integration
   (`.cursor/rules/dev-server-lifecycle.mdc`).
6. **Live LLM / MCP** — Fake/scripted CI ≠ Implementable agent/MCP proof. See
   [TESTING.md live gap](../../../docs/TESTING.md#live-openai-compatible--mcp-tool-calling-gap).
   Do not claim live tool/MCP AC without that checklist.
7. **Commit is part of this loop** when the user invoked this skill (implicit
   authorize per-epic commits). One commit per landed epic. Follow git safety
   in user rules (no force, no amend unless conditions met, HEREDOC message).

## When to use

- “Run development orchestrator” / “drain TODO epics” / “implement next epic”
- Walk [docs/TODO/EPICS/](../../../docs/TODO/EPICS/README.md) in order
- User names epic N and wants the full pick→…→commit pipeline

## Queue source

| Item           | Path                                                               |
| -------------- | ------------------------------------------------------------------ |
| Active queue   | [docs/TODO/EPICS/README.md](../../../docs/TODO/EPICS/README.md)    |
| Epic files     | `docs/TODO/EPICS/<NN>-*.md` (**Status:** queued)                   |
| Landed archive | [docs/DONE/EPICS/](../../../docs/DONE/EPICS/README.md)             |
| Status flips   | blocked use-cases under `docs/use-cases/` — only after AC + verify |

Default pick: **lowest NN still queued** that is not blocked by unmet Depends on
(see epic header + README DAG). User override wins (“do epic 20 first”).

Stop when: queue empty, user says stop, or a blocker needs a human decision.

## Pipeline (required)

Copy and track per epic:

```text
Epic NN progress:
- [ ] 1. PICK — choose next epic; read file; confirm Depends on
- [ ] 2. CONTEXT subagent — collect code/docs map (read-only)
- [ ] 3. DEVELOPER subagent — implement AC
- [ ] 4. REVIEWER subagent — principles + AC; no drive-by refactors
- [ ] 5. LOOP — if review fails: developer fix → reviewer again (max 3)
- [ ] 6. VERIFY — agent-run verify (+ dead-code / check-exports)
- [ ] 7. MOVE — epic file → DONE/EPICS; update indexes + use-case Status
- [ ] 8. COMMIT — stage epic-related changes; commit; report hash
- [ ] 9. NEXT — repeat from PICK or stop
```

Subagent prompt templates: [reference.md](reference.md).

### 1. PICK

Read [TODO/EPICS/README.md](../../../docs/TODO/EPICS/README.md) Order table and
the chosen epic file. Report to the user: epic #, title, Blocks, Depends on,
one-line Goal. If Depends on is unmet, skip or AskQuestion — do not start half.

### 2. CONTEXT subagent

`Task` / `explore` (or `generalPurpose` read-only). **No code edits.**

Must return a short brief the developer can paste:

- Paths that own the feature (NAVIGATION / package AGENTS)
- Related use-cases + features + ADRs cited by the epic
- Existing demos/tests to extend
- Risks / FOUND_BUGS signals if relevant
- Out of scope reminders from the epic

### 3. DEVELOPER subagent

`Task` / `generalPurpose`. **Implements** against epic AC + context brief.

Prompt must include: absolute epic path, AC pasted, context brief, package
skills to load (`langflower-ui` / `server` / `shared` / `build` as needed),
“match existing style; no drive-by; PRINCIPLES; thin server”.

Return: files touched, how AC are met, test commands run, open questions.

### 4. REVIEWER subagent

`Task` / `generalPurpose` (or `bugbot` only if user asked Bugbot). **Prefer
no edits** — findings only. Bar = principles + epic AC + honesty (no fake
Implementable).

Prompt must include: diff summary / paths, epic AC, checklist from
[reference.md](reference.md) § Reviewer checklist.

Return: `PASS` or `FAIL` with numbered must-fix items (max 12).

### 5. LOOP

On `FAIL`: spawn developer with the fail list → reviewer again. Cap **3**
review rounds. After 3 fails: stop and AskQuestion (scope cut vs continue).

### 6. VERIFY

Orchestrator (or developer) runs:

```bash
node build/tools/agent-run.mjs verify
node build/tools/agent-run.mjs dead-code
# delete every finding, then:
node build/tools/agent-run.mjs check-exports
```

Do not MOVE on red verify.

### 7. MOVE (orchestrator)

1. Set epic **Status:** landed (or done) in the file body.
2. `git mv` (or move) `docs/TODO/EPICS/<file>` → `docs/DONE/EPICS/<file>`.
3. Update [TODO/EPICS/README.md](../../../docs/TODO/EPICS/README.md) index/DAG.
4. Update [DONE/EPICS/README.md](../../../docs/DONE/EPICS/README.md) table.
5. Flip blocked use-case Status only if AC truly met; update Missing parts.
6. Touch [STATUS.md](../../../docs/STATUS.md) if the epic’s area is listed.

### 8. COMMIT

One commit for the epic (code + doc moves + Status). Message: why, mention
epic NN. HEREDOC per user git rules. Do **not** push unless asked.

### 9. NEXT

Repeat from PICK until stop. Summarize each epic: AC met, commit hash, Status
flips. Do not start the next epic if verify failed or review is open.

## Out of scope for the orchestrator

- Parallel implementation of multiple epics (unless user explicitly asks)
- Re-opening removed epic 15 / inventing persona identity
- Sub-Agent L1+ unless a use-case Missing part demands a new epic
- Editing the user’s plan files under `.cursor/plans/`

## Done criteria (per epic)

- Reviewer `PASS` (or user override after AskQuestion)
- `verify` green; dead-code clean
- Epic file only under `DONE/EPICS/`; TODO index updated
- Commit created on the branch
- User got a short per-epic report
