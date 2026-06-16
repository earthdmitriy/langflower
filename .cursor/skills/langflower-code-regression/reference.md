# Code regression — chunks, prompts, templates

Parent: [SKILL.md](SKILL.md).

## Default chunks

Prefer this map for a full run. Split further if a chunk is too large for one
reviewer. Skip packages absent from the tree.

| Chunk id              | Paths                                                              |
| --------------------- | ------------------------------------------------------------------ |
| `shared`              | `packages/shared/src/`                                             |
| `node-sdk`            | `packages/node-sdk/src/`                                           |
| `runtime`             | `packages/runtime/src/`                                            |
| `tools`               | `packages/tools/src/`                                              |
| `common-nodes-ai`     | `packages/common-nodes/src/ai/`                                    |
| `common-nodes-domain` | `packages/common-nodes/src/{crawl,kb,memory,obsidian,logic,flow}/` |
| `eval`                | `packages/eval/src/`                                               |
| `langflower-mcp`      | `packages/langflower-mcp/src/`                                     |
| `websocket-bridge`    | `packages/websocket-bridge/src/` (if present)                      |
| `server-bridge`       | `packages/server/src/bridge/`, `packages/server/src/websocket/`    |
| `server-core`         | `packages/server/src/` excluding `bridge/` and `websocket/`        |
| `ui-editor`           | `packages/ui/src/app/features/editor/`                             |
| `ui-sidebar-feed`     | `packages/ui/src/app/features/sidebar/`                            |
| `ui-services`         | `packages/ui/src/app/services/`                                    |
| `ui-rest`             | `packages/ui/src/app/` excluding features already chunked          |
| `cli`                 | `packages/cli/src/`                                                |
| `integration-tests`   | `tests/integration/`                                               |

Optional (only if user asks for full-src):

| Chunk id      | Paths    |
| ------------- | -------- |
| `build-tools` | `build/` |

### CHUNKS.md template

```markdown
# Code regression — chunks

Date: <ISO date>
Scope: <full | user override>

| Chunk     | Paths                   | Status  |
| --------- | ----------------------- | ------- |
| `runtime` | `packages/runtime/src/` | pending |
```

## Chunk reviewer prompt

Paste into Task (`generalPurpose`). Fill placeholders.

```text
You are a Langflower code-regression reviewer for ONE chunk. Read-only for
product code. Write exactly one markdown report.

Task: verify code against principles, check found bugs.md, propose
streamlining and simplifications, design flaw fixes, check for unnecessary
glue-code, types and adapter.

Chunk id: <CHUNK_ID>
Paths (repo-relative): <PATHS>
Report path (absolute): <REPO>/docs/code-regression/<CHUNK_ID>.md

Read before judging:
- docs/PRINCIPLES.md (thin server, no adapters/glue, types, barrels,
  composer entry points, delete obsolete code)
- docs/REACTIVITY.md if this chunk uses RxJS / streams
- docs/FOUND_BUGS.md — cite BUG ids whose design-flaw signal matches this code
- package AGENTS.md under the chunk’s package(s)
- docs/NAVIGATION.md if ownership is unclear

Rules:
- Do NOT edit packages/, tests/, or build/.
- Overwrite only the report file named above.
- Every finding needs a concrete path (and symbol/line hint when possible).
- Prefer honest “looked OK” over invented issues.
- Severity: Critical (principles breach / likely bug class) |
  Important (real simplification or design-flaw fix) |
  Suggestion (optional cleanup).
- Max ~15 findings total; merge duplicates. Depth: representative sample of
  the chunk, not every line — state coverage in the report.

Write the report using this structure exactly:

# Code regression — <CHUNK_ID>

## Meta
- Paths: …
- Date: …
- Coverage: <what was sampled>

## Principles check
Bullet list of PASS/FAIL themes with evidence paths.
Focus: immutability/RxJS folds, thin server, feature-sliced, no barrels
(`index.ts`), `type` not `interface`, arrow functions, composer entry points,
prepare-then-mutate, dead/obsolete parallel APIs.

## FOUND_BUGS signals
Which BUG-* design-flaw signals recur or risk recurrence here? Or “none”.

## Glue / adapters / parallel types
Unnecessary `*Adapter` / `*Mapper` / shim layers, field-reshuffle glue,
mirror types of existing domain shapes. ADR-backed adapters: note + exit
criteria gap if any.

## Streamlining & simplifications
Concrete delete/inline/merge proposals (path + what to remove/simplify).

## Design-flaw fixes
Architectural wrong assumptions (concurrency, ownership, duplicate events,
scope) and a proposed fix direction — not a full implementation.

## Findings
Numbered list. Each item:
- Severity: Critical | Important | Suggestion
- Path / symbol
- Problem
- Proposed fix

## Non-issues / looked OK
Short bullets so the summary does not re-litigate clean areas.

Return to parent:
## Status
report path + counts: Critical=N Important=N Suggestion=N
```

## SUMMARY template

```markdown
# Code regression — SUMMARY

Date: <ISO date>
Scope: <full | override>
Chunks reviewed: N (see [CHUNKS.md](CHUNKS.md))

## Cross-cutting themes

- …

## Priority table

| Sev      | Chunk                 | Path                   | Issue | Proposed fix |
| -------- | --------------------- | ---------------------- | ----- | ------------ |
| Critical | [runtime](runtime.md) | `packages/runtime/...` | …     | …            |

## Deduplicated recommendations

1. …
2. …

## Suggested fix order

1. Small safe wins …
2. Design-flaw clusters …
3. Larger refactors (need ADR / human OK) …

## Chunk index

- [runtime](runtime.md) — Critical=… Important=… Suggestion=…
```

## Severity guide

| Severity   | Use when                                                                                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Critical   | Principles breach likely to cause bugs, thin-server domain growth, glue that hides a wrong boundary, forbidden `withLatestFrom` without human OK, barrel `index.ts` |
| Important  | Clear simplification, parallel type mirror, removable adapter, FOUND_BUGS pattern recurrence                                                                        |
| Suggestion | Style / optional extract-or-inline, docs nits, non-blocking cleanup                                                                                                 |

## Anti-patterns for reviewers

- Vague “improve architecture” without a path
- Recommending new abstraction layers “for later”
- Demanding refactors outside the chunk without noting dependency
- Editing product code during the regression run
- Claiming full-file audit when only sampled
