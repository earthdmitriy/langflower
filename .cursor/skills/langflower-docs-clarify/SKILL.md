---
name: langflower-docs-clarify
description: >-
    Multi-round product/architecture documentation clarification for Langflower.
    Analyzes docs for contradictions, asks the user instead of guessing, locks
    decisions, then updates PRODUCT/use-cases/ADR/MECHANICS/STATUS. Use when
    clarifying purpose, goals, roadmap frame, Sub-Agent/swarm mechanics, bootstrap
    intent, Stage labels, Implementable bars, or when the user asks to clarify
    docs, run question rounds, or lock product decisions before implementation.
---

# Langflower — docs clarification (multi-round)

## Critical rules

1. **Not sure? Ask the user. Do not guess.**
2. **Multiple rounds are expected** — lock answers, then dig the next ambiguity.
3. Prefer **AskQuestion** when available; otherwise numbered `a/b/c` options in chat.
4. For **protocol / port / spawn / runtime** decisions, ask and write in **English**
   (translation loses precision). Russian OK for high-level product chat if the
   user prefers.
5. **Do not implement code** or rename demo workflows until the user asks.
6. **Do not write docs** until the user says to update docs (or clearly ends
   clarification with “write it down”).
7. Distinguish **shipped** vs **target** in every write-up.

## When to use

- Purpose / goal / primary user unclear or docs disagree
- Roadmap frame (Stage 1/2/3 vs use-case Status)
- Sub-Agent, swarm, nested spawn, Loop / Monte Carlo
- Bootstrap / Settings / folder picker intent
- Implementable bar for use cases
- User says: clarify docs, product lock, question rounds, “don’t guess”

## Workflow

Copy and track:

```text
Clarify progress:
- [ ] 1. Scope + seed reads
- [ ] 2. Contradiction / gap list (no guesses)
- [ ] 3. Round N questions (max ~5 focused items)
- [ ] 4. Lock table from answers
- [ ] 5. Next round OR write docs (only if asked)
- [ ] 6. Point related docs; mark pending decisions in ADR
```

### 1. Scope + seed reads

Always start from:

| Doc                                                                                                 | Role                                  |
| --------------------------------------------------------------------------------------------------- | ------------------------------------- |
| [docs/PRODUCT.md](../../../docs/PRODUCT.md)                                                         | Purpose, goal, differentiators        |
| [docs/use-cases/README.md](../../../docs/use-cases/README.md)                                       | Status bar / north star               |
| [docs/STATUS.md](../../../docs/STATUS.md)                                                           | Package/capability status             |
| [docs/ADR.md](../../../docs/ADR.md)                                                                 | Locked decisions                      |
| [docs/DONE/EPICS/MECHANICS-tool-execution.md](../../../docs/DONE/EPICS/MECHANICS-tool-execution.md) | Internal vs external tools; Sub-Agent |
| [AGENTS.md](../../../AGENTS.md)                                                                     | Agent entry + links                   |

Add topic-specific reads (e.g. `use-cases/coding-agent.md`, Sub-Agent `NODE.md`,
epic 07). Prefer facts from code/docs over assumptions.

### 2. Gap list

Produce a short table: **what’s unclear / contradictory** + **where**.
Do not invent resolutions. Call out stale Stage 1/2/3 vs use-case Status.

### 3. Question rounds

- One theme per round when possible (product → bootstrap → mechanics → …).
- Each item: concrete options; put the recommended option first when you have
  one grounded in docs — still wait for the user.
- After answers: **lock table** (`Topic | Decision | Notes`).
- Open the next round only for remaining ambiguity.
- If AskQuestion is unavailable, use the same option letters in prose.

### 4. Write docs (only when asked)

| Kind of lock                       | Where to write                                              |
| ---------------------------------- | ----------------------------------------------------------- |
| Purpose / goal / user / north star | `docs/PRODUCT.md` + `AGENTS.md` / `STATUS.md` pointers      |
| End-user scenario Status / naming  | `docs/use-cases/*.md` + README                              |
| Non-obvious architecture tradeoff  | New or updated **ADR** (`docs/ADR.md`)                      |
| Tool/spawn internal vs external    | `MECHANICS-tool-execution.md` + ADR                         |
| Product locks index                | `docs/DONE/EPICS/README.md` § Product locks                 |
| Node author surface                | package `NODE.md` + `docs/features/node-library.md`         |
| Obsolete Stage rollout             | **Delete** or archive; do not leave conflicting Stage plans |
| Undecided but important            | ADR **Pending decision** block (open questions listed)      |

**Patterns from prior clarifications:**

- Prefer **use-case Status** over Stage 1/2/3 labels.
- Mark **target** vs **interim/shipped** explicitly (e.g. Sub-Agent map-collect
  vs registration+spawn).
- Supersede obsolete ADRs; do not delete history.
- Demo naming: `basic-coder.json` = Plan→Coder smoke (shipped);
  `coding-agent.json` = full pipeline (target, not shipped).

### 5. Stop conditions

- User says pause / not yet on implementation.
- Pending decisions documented; no silent defaults.
- Related links updated so agents find PRODUCT → ADR → MECHANICS → use-case.

## Anti-patterns

- Guessing spawn/result ports, concurrency, or Implementable bars
- Writing “Implementable” for basic Plan→Coder when product bar is full pipeline
- Leaving Stage 1/2/3 as active roadmap after PRODUCT says otherwise
- Claiming target Sub-Agent contract is shipped
- Mixing HITL/`feedback` with `subagentResult` in docs
- Huge one-shot questionnaires (split rounds)

## Related skills / entry

- Build/verify: `.cursor/skills/langflower-build/SKILL.md`
- Server/UI/shared package skills when clarification turns into code later

For a compact example of rounds → locks → ADR pending, see
[example-locks.md](example-locks.md).
