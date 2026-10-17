---
kind: work
owner: docs
covers: []
status: current
---

# Specification: Knowledge-base restructure (epic 50)

**Status:** landed  
**Index:** [README.md](README.md)  
**Related:** [AGENTS.md](../../../../AGENTS.md),
[NAVIGATION](../../../architecture/NAVIGATION.md),
[FOUND_BUGS](../../../bugs/README.md), [ADR](../../../adr/README.md),
[TESTING](../../../guides/TESTING.md),
[package boundary tests](../../../../tests/unit/package-boundaries/allowed-edges.ts)

## 1. Executive Summary & Intent

- **Problem Statement:** The knowledge base outgrew its original shape. About
  334 `.md` files exist in the repo; 203 live under `docs/`, 25+ of them flat in
  the `docs/` root with no placement rule. Single files are too large to read:
  `FOUND_BUGS.md` 437 KB (117 entries), `ADR.md` 140 KB (42 ADRs),
  `NAVIGATION.md` 46 KB, `STATUS.md` 41 KB. Historical and working material
  (`DONE/` 72 files, `code-regression/` 27 files, `TO_REVIEW.md`, `WIP/`) sits
  next to reference docs and pollutes search. Knowledge is split across five
  places (`docs/`, package `AGENTS.md`, `.cursor/**`, `.langflower/**`,
  `packages/server/skeleton/**` + `demo-project/**` copies) with manual sync.
  Nothing connects a code change to the docs it invalidates, so updates depend
  on agent memory. The only automated check is `check-doc-links-temp.mjs`
  (explicitly temporary, not part of `verify`; it already reports 58 broken
  relative links).
- **User Prompt Source:** "How should the project knowledge base be organised?
  `docs/` no longer fits the initial structure; agents/people may not find
  things, or docs will not be updated on change." Discovery answers: full
  reorganisation; readers are agents and humans equally; split monoliths into
  one file per item; archive and working docs go out of default search; one
  source of truth for duplicated knowledge. Follow-up: **enforce through
  boundary-style unit tests** (like `tests/unit/package-boundaries/`), not a
  separate CLI tool; **the applied purpose of the tests is to remind agents to
  update documentation.**
- **External Context:** None. Jira / Confluence / Figma are not involved.
- **Locked decisions:**
    1. **Full reorganisation:** files move, monoliths split, links rewritten.
    2. **Readers:** agents and humans. Router + frontmatter serve both.
    3. **Monoliths:** `ADR.md` → one file per ADR; `FOUND_BUGS.md` → one file per
       bug. Generated indexes. Template and "log in the same PR" rule stay.
    4. **Archive / working docs:** `DONE/`, `code-regression/`,
       `agent-honesty-probe/` → `docs/_archive/`; `TODO/`, `WIP/`, `TO_REVIEW`,
       `TBD` → `docs/_work/`. Both excluded from default agent search.
    5. **Enforcement = vitest boundary tests** in
       `tests/unit/docs-boundaries/`, picked up by the existing unit run, so
       they are part of `npm run test` and `verify` (including `--quick`).
       There is **no** `docs-check` CLI. Generators (`docs-gen`, `docs-sync`)
       stay as scripts because they write files; the tests call their
       `--check` mode.
    6. **Tests are reminders first.** Every failure is an imperative message
       addressed to the agent: what changed, which doc to update, how to
       acknowledge "no doc change needed". Green/red is secondary to a
       message an agent can act on without searching.
    7. **Duplicated knowledge:** one source of truth + sync script + drift test.
       The skeleton skills folder is the source for `langflower-helper` and the
       other bootstrap skills.
    8. **Package-local `ADR.md` / `FOUND_BUGS.md`** (`packages/runtime/`) merge
       into the central `adr/` and `bugs/` with a `package:` field.
    9. **`.langflower/memory/**`** (dogfood agent memory) is **not** knowledge
       base: untrack it, ignore it, exclude from tests and agent search.
- **Non-goals:** rewriting doc content for quality (only moves, splits,
  frontmatter, link fixes, and deletion of provably dead docs); changing
  product behaviour; changing the `docs-refine` skill pipeline beyond path
  updates; a doc site generator; translating docs; proving that doc text is
  _correct_ (tests prove "consistent where checkable" and "someone looked").

## 2. Codebase Guardrails & Local Alignment

- **Designated Base Folder:** `docs/` (content), `tests/unit/docs-boundaries/`
  (rules), `build/` (generators only).
- **Target Directories / files:**
    - `docs/**` — whole tree re-laid (§ 3.A).
    - `tests/unit/docs-boundaries/` — new (§ 3.B).
    - `build/docs-gen.mjs`, `build/docs-sync.mjs`, `build/lib/docs/*.mjs` — new
      generators; registered in `build/tools/agent-run.mjs` and `package.json`
      scripts. **No** change to `build/verify.mjs` steps: the unit run already
      includes the new tests (confirm in Step 3).
    - `.cursor/rules/docs-sync.mdc` — new always-applied rule.
    - `AGENTS.md`, package `AGENTS.md`, `.cursor/rules/*.mdc`,
      `.cursor/skills/**` — path updates; AGENTS.md doc table → router.
    - `packages/server/skeleton/skills/langflower-helper/**` — KB facts and
      paths; copies in `demo-project/.langflower/skills/**` become generated.
    - Source comments / `NODE.md` / package READMEs that cite `docs/...` paths.
    - `package.json` `files` entry `docs/public`.
    - `.gitignore`, `.cursorignore` — archive / work / memory exclusions.
- **Architectural Patterns & Boilerplates Enforced:**
    - Mirror `tests/unit/package-boundaries/`: a **data matrix** module
      (what is allowed), a **scan** module (read the repo), **rule functions**
      (pure: input → findings), and thin `*.test.ts` files that run the rules
      on the real repo and assert `findings` is empty.
    - Rule functions take a repo root, so the same code is exercised against
      temp-dir fixtures (one pass + one fail per rule) and against the real
      repo.
    - Findings are formatted by one `formatReminder` helper (§ 3.F). Tests must
      not call `expect(...).toEqual([])` on raw arrays; they assert via the
      helper so every failure carries the reminder text.
    - TypeScript strict, no `any`, `type` aliases, arrow functions, immutable
      updates, no `index.ts` barrels. Single-use helpers stay local to their
      rule file.
    - **Delete replaced code in the same change:**
      `build/tools/check-doc-links-temp.mjs` and
      `build/tools/move-architecture-docs.mjs`.
    - No stubs or redirect files at old paths. Old paths die; the tests prove
      nothing still points at them.
    - Generated files carry a `<!-- generated by docs-gen; do not edit -->`
      header and are verified by regeneration diff.
    - Docs are English.
- **Pattern & Boilerplate Reference Baseline:**
    - `tests/unit/package-boundaries/allowed-edges.ts` — matrix style.
    - `tests/unit/package-boundaries/scan.ts` — file collection + parse helpers.
    - `tests/unit/package-boundaries/{production-imports,ownership-layout,
package-json-dag}.test.ts` — "collect offenders, assert empty" shape.
    - `build/tools/check-doc-links-temp.mjs` — link regex and `git ls-files`
      enumeration; port into `scan.ts`, then delete the script.
    - `build/tools/move-architecture-docs.mjs` — precedent for scripted moves
      with link rewriting (one-shot, deleted after use).
    - `docs/product/features/README.md`, `docs/product/use-cases/README.md` — existing index
      conventions folded into the router.
- **Third-Party Dependencies:** none. Frontmatter is flat YAML (scalar keys +
  string lists), parsed by a small local function; do not add a dependency.
- **Shared Utilities to reuse:** repo-root resolution and `git` helpers from
  `build/lib/`; `ALLOWED_WORKSPACE_DEPS`, `PACKAGE_DIRS` from
  `tests/unit/package-boundaries/allowed-edges.ts` for consistency rules.

## 3. Deep System Mechanics & System Analysis

### A. Target structure and placement rules

```text
docs/
  README.md            router: question -> doc (hand-written) + layer map
  product/             PRODUCT, GLOSSARY, STATUS(+split), features/, use-cases/
  architecture/        PRINCIPLES, ARCHITECTURE, REACTIVITY, EXECUTION_ARCHITECTURE,
                       EXTENSION_POINT, NAVIGATION(+split), ui/ (NG_DIAGRAM, VIRTUAL_SCROLL)
  reference/           subsystem mechanics + catalogs: SESSIONS, LLM_RECOVERY, EMBEDDING,
                       CONFIG, NODES, LLM_NODES, SYSTEM_PROMPT, LANGFLOWER_MCP
  guides/              procedures: how-to-write-reactive-nodes, TESTING, RELEASE, writing-docs
  adr/                 NNN-slug.md + README.md (generated index)
  bugs/                BUG-YYYY-MM-DD[x]-slug.md + README.md (generated index + themes)
  _work/               TODO, WIP, TO_REVIEW, TBD   (live, not reference)
  _archive/            DONE, code-regression, agent-honesty-probe   (history)
  assets/              img/, public/, palette.html
```

| Layer           | Answers                     | Update trigger                      |
| --------------- | --------------------------- | ----------------------------------- |
| `product/`      | What does it do, for whom?  | Behaviour or scope changes          |
| `architecture/` | Why is it shaped this way?  | Boundary / flow / principle changes |
| `reference/`    | How does subsystem X work?  | Subsystem or config/API changes     |
| `guides/`       | How do I do task Y?         | Procedure or tool changes           |
| `adr/`          | Why did we decide Z?        | New or superseded decision          |
| `bugs/`         | What broke and what flaw?   | Reproduced non-trivial bug          |
| `_work/`        | What is queued / in flight? | Planning                            |
| `_archive/`     | What happened before?       | Never edited; only added to         |

Package-local docs (`packages/*/AGENTS.md`, `packages/ui/docs/*`,
`packages/*/README.md`, `NODE.md`) stay beside code. They are registered in the
router and carry frontmatter, but are not moved.

Frontmatter contract (flat YAML, required for every non-generated, non-archive
doc under `docs/` and for registered package-local docs):

```yaml
---
kind: product | architecture | reference | guide | adr | bug | feature | use-case | index
owner: server | ui | runtime | shared | node-sdk | tools | common-nodes | compiler | eval | mcp | cli | launcher | docs
covers: ['packages/server/src/bootstrap/**'] # code globs this doc describes; [] for pure product/process docs
status: current | draft | superseded
---
```

ADR files add `id`, `supersedes`, `superseded-by`, `package`. Bug files add
`date`, `flaw` (design-flaw tag), `package`, `fixed` (`yes|no|deferred`).

`docs-gen` derives from frontmatter: `adr/README.md`, `bugs/README.md`, the
**code→docs map** (`docs/architecture/DOC_MAP.md`, generated), and the
package-local registry section of `docs/README.md` (between marker comments).

### B. Test suite: `tests/unit/docs-boundaries/`

```text
layer-rules.ts          matrix: layer -> dir, allowed kinds, allowed link targets
consistency-facts.ts    matrix: code fact <-> doc location pairs (§ D)
scan.ts                 list .md, parse frontmatter, links, anchors, heading slugs
reminder.ts             formatReminder(finding) -> imperative agent message
rules/<rule>.ts         pure rule functions: (root) => Finding[]
layout.test.ts          placement, kind-vs-dir, frontmatter, size, reachability
links.test.ts           links + anchors, code path refs, link direction
generated.test.ts       docs-gen --check, docs-sync --check
consistency.test.ts     docs <-> code facts
freshness.test.ts       changed code with `covers` -> a covering doc changed
rules.fixtures.test.ts  every rule against temp-dir fixtures (pass + fail)
reminder.test.ts        message format contract
```

Rules (each a named function, each with a stable `ruleId`):

| ruleId           | Checks                                                                                                                                         |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `links`          | Relative markdown links and `#anchor` resolve (promoted from `check-doc-links-temp.mjs`; anchors are new).                                     |
| `code-refs`      | Every `docs/...` path cited in `*.ts`, `*.md`, `*.mdc`, `*.json` resolves.                                                                     |
| `link-direction` | `product/`, `architecture/`, `reference/`, `guides/` never link into `_work/`; nothing outside the two history indexes links into `_archive/`. |
| `placement`      | No `.md` directly in `docs/` except `README.md`; `kind` matches directory.                                                                     |
| `frontmatter`    | Required keys present and valid; every `covers` glob matches ≥ 1 tracked file (dead globs fail).                                               |
| `reachable`      | Every doc under `docs/` (minus `_archive/`, generated files) is linked from `docs/README.md` or a layer index.                                 |
| `size`           | Non-log docs: warn > 24 KB, fail > 40 KB. ADR / bug files: fail > 24 KB. Warnings are printed, never fail.                                     |
| `generated`      | `docs-gen --check` is clean.                                                                                                                   |
| `sync`           | `docs-sync --check` is clean (skeleton skills vs `demo-project` / `.langflower/skills`).                                                       |
| `consistency:*`  | One id per fact pair in § D.                                                                                                                   |
| `freshness`      | § E.                                                                                                                                           |

### C. Blast radius

- **Files moved:** ~110 live docs in `docs/` plus ~100 archive files; all by
  `git mv` to keep history.
- **Files split:** `ADR.md` (42 → 42 files + index), `FOUND_BUGS.md` (117 + 6
  from `packages/runtime/FOUND_BUGS.md` → files + index), `NAVIGATION.md`,
  `STATUS.md` (per-package / per-area files + index), plus any other doc found
  over 40 KB in inventory.
- **Link rewrite surface:** all `.md`, source comments, `NODE.md`,
  `package.json`, `.cursor/**`, skeleton skills, CI workflow paths (grep
  `docs/` in `.github/**`).
- **Behavioural risk:** none to runtime. Risk is broken links and stale agent
  instructions; both are caught by the new tests.
- **Skeleton:** the shipped bootstrap skills change text (paths). Skeleton and
  bootstrap tests must stay green.

### D. Consistency facts (state-based reminders, no git needed)

Each pair is data in `consistency-facts.ts`: a **code-side extractor**, a
**doc-side extractor**, and the **reminder text** naming the doc to edit.
Initial set (Step 8 may add more, each needs a test and a reminder):

| ruleId                           | Code side                                                | Doc side                                                   |
| -------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------- |
| `consistency:package-dag`        | `ALLOWED_WORKSPACE_DEPS` in `allowed-edges.ts`           | Dependency sketch in architecture navigation doc           |
| `consistency:package-list`       | `PACKAGE_DIRS`                                           | Package table in navigation doc + router                   |
| `consistency:package-agents`     | each `packages/<dir>/`                                   | `packages/<dir>/AGENTS.md` exists and is registered        |
| `consistency:node-docs`          | each node dir under `packages/common-nodes/src/**/nodes` | `NODE.md` exists                                           |
| `consistency:agent-run-commands` | keys of `COMMANDS` in `build/tools/agent-run.mjs`        | Mentioned in `.cursor/skills/langflower-build/commands.md` |
| `consistency:adr-refs`           | `adr/NNN-*.md` ids                                       | Every `ADR-NNN` mentioned anywhere resolves to a file      |
| `consistency:skeleton-skills`    | dirs in `packages/server/skeleton/skills/`               | Listed in helper KB layout + router                        |
| `consistency:epic-index`         | files in `_work/TODO/EPICS` and `_archive/DONE/EPICS`    | Each listed in its README index                            |

New package, new node, new `agent-run` command, new ADR → the corresponding
test goes red **and tells the agent which doc to edit**.

### E. Freshness test (changed code → covering docs)

`freshness.test.ts` is the "you touched covered code; look at the doc" reminder.

1. Changed files = `git diff --name-only <base>...HEAD` ∪ working tree ∪ index.
   `<base>` = `$DOCS_BASE_REF`, else `origin/main`.
2. For each changed non-doc file, find docs whose `covers` globs match.
3. Fail if matching docs exist and **none** of them changed, unless:
    - a commit in `<base>..HEAD` has a trailer
      `Docs: none — <non-empty reason>`, or
    - the file is on the allow-list (tests, fixtures, lockfiles, generated
      output, `docs/**` itself).
4. If `<base>` is missing: **skip with a printed notice** locally;
   **fail** when `CI=true` (CI must set `DOCS_BASE_REF`).
5. Not a git checkout (tarball): skip with a notice.

It proves attention, not correctness; `docs/guides/writing-docs.md` says so.

### F. Reminder format (the point of the suite)

All findings go through `formatReminder`:

```text
DOC REMINDER [freshness]
You changed:    packages/server/src/bootstrap/skeleton.ts
Docs covering:  docs/reference/bootstrap.md (§ Skeleton seed)
                docs/product/use-cases/skeleton-seed.md
Do one of:
  1. Update the doc(s) above in this change.
  2. If behaviour and contracts are unchanged, add to the commit message:
     Docs: none — <reason>
Guide: docs/guides/writing-docs.md#freshness
```

Contract (tested in `reminder.test.ts`): every message has the rule id, the
trigger (file or fact), at least one concrete doc path, one concrete
resolution step, and a guide link. Messages never say only "failed".

### G. Agent behaviour

New always-applied rule `.cursor/rules/docs-sync.mdc`:

- Start from `docs/README.md` (router) and `DOC_MAP`; do not grep `docs/` blind.
- `_archive/`, `_work/`, `.langflower/memory/` are out of default search.
- When `tests/unit/docs-boundaries` reports a `DOC REMINDER`, treat it as a
  task: update the named doc (or add the `Docs: none — reason` trailer), then
  rerun. Do not silence a rule, narrow `covers`, or delete a doc to turn it
  green.
- Add bugs / ADRs as new files from templates; never edit generated files; run
  `docs-gen` before finishing.
- Never create `.md` directly in `docs/` root.

`AGENTS.md`: replace the 30-row doc table with a link to the router plus the
five rows an agent needs first; mention the docs-boundaries tests in the Hard
gate (they run inside `npm run test`); update "Found bugs" to the `bugs/`
template.

### H. Error handling

- Unparseable frontmatter → finding with file and line; never crash the suite.
- Missing git → git-dependent rules fall back to a filesystem walk or skip with
  a notice; the others still run.
- Windows paths: all rules normalise to `/`; case-collision check included.

## 4. Verification & Definition of Done (DoD)

### A. Testing Strategy Matrix

| Area                 | Test                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Frontmatter parser   | valid, missing key, bad enum, list values, CRLF files                                                                          |
| Each rule            | `rules.fixtures.test.ts`: temp-dir repo, one passing and one failing case per `ruleId`                                         |
| Link/anchor handling | heading-slug generation, anchors in moved files, code-comment path refs                                                        |
| ADR / bug splitter   | golden: sample monolith → files; body byte-identical; anchors preserved; slug collisions handled                               |
| `docs-gen --check`   | stale index detected; clean tree passes                                                                                        |
| `docs-sync --check`  | edited demo copy detected; sync restores                                                                                       |
| Consistency facts    | each pair: in-sync passes; add a package / node / command / ADR ref without doc → red with reminder                            |
| Freshness            | covered change without doc → red; with doc → green; `Docs: none — reason` → green; no base → skip; `CI=true` and no base → red |
| Reminder contract    | every `ruleId` produces a message with trigger, doc path, resolution, guide link                                               |
| Real repo            | all `docs-boundaries` tests green on the actual tree at close-out                                                              |

Tests are deterministic, offline, and use temp repos for git behaviour.

### B. Manual Verification Script

1. Open `docs/README.md`; for 10 sample questions ("where is the sessions
   mechanic?", "which ADR covers the bridge?", "what broke around sessions in
   October?") reach the answer in ≤ 2 clicks.
2. Touch a file under `packages/server/src/bootstrap/**` without touching docs
   → `npx vitest run tests/unit/docs-boundaries` → red with a `DOC REMINDER`
   naming the covering docs. Add `Docs: none — test` to a throwaway commit →
   green.
3. Add a new `agent-run` command key without documenting it → red naming the
   skill doc to edit.
4. Edit a file under `demo-project/.langflower/skills/langflower-helper/` → red
   on `sync`; `docs-sync` fixes it.
5. Add a new bug through the template → red on `generated`; `docs-gen` fixes
   it.
6. In a fresh agent chat, change covered code and run the unit tests; confirm
   the agent follows the reminder instead of editing the test.

### C. Functional Requirements Checklist

Each step has acceptance criteria; a step is done only when all its boxes hold.

**Step 1 — Inventory and classification**

- [ ] Every tracked `.md` (excluding `node_modules`, fixtures) is classified in
      a temporary inventory table: `path → layer, kind, owner, covers, action
(move | split | merge | delete | keep)`.
- [ ] Overlap clusters resolved with a written decision each:
      `NODES` / `REACTIVE_NODES` / `LLM_NODES` / `HOW_TO_WRITE_REACTIVE_NODES`;
      `TODO.md` vs `TODO/`; `packages/ui/docs/*` vs `NG_DIAGRAM`;
      `packages/runtime/{ADR,FOUND_BUGS,spec}.md` vs central docs.
- [ ] Provably dead docs are listed with proof (`docs/_work/TODO/README.md` is an old
      snapshot-split plan; `TO_REVIEW.md` links a missing
      `TODO/runtime-refactor.md`). Deletion is the default for dead docs.
- [ ] Docs over 40 KB (besides the two monoliths) each have a split plan.
- [ ] The user reviews the inventory before Step 4 starts.

**Step 2 — Taxonomy, router, frontmatter schema**

- [ ] `docs/README.md` exists with: layer map, placement rules, ≥ 20
      question→doc routes, package-local registry markers, a note on what the
      tests do and do not prove.
- [ ] `docs/guides/writing-docs.md` documents the frontmatter schema, copy-paste
      templates (feature, use-case, reference, guide, ADR, bug), the
      `Docs: none — reason` trailer, and a `#freshness` section that the
      reminder messages link to.
- [ ] Layer matrix and fact pairs are drafted as data (`layer-rules.ts`,
      `consistency-facts.ts`) and reviewed against the router.

**Step 3 — Test infrastructure (red first)**

- [ ] `tests/unit/docs-boundaries/` has `scan.ts`, `reminder.ts`,
      `layer-rules.ts`, `consistency-facts.ts`, rule modules, and the test files
      in § 3.B.
- [ ] `build/docs-gen.mjs` and `build/docs-sync.mjs` exist with `--check`;
      registered in `agent-run.mjs`, `package.json` scripts, help text.
- [ ] Fixture tests cover every `ruleId`; `reminder.test.ts` enforces the
      message contract.
- [ ] Confirmed: the unit project config picks the new tests up; `verify
--quick` and `npm run test` both run them.
- [ ] `check-doc-links-temp.mjs` and `move-architecture-docs.mjs` deleted.
- [ ] On the **unreorganised** tree the suite is red with readable reminders
      (proves it detects the current mess; keep a recorded run for the PR).

**Step 4 — Move and rewrite**

- [ ] Moves done with `git mv` per the map; history follows (`git log
--follow` works on a sampled file).
- [ ] All inbound links rewritten in `.md`, `.ts` comments, `NODE.md`, package
      READMEs/AGENTS, `.cursor/**`, `package.json` (`files`), CI workflows,
      skeleton skills.
- [ ] No `.md` directly under `docs/` except `README.md`.
- [ ] `docs/public` and `docs/img` live under `docs/assets/`; `npm pack
--dry-run` still ships the public assets.
- [ ] `links`, `code-refs`, `placement` are green on the real repo.

**Step 5 — Split monoliths**

- [ ] `docs/adr/` has one file per ADR (42 + the runtime ADR as a new numbered
      ADR with `package: runtime`); numbering preserved; supersede links kept.
- [ ] `docs/bugs/` has one file per bug (117 + 6 runtime); `bugs/README.md`
      lists all with date, title, package, flaw tag, fixed state, and a by-flaw
      grouping.
- [ ] Bodies are byte-identical to the originals (golden diff in the PR).
- [ ] `NAVIGATION.md` and `STATUS.md` split by package/area; each part ≤ 40 KB;
      the parent keeps a short index.
- [ ] Old `ADR.md`, `FOUND_BUGS.md`, `packages/runtime/{ADR,FOUND_BUGS}.md`
      deleted; no inbound link to them remains.
- [ ] The old "When to log" / entry-template rules live in
      `guides/writing-docs.md` and `bugs/README.md`.
- [ ] `generated`, `size`, `consistency:adr-refs` are green.

**Step 6 — Archive and working docs**

- [ ] `DONE/`, `code-regression/`, `agent-honesty-probe/` under `_archive/`;
      `TODO/`, `WIP/`, `TO_REVIEW`, `TBD` under `_work/` (dead docs from Step 1
      deleted instead).
- [ ] `.cursorignore` excludes `docs/_archive/`; `docs-sync.mdc` tells agents to
      ignore `_archive/`, `_work/`, `.langflower/memory/`.
- [ ] Skills that read these locations are updated:
      `langflower-dev-orchestrator`, `langflower-code-regression`,
      `langflower-docs-*` (epic queue path, report path, README links).
- [ ] `link-direction` and `consistency:epic-index` are green.

**Step 7 — Single source of truth for duplicated knowledge**

- [ ] Skeleton `packages/server/skeleton/skills/**` declared source for
      bootstrap skills; `demo-project/.langflower/skills/**` and
      `.langflower/skills/**` copies are produced by `docs-sync`.
- [ ] `sync` test is green; a fixture test proves a drifted copy turns it red.
- [ ] `.langflower/memory/**` untracked (`git rm --cached`) and added to
      `.gitignore`; nothing references it as documentation.
- [ ] `langflower-helper` KB facts match the new layout (paths, Can/Cannot
      aligned with use-cases); `.cursor/skills` link into `docs/` instead of
      restating doc content.

**Step 8 — Consistency facts, freshness, agent rules**

- [ ] `covers` populated for every `architecture/`, `reference/` and `guides/`
      doc (empty list only for pure product/process docs); `DOC_MAP.md`
      generated.
- [ ] All § 3.D fact pairs implemented, each with a fixture test and a
      reminder naming the exact doc to edit.
- [ ] `freshness.test.ts` behaves per § 3.E, including `CI=true` without a base
      ref, and the `Docs: none — reason` trailer.
- [ ] `.cursor/rules/docs-sync.mdc` added; `AGENTS.md` rewired (router link,
      docs-boundaries in Hard gate, Found-bugs / ADR sections point at new
      templates); package `AGENTS.md` links fixed.
- [ ] CI sets `DOCS_BASE_REF` for the unit run.

**Step 9 — Close-out**

- [ ] `npx vitest run tests/unit/docs-boundaries` is green; warnings (size)
      reviewed.
- [ ] `dead-code` → findings deleted → `check-exports`.
- [ ] Epic file moved to `_archive/` epics; indexes updated; GLOSSARY / STATUS
      notes updated if product-visible facts changed (none expected).
- [ ] Manual verification script (§ 4.B) executed and recorded in the PR
      description.

### Risks and mitigations

| Risk                                                | Mitigation                                                                                                          |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Huge diff hides content changes                     | One commit per step; moves and content edits never share a commit; golden diff for splits                           |
| Broken inbound links from code or CI                | `code-refs` rule + grep of `.github/**` before Step 4; scripted rewrite                                             |
| Agents "fix" a red docs test by weakening it        | `docs-sync.mdc` forbids it; rule data (`layer-rules.ts`, `covers`) is reviewed like `allowed-edges.ts`              |
| Freshness test is red mid-task and annoys iteration | Message says how to resolve; `Docs: none — reason`; allow-list for tests/fixtures; skips without a base ref locally |
| Freshness hides behind a trailer used lazily        | Reason must be non-empty; trailers are visible in `git log`; revisit if abused                                      |
| `covers` globs rot                                  | `frontmatter` rule fails dead globs                                                                                 |
| Generated indexes forgotten in PRs                  | `generated` test fails; `docs-gen` is in the agent finish checklist                                                 |
| Agents keep opening old paths from memory           | Old paths are deleted (no stubs); rule + router make the new entry explicit                                         |
| npm package loses public assets after move          | `npm pack --dry-run` check in Step 4                                                                                |

### Verify

- Intermediate (optional): `npx vitest run tests/unit/docs-boundaries`,
  `node build/tools/agent-run.mjs docs-gen --check`, `docs-sync --check`,
  `verify --quick`.
- **Close-out (required):** `npm run typecheck` (or
  `node build/tools/agent-run.mjs typecheck`) **and** `npm run test` (or full
  `node build/tools/agent-run.mjs verify`, which runs the docs-boundaries
  tests inside the unit step). Do not mark done on `--quick` or on tests
  without typecheck. Bootstrap / skeleton tests stay green because skill text
  changed.
