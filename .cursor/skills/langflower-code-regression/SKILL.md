---
name: langflower-code-regression
description: >-
    Splits the Langflower codebase into small chunks, runs a principles /
    FOUND_BUGS / glue-code regression review per chunk via subagents, writes
    docs/code-regression/<chunk>.md reports, then summarizes into
    docs/code-regression/SUMMARY.md. Use when the user asks for code-regression,
    code regression audit, principles sweep, glue/adapter audit, or a chunked
    codebase health review.
---

# Langflower — code regression

Read-only audit of source against principles and known design-flaw signals.
Orchestrator **coordinates** only — each chunk review runs in a Task subagent.
Does **not** edit product code unless the user explicitly asks after the summary.

## Critical rules

1. **Order is fixed** — split → per-chunk subagent reports → SUMMARY. Do not
   skip SUMMARY. Do not invent findings without file/path evidence.
2. **Docs only under `docs/code-regression/`** — chunk reports + SUMMARY. Do
   not modify `packages/` / `tests/` during this skill unless the user asks
   for fixes in a follow-up.
3. **Principles + FOUND_BUGS are the bar** —
   [PRINCIPLES.md](../../../docs/PRINCIPLES.md),
   [REACTIVITY.md](../../../docs/REACTIVITY.md),
   [FOUND_BUGS.md](../../../docs/FOUND_BUGS.md). Thin server, no barrels, no
   glue/adapters without ADR, reuse domain types, delete dead code.
4. **Chunk size stays small** — prefer package slices / feature folders over
   whole monorepo in one subagent. Default map:
   [reference.md](reference.md) § Default chunks.
5. **Parallel chunks OK** — launch multiple Task subagents for independent
   chunks (cap ~4 concurrent). Never parallelize SUMMARY with unfinished
   chunk reports.
6. **No background `npm run dev` / `langflower start`** — audit is static /
   read-only (`.cursor/rules/dev-server-lifecycle.mdc`).

## When to use

- “Run code-regression” / “code regression audit”
- Principles / glue / adapter / parallel-types sweep
- Chunked health review before a large refactor
- User names packages or paths to audit (override default chunk map)

## Workflow (required)

Copy and track:

```text
Code-regression progress:
- [ ] 1. SPLIT — choose chunks; write/refresh docs/code-regression/CHUNKS.md
- [ ] 2. REVIEW — for each chunk: Task subagent → docs/code-regression/<chunk>.md
- [ ] 3. SUMMARY — aggregate → docs/code-regression/SUMMARY.md
- [ ] 4. Report to user — counts, top issues, suggested next fixes
```

### 1. SPLIT — codebase into small chunks

1. Read [reference.md](reference.md) § Default chunks.
2. If the user scoped paths/packages, filter or replace the default map.
3. Ensure each chunk is reviewable in one subagent (~one package or one
   feature slice; split oversized packages — e.g. `common-nodes` by domain,
   `ui` by feature area).
4. Create `docs/code-regression/` if missing.
5. Write `docs/code-regression/CHUNKS.md` listing:
    - chunk id (kebab-case filename stem)
    - absolute/repo-relative paths included
    - status: pending | done

Chunk id = report filename without `.md`
(e.g. `runtime` → `docs/code-regression/runtime.md`).

### 2. REVIEW — one subagent per chunk

For each pending chunk, spawn `Task` / `generalPurpose` (read + write docs
only). Paste the prompt from [reference.md](reference.md) § Chunk reviewer
prompt.

**Subagent task (verbatim intent):**

> verify code against principles, check found bugs.md, propose streamlining
> and simplifications, design flaw fixes, check for unnecessary glue-code,
> types and adapter

Subagent **must**:

1. Read the chunk paths (sample thoroughly; do not claim full line-by-line
   coverage — note depth).
2. Read [PRINCIPLES.md](../../../docs/PRINCIPLES.md) (thin server, no glue /
   adapters, types, barrels, composer entry points) and relevant package
   `AGENTS.md`.
3. Skim [FOUND_BUGS.md](../../../docs/FOUND_BUGS.md) for design-flaw signals
   that apply to this chunk; cite BUG ids when relevant.
4. Check [REACTIVITY.md](../../../docs/REACTIVITY.md) when the chunk has RxJS
   / UI / runtime streams (`withLatestFrom`, stray `.subscribe`, etc.).
5. Write **only** `docs/code-regression/<chunk>.md` using the chunk report
   template in [reference.md](reference.md).
6. Return a short status: path written + issue counts by severity.

Mark the chunk `done` in `CHUNKS.md` when the report exists.

**Do not** have subagents edit product source. Findings are proposals.

### 3. SUMMARY

After all chunk reports exist, write
`docs/code-regression/SUMMARY.md` (orchestrator or one final Task).

Must include:

1. Date / scope / chunk list with links
2. Cross-cutting themes (repeated design-flaw signals)
3. Prioritized issue table (Critical → Suggestion), each row linking to the
   chunk report and a concrete path
4. Deduplicated recommendations (merge repeats across chunks)
5. Suggested fix order (small safe wins first, then design-flaw clusters)

Template: [reference.md](reference.md) § SUMMARY template.

## User overrides

| Override                     | Behavior                                    |
| ---------------------------- | ------------------------------------------- |
| Named packages / paths       | Review only those chunks                    |
| “Re-run chunk X”             | Overwrite `docs/code-regression/X.md` only  |
| “Summary only”               | Rebuild SUMMARY from existing chunk reports |
| “Fix top N after regression” | Separate follow-up — not part of this skill |

## Done criteria

- [ ] `CHUNKS.md` lists every reviewed chunk as `done`
- [ ] Every chunk has `docs/code-regression/<chunk>.md`
- [ ] `SUMMARY.md` exists and links all chunk reports
- [ ] User gets a short Russian or English summary (match user language) with
      top Critical items and paths to the docs

## Additional resources

- Templates + default chunk map + prompts: [reference.md](reference.md)
- Principles: [docs/PRINCIPLES.md](../../../docs/PRINCIPLES.md)
- Found bugs: [docs/FOUND_BUGS.md](../../../docs/FOUND_BUGS.md)
- Reactivity: [docs/REACTIVITY.md](../../../docs/REACTIVITY.md)
- Navigation: [docs/NAVIGATION.md](../../../docs/NAVIGATION.md)
