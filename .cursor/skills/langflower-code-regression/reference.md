# Code regression — chunks, prompts, templates

Parent: [SKILL.md](SKILL.md).

## Default chunks

Prefer this map for a full run. Split further if a chunk is too large for one
reviewer. Skip packages absent from the tree. Keep this table in sync with
[CHUNKS.md](../../../docs/code-regression/CHUNKS.md) — when the tree moves,
the live `CHUNKS.md` wins and this map is updated in the same run.

| Chunk id              | Paths                                                                                                                                                          |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared`              | `packages/shared/src/`                                                                                                                                         |
| `node-sdk`            | `packages/node-sdk/src/`                                                                                                                                       |
| `runtime`             | `packages/runtime/src/`                                                                                                                                        |
| `tools`               | `packages/tools/src/`                                                                                                                                          |
| `compiler`            | `packages/compiler/src/`                                                                                                                                       |
| `common-nodes-ai`     | `packages/common-nodes/src/ai/`                                                                                                                                |
| `common-nodes-domain` | `packages/common-nodes/src/{crawl,memory,logic,flow}/` (plus `kb,obsidian` when present)                                                                       |
| `common-nodes-rest`   | `packages/common-nodes/src/{hitl,text,output,primitives,embeddings,mcp,langflower-tools,tools,run-host}/`, `catalog.ts`, `resolve-workflow-node-definition.ts` |
| `eval`                | `packages/eval/src/`                                                                                                                                           |
| `langflower-mcp`      | `packages/langflower-mcp/src/`                                                                                                                                 |
| `websocket-bridge`    | `packages/websocket-bridge/src/`                                                                                                                               |
| `server-bridge`       | `packages/server/src/bridge/` (plus `packages/server/src/websocket/` when present)                                                                             |
| `server-core`         | `packages/server/src/` excluding `bridge/` (and `websocket/`)                                                                                                  |
| `ui-editor`           | `packages/ui/src/app/features/editor/`                                                                                                                         |
| `ui-sidebar-feed`     | `packages/ui/src/app/features/sidebar/`                                                                                                                        |
| `ui-feed`             | `packages/ui/src/app/features/feed/`, `packages/ui/src/app/features/feed-folding/`                                                                             |
| `ui-canvas`           | `packages/ui/src/app/features/canvas/`, `packages/ui/src/app/features/canvas-node-status-folding/`                                                             |
| `ui-composer`         | `packages/ui/src/app/features/composer/`                                                                                                                       |
| `ui-palette`          | `packages/ui/src/app/features/palette/`                                                                                                                        |
| `ui-services`         | `packages/ui/src/app/services/`                                                                                                                                |
| `ui-rest`             | `packages/ui/src/app/` excluding features already chunked and `services/`                                                                                      |
| `cli`                 | `packages/cli/src/`                                                                                                                                            |
| `integration-tests`   | `tests/integration/`                                                                                                                                           |
| `launcher`            | `launcher/src/` (skip `target/`), `launcher/scripts/`, `launcher/docs/`, `launcher/package.json`, `launcher/README.md`, `launcher/AGENTS.md`                   |

Optional (only if user asks for full-src):

| Chunk id      | Paths    |
| ------------- | -------- |
| `build-tools` | `build/` |

### CHUNKS.md template

```markdown
# Code regression — chunks

Date: <ISO date>
Scope: <full | user override>
Mode: <delta | fresh>

| Chunk     | Paths                   | Status  |
| --------- | ----------------------- | ------- |
| `runtime` | `packages/runtime/src/` | pending |
```

## Finding classes (closed list)

A finding **must** carry a `class` from this list. No class → it is not a
finding; put it in `## Non-issues / looked OK` instead.

| Class                   | Qualifies when                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------- |
| `dead-export`           | Zero consumers (ts-scan / `dead-code` evidence), named path + symbol                                    |
| `two-writers`           | Two independent folds / subscribes / assignments own one concern; both writers named                    |
| `uncorrelated-wait`     | A wait takes the _next_ event with no id or predicate tying it to this request                          |
| `false-ready`           | A successful ready/value is synthesized from a missing fact (`startWith([])`, fallback port, `{}`)      |
| `stale-hydrate`         | After reset/settle the same snapshot is applied again and revives cleared state                         |
| `twin-without-adr`      | Mirrored type/helper not listed in [ADR-039](../../../docs/architecture/ADR.md) and with no parity test |
| `docs-ghost`            | Doc / JSDoc / catalog teaches a **deleted** API or a renamed symbol                                     |
| `found-bugs-recurrence` | The **same mechanism** as a `BUG-*` entry, not a similar smell                                          |
| `forbidden-op`          | `withLatestFrom` without human OK, `index.ts` barrel, thin-server domain tree                           |
| `fail-open-io`          | parse / skip / abort swallowed with no Result, no `failures` row, no visible error                      |

**Not classes** (do not report as findings, in any severity):

- Style and formatting: `function` vs arrow, import order, naming taste.
  Prettier and ESLint own those.
- "Could be one helper" / "could be inlined" on working code with no defect.
- Polling instead of `wait()`, or any other working-but-different
  implementation choice.
- Speculative futures: "when a second writer appears", "if someone adds a
  select without a blank option".
- Cosmetic `as` on an already-correct type.
- Generic advice with no path ("improve architecture", "add tests").

## Severity guide

| Severity   | Use when                                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------- |
| Critical   | A concrete bug sketch: hang, data loss, wrong ready, overlapping start, lost cancellation. Name the sequence that breaks. |
| Important  | A class above **with evidence**, where the fix removes code or closes a hole. Not "this would be nicer".                  |
| Suggestion | Optional cleanup inside the chunk. Stays in the chunk report; never enters SUMMARY counts or the priority table.          |

### Severity anchoring (required)

Severity is **inherited** from the previous report for the same finding `id`.

- Lowering severity: always allowed, no justification needed.
- Raising severity: allowed **only** with `promoted-from: <old severity>` plus a
  new mechanism — code changed, a new consumer appeared, a repro exists, or the
  defect is now reachable from a production path. "I looked more carefully" is
  not a mechanism.
- Never promote with the phrase "residual BUG-…". A recurrence needs the same
  mechanism, and then it is a new finding with its own evidence.

This rule exists because unchanged code was re-graded between runs
(`matchPermissionPattern` and `builtins/args.ts` `asNumber` went Suggestion →
Important with no code change).

## Chunk reviewer prompt

Paste into Task (`generalPurpose`). Fill placeholders.

```text
You are a Langflower code-regression reviewer for ONE chunk. Read-only for
product code. Write exactly one markdown report.

Your job is to CONFIRM OR DENY a closed list of defect classes — not to find
improvements. An empty Findings list is a correct, welcome result.

Chunk id: <CHUNK_ID>
Paths (repo-relative): <PATHS>
Report path (absolute): <REPO>/docs/code-regression/<CHUNK_ID>.md
Mode: <delta | fresh>
Previous report (delta mode): <REPO>/docs/code-regression/<CHUNK_ID>.md
Ledger: <REPO>/docs/code-regression/LEDGER.md

Read before judging:
- This skill's reference.md § Finding classes + § Severity anchoring
- docs/code-regression/LEDGER.md — closed and wontfix items you MUST NOT reopen
- docs/architecture/PRINCIPLES.md (thin server, no adapters/glue, types, barrels,
  composer entry points, delete obsolete code)
- docs/architecture/REACTIVITY.md if this chunk uses RxJS / streams
- docs/FOUND_BUGS.md — only for same-mechanism recurrence
- package AGENTS.md under the chunk's package(s)
- docs/architecture/NAVIGATION.md if ownership is unclear

Delta mode (default):
1. Read the previous report first. For EVERY previous finding set a status:
   still-open | fixed | wontfix. `fixed` needs evidence that the code path is
   gone or changed. Keep the original `id` and `first-seen`.
2. If a previous row is **not a listed class**, drop it. Do **not** write
   `false-positive` rows, ids, or evidence. They are not findings and they
   confuse later agents.
3. Only then look for new findings. A new finding is allowed when it is a
   regression of a `fixed` item, or a listed class in code the previous report
   did not cover. It MUST carry `why-new:` (new file, new call site, changed
   code) — "previous reviewer missed it" is allowed only with the concrete
   reason it was invisible then.
4. Do not restate a LEDGER wontfix as a finding. Mention it in Non-issues.

Hard rules:
- Do NOT edit packages/, tests/, launcher/, or build/.
- Overwrite only the report file named above.
- Every finding needs: id, class (from the closed list), severity, first-seen,
  status, path (+ symbol/line hint), evidence, proposed fix.
- No class from the list → not a finding. Put it in Non-issues.
- Style / formatting is never a finding (Prettier + ESLint own it).
- Working code that could be simpler is not a finding.
- Caps: at most 8 findings per chunk, of which at most 3 Important. These are
  ceilings, NOT targets. If you land exactly on a cap, drop everything you
  would not open a PR for this week.
- Sections `Streamlining`, `Design-flaw fixes`, `Glue / adapters` may be
  `none`. Never fill a section to look thorough.
- State coverage honestly; do not claim a line-by-line audit of a sample.

Write the report using this structure exactly:

# Code regression — <CHUNK_ID>

## Meta
- Paths: …
- Date: …
- Mode: delta | fresh
- Coverage: <what was sampled>
- Previous report: <date + counts, or "none">

## Previous findings (delta mode)
Table: id | severity | status (still-open / fixed / wontfix) | evidence.
Omit this section only in fresh mode. Do not keep dropped / not-a-class rows.

## Principles check
Bullet list of PASS/FAIL themes with evidence paths. FAIL only for a listed
class. Style observations do not belong here.

## FOUND_BUGS signals
Same-mechanism recurrence only, with BUG id. Otherwise "none".

## Glue / adapters / parallel types
`twin-without-adr` evidence, or "none". ADR-backed copies: note and move on.

## Streamlining & simplifications
Only deletions that remove a `dead-export` or a real duplicate path, or "none".

## Design-flaw fixes
Only Critical-class mechanisms (concurrency, ownership, duplicate events,
scope) with the breaking sequence named, or "none".

## Findings
Numbered list. Each item exactly:
- id: <stable-kebab-id>
- class: <one of the closed list>
- severity: Critical | Important | Suggestion
- first-seen: <ISO date>
- status: open
- promoted-from: <old severity + mechanism>   (only if raising severity)
- why-new: <reason>                            (only for new findings in delta)
- path: <path + symbol>
- evidence: <what proves the defect>
- proposed fix: <concrete direction>

## Non-issues / looked OK
Short bullets: clean areas, LEDGER wontfix items re-confirmed, style
observations that are deliberately not findings.

Return to parent:
## Status
report path + counts: Critical=N Important=N Suggestion=N
(counts must equal the findings with status: open in the file)
```

## SUMMARY template

```markdown
# Code regression — SUMMARY

Date: <ISO date>
Scope: <full | override>
Mode: <delta | fresh>
Chunks reviewed: N (see [CHUNKS.md](CHUNKS.md))

**Totals (open, counted from chunk files):** Critical=N · Important=N

Suggestions stay in the chunk reports and are not counted here.

## Delta vs previous run

| Chunk | Previous C/I | Fixed | Still open | New | Current C/I |
| ----- | ------------ | ----- | ---------- | --- | ----------- |

## Cross-cutting themes

- … (only themes backed by two or more open findings)

## Priority table (open Critical + Important only)

| Sev      | Chunk                 | id  | Path                   | Issue | Proposed fix |
| -------- | --------------------- | --- | ---------------------- | ----- | ------------ |
| Critical | [runtime](runtime.md) | …   | `packages/runtime/...` | …     | …            |

Closed rows do not stay in this table — they move to [LEDGER.md](LEDGER.md)
and the chunk report flips to `status: fixed`.

## Deduplicated recommendations

1. …

## Suggested fix order

1. Critical mechanisms …
2. Zero-consumer deletes …
3. Clusters needing ADR / human OK …

## Chunk index

- [runtime](runtime.md) — Critical=… Important=…
```

### Counting rule

SUMMARY counts are **derived**, never hand-edited:

1. Read each chunk report's `## Findings` and count entries with
   `status: open`.
2. The chunk index, the totals line, and the priority table must agree with
   those files. A mismatch is a stop condition — fix the chunk report first.
3. Closing a finding edits the **chunk report** (`status: fixed` + evidence)
   and appends [LEDGER.md](../../../docs/code-regression/LEDGER.md). Marking a
   row "closed" only in SUMMARY is forbidden — that drift produced a SUMMARY
   claiming `Important=46` while the chunk files held 55.

## LEDGER template

`docs/code-regression/LEDGER.md` is append-mostly memory across runs.

```markdown
## Closed

| id  | Chunk | Class | Closed | Evidence |
| --- | ----- | ----- | ------ | -------- |

## Wontfix (do not reopen without a new mechanism)

| id  | Chunk | Why accepted | Recorded |
| --- | ----- | ------------ | -------- |

## Perennial suggestions

Reported in two or more runs with no action. Next run: promote with a
mechanism, or move to Wontfix. Do not re-file as a fresh Suggestion.

| id  | Chunk | Runs | Note |
| --- | ----- | ---- | ---- |
```

## Anti-patterns for reviewers

- **Filling the cap.** Treating "at most 8" as a quota to reach.
- **Re-litigating closed code.** Reopening a LEDGER entry without a new
  mechanism.
- **Severity inflation.** Promoting last run's Suggestion because this run
  needs Important rows.
- **BUG analogy.** Tagging nearby code as a `found-bugs-recurrence` when the
  mechanism differs.
- **Simplification as defect.** Reporting working code because a tidier shape
  exists.
- **Style findings.** `function` vs arrow, import order, formatting.
- **Speculative findings.** "This will break when someone adds …".
- Vague "improve architecture" with no path.
- Recommending new abstraction layers "for later".
- Demanding refactors outside the chunk without noting the dependency.
- Editing product code during the regression run.
- Claiming a full-file audit when only sampled.
