---
name: langflower-code-regression
description: >-
    Splits the Langflower codebase into small chunks, runs a principles /
    FOUND_BUGS / glue-code regression review per chunk via subagents, writes
    docs/code-regression/<chunk>.md reports, then summarizes into
    docs/code-regression/SUMMARY.md. Re-runs reconcile against the previous
    reports and LEDGER.md instead of re-auditing from scratch. Use when the user
    asks for code-regression, code regression audit, principles sweep, glue/adapter
    audit, or a chunked codebase health review.
---

# Langflower — code regression

Read-only audit of source against a **closed list of defect classes**.
Orchestrator **coordinates** only — each chunk review runs in a Task subagent.
Does **not** edit product code unless the user explicitly asks after the summary.

The goal is a trustworthy ledger of open defects, **not** a list of findings.
After a successful drain the expected result is `Critical=0 Important=0`.
An empty run is a pass, not a failed audit.

## Critical rules

1. **Order is fixed** — split → per-chunk subagent reports → SUMMARY. Do not
   skip SUMMARY. Do not invent findings without file/path evidence.
2. **Docs only under `docs/code-regression/`** — chunk reports, `CHUNKS.md`,
   `LEDGER.md`, `SUMMARY.md`. Do not modify `packages/` / `tests/` / `launcher/`
   during this skill unless the user asks for fixes in a follow-up.
3. **Delta is the default mode** — a re-run reconciles the previous reports and
   `LEDGER.md` before looking for anything new. A full fresh audit happens only
   when the user explicitly asks for one.
4. **Closed class list is the bar** — every finding carries a `class` from
   [reference.md](reference.md) § Finding classes. Style, formatting, and
   "could be simpler" are **not** findings; Prettier and ESLint own style.
   Principles context: [PRINCIPLES.md](../../../docs/architecture/PRINCIPLES.md),
   [REACTIVITY.md](../../../docs/architecture/REACTIVITY.md),
   [FOUND_BUGS.md](../../../docs/FOUND_BUGS.md).
5. **Severity is inherited** — raising severity for the same finding needs
   `promoted-from` plus a new mechanism
   ([reference.md](reference.md) § Severity anchoring).
6. **Counts are derived** — SUMMARY totals come from counting `status: open`
   findings in the chunk files, never from hand-editing numbers.
7. **Chunk size stays small** — prefer package slices / feature folders over
   whole monorepo in one subagent. Default map:
   [reference.md](reference.md) § Default chunks. Keep it in sync with the live
   `CHUNKS.md`.
8. **Parallel chunks OK** — launch multiple Task subagents for independent
   chunks (cap ~4 concurrent). Never parallelize SUMMARY with unfinished
   chunk reports.
9. **No background `npm run dev` / `langflower start`** — audit is static /
   read-only (`.cursor/rules/dev-server-lifecycle.mdc`).

## When to use

- "Run code-regression" / "code regression audit"
- Defect-class sweep (dead exports, two writers, uncorrelated waits, twins)
- Chunked health review before a large refactor
- User names packages or paths to audit (override default chunk map)

## Workflow (required)

Copy and track:

```text
Code-regression progress:
- [ ] 1. SPLIT — choose chunks + mode; write/refresh docs/code-regression/CHUNKS.md
- [ ] 2. REVIEW — for each chunk: Task subagent → docs/code-regression/<chunk>.md
- [ ] 3. RECONCILE — LEDGER.md: fixed / wontfix rows; counts match chunk files
- [ ] 4. SUMMARY — aggregate → docs/code-regression/SUMMARY.md
- [ ] 5. Report to user — delta (fixed / still open / new), top items, next fixes
```

### 1. SPLIT — codebase into small chunks

1. Read [reference.md](reference.md) § Default chunks.
2. If the user scoped paths/packages, filter or replace the default map.
3. Pick the **mode**: `delta` when previous reports exist (default), `fresh`
   only on explicit user request. Record it in `CHUNKS.md`.
4. Ensure each chunk is reviewable in one subagent (~one package or one
   feature slice; split oversized packages — e.g. `common-nodes` by domain,
   `ui` by feature area).
5. Create `docs/code-regression/` and `LEDGER.md` if missing.
6. Write `docs/code-regression/CHUNKS.md` listing:
    - chunk id (kebab-case filename stem)
    - absolute/repo-relative paths included
    - status: pending | done
7. Delete superseded chunk reports in the same run (a stale report keeps
   inflating counts). Note the deletion in `CHUNKS.md`.

Chunk id = report filename without `.md`
(e.g. `runtime` → `docs/code-regression/runtime.md`).

### 2. REVIEW — one subagent per chunk

For each pending chunk, spawn `Task` / `generalPurpose` (read + write docs
only). Paste the prompt from [reference.md](reference.md) § Chunk reviewer
prompt, including the mode and the previous report path.

**Subagent task (verbatim intent):**

> confirm or deny the listed defect classes in this chunk; reconcile every
> previous finding; report nothing you would not open a PR for

Subagent **must**:

1. Read the chunk paths (sample thoroughly; do not claim full line-by-line
   coverage — note depth).
2. In delta mode, classify **every** previous finding first
   (`still-open` / `fixed` / `wontfix`), keeping the original `id` and
   `first-seen`. If the previous row is **not a listed class**, **drop it** —
   do not write `false-positive` rows. They confuse later runs.
3. Read [LEDGER.md](../../../docs/code-regression/LEDGER.md) and not reopen a
   closed or wontfix item without a new mechanism.
4. Read [PRINCIPLES.md](../../../docs/architecture/PRINCIPLES.md) and the relevant package
   `AGENTS.md` for context — but report only listed classes.
5. Use [FOUND_BUGS.md](../../../docs/FOUND_BUGS.md) for **same-mechanism**
   recurrence only; cite the BUG id.
6. Check [REACTIVITY.md](../../../docs/architecture/REACTIVITY.md) when the chunk has RxJS
   / UI / runtime streams (`withLatestFrom`, stray `.subscribe`, etc.).
7. Write **only** `docs/code-regression/<chunk>.md` using the chunk report
   template in [reference.md](reference.md).
8. Respect the caps as ceilings (≤8 findings, ≤3 Important) and leave sections
   as `none` when there is nothing to say.
9. Return a short status: path written + counts of `status: open` by severity.

Mark the chunk `done` in `CHUNKS.md` when the report exists.

**Do not** have subagents edit product source. Findings are proposals.

### 3. RECONCILE — LEDGER and counts

Before writing SUMMARY:

1. Append every newly `fixed` finding to `LEDGER.md` § Closed (id, chunk,
   class, date, evidence).
2. Move user-accepted items to § Wontfix; move findings reported in two or
   more runs with no action to § Perennial suggestions.
3. Recount: for each chunk, count `status: open` findings by severity and
   compare with the subagent's reported counts. A mismatch is a **stop
   condition** — fix the chunk report, do not paper over it in SUMMARY.

### 4. SUMMARY

After all chunk reports exist, write
`docs/code-regression/SUMMARY.md` (orchestrator or one final Task).

Must include:

1. Date / scope / mode / chunk list with links
2. Delta table vs the previous run (previous C/I, fixed, still open, new)
3. Cross-cutting themes backed by two or more open findings
4. Priority table of **open Critical + Important only**, each row linking to
   the chunk report, the finding `id`, and a concrete path
5. Deduplicated recommendations (merge repeats across chunks)
6. Suggested fix order (Critical mechanisms, then zero-consumer deletes, then
   clusters needing ADR / human OK)
7. Chunk index with `Critical` / `Important` counts only

Suggestions live in chunk reports and never enter SUMMARY counts or tables.

Template: [reference.md](reference.md) § SUMMARY template.

## User overrides

| Override                     | Behavior                                           |
| ---------------------------- | -------------------------------------------------- |
| Named packages / paths       | Review only those chunks                           |
| "Re-run chunk X"             | Overwrite `docs/code-regression/X.md` only (delta) |
| "Fresh audit" / "from zero"  | Ignore previous findings; still honor `LEDGER.md`  |
| "Summary only"               | Rebuild SUMMARY from existing chunk reports        |
| "Fix top N after regression" | Separate follow-up — not part of this skill        |

## Done criteria

- [ ] `CHUNKS.md` lists every reviewed chunk as `done`, with the mode recorded
- [ ] Every chunk has `docs/code-regression/<chunk>.md`; superseded reports are
      deleted
- [ ] In delta mode every kept previous finding is `still-open` / `fixed` /
      `wontfix`; dropped not-a-class rows are deleted, not stored as
      `false-positive`; `LEDGER.md` gained the `fixed` / `wontfix` rows
- [ ] `SUMMARY.md` exists, links all chunk reports, and its counts equal the
      `status: open` findings in those files
- [ ] User gets a short Russian or English summary (match user language) with
      the delta (fixed / still open / new) and paths to the docs

A run with zero open findings is a valid, successful result. Do not add
findings to make a run look productive.

## Additional resources

- Templates + classes + severity anchoring + prompts: [reference.md](reference.md)
- Ledger: [docs/code-regression/LEDGER.md](../../../docs/code-regression/LEDGER.md)
- Principles: [docs/architecture/PRINCIPLES.md](../../../docs/architecture/PRINCIPLES.md)
- Found bugs: [docs/FOUND_BUGS.md](../../../docs/FOUND_BUGS.md)
- Reactivity: [docs/architecture/REACTIVITY.md](../../../docs/architecture/REACTIVITY.md)
- Navigation: [docs/architecture/NAVIGATION.md](../../../docs/architecture/NAVIGATION.md)
