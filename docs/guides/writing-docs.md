---
kind: guide
owner: docs
covers:
    - 'tests/unit/docs-boundaries/**'
status: current
---

# Writing docs

How to place a doc, fill its frontmatter, and answer the freshness reminder.
English only.

## Frontmatter

Every non-generated doc under `docs/`, and every registered package-local doc,
starts with flat YAML. Archive docs under `docs/_archive/` and generated files
are exempt (see [Exemptions](#exemptions)).

Required keys: `kind`, `owner`, `covers`, `status`.

```yaml
---
kind: reference
owner: server
covers:
    - 'packages/server/src/sessions/**'
status: current
---
```

### `kind`

One of:

`product` | `architecture` | `reference` | `guide` | `adr` | `bug` |
`feature` | `use-case` | `index` | `work` | `asset`

`work` and `asset` exist so `docs/_work/` and `docs/assets/**/*.md` can pass
placement. The directory name `guides/` uses kind `guide`.

### `owner`

One of:

`server` | `ui` | `runtime` | `shared` | `node-sdk` | `tools` |
`common-nodes` | `compiler` | `eval` | `mcp` | `cli` | `launcher` |
`websocket-bridge` | `docs`

Use `docs` when the page is cross-cutting. Use `mcp` for the Langflower MCP
package (`packages/langflower-mcp`).

### `covers`

A list of glob strings. Each glob must match at least one tracked file.
`[]` is allowed only for a pure product or process doc that describes no code
(this router, a glossary, a planning note). A feature, reference, guide, ADR,
or bug that describes code names the code.

### `status`

`current` | `draft` | `superseded`

### ADR fields

ADR files also set:

| Key             | Value                                                        |
| --------------- | ------------------------------------------------------------ |
| `id`            | `ADR-NNN`                                                    |
| `supersedes`    | List of ADR ids this decision replaces. `[]` when none.      |
| `superseded-by` | List of ADR ids that replace this one. `[]` while current.   |
| `package`       | An `owner` value. `docs` when the decision is cross-cutting. |

### Bug fields

Bug files also set:

| Key       | Value                                                               |
| --------- | ------------------------------------------------------------------- |
| `date`    | `YYYY-MM-DD`                                                        |
| `flaw`    | Short design-flaw tag (state ownership, lifecycle, concurrency, …). |
| `package` | An `owner` value.                                                   |
| `fixed`   | `yes` \| `no` \| `deferred`                                         |

## Templates

Copy one block into a new file. Replace the placeholders.

### Feature

```yaml
---
kind: feature
owner: ui
covers:
    - 'packages/ui/src/app/features/<feature>/**'
status: current
---
```

```markdown
# Feature name

## Goal

One to three sentences: what the person building a workflow gets.

## Core Principles

- What must stay true regardless of implementation.

## Feature Details

What the user sees and does. Flows, states, edge cases. No file paths.

## Implementation Details

Where it lives in code, and links to the reference or architecture doc.
```

Lives at `docs/product/features/<name>.md`.

### Use-case

```yaml
---
kind: use-case
owner: docs
covers: []
status: current
---
```

`covers: []` fits a scenario that states product value only. Name code globs
when the scenario's runtime section describes specific modules.

```markdown
# Scenario name

**Status:** Draft | Partial | Available | Ready | Blocked

## Value

What the client gets. One clause for the neighbouring scenario this is not.

## UX scenarios

### S1 — short name

**Who:**
**Want:**
**Do:**
**Expect:**

## UI specs

| Feature doc | Scenarios |
| ----------- | --------- |
|             | S1        |

## Runtime requirements

| Need | Scenario that dies without it |
| ---- | ----------------------------- |

## Status

Missing parts, citing `Sn` and `UI` or `Runtime`.
```

Lives at `docs/product/use-cases/<name>.md`.

### Reference

```yaml
---
kind: reference
owner: server
covers:
    - 'packages/server/src/<subsystem>/**'
status: current
---
```

```markdown
# Subsystem name

How the subsystem works: files, contracts, and the rules a caller can rely on.

## Contract

## Mechanics

## Related

- Architecture decision or principle that constrains this subsystem.
```

Lives at `docs/reference/<NAME>.md`.

### Guide

```yaml
---
kind: guide
owner: docs
covers:
    - 'path/the/procedure/touches/**'
status: current
---
```

```markdown
# How to <task>

## When

## Steps

1. First concrete step.

## Done when

## See also
```

Lives at `docs/guides/<name>.md`.

### ADR

```yaml
---
kind: adr
owner: docs
covers:
    - 'packages/<dir>/src/**'
status: current
id: ADR-NNN
supersedes: []
superseded-by: []
package: docs
---
```

```markdown
# ADR-NNN — Short title

**Status:** proposed · **Date:** YYYY-MM-DD

**Context:** What problem or constraint forced a choice? (2–4 sentences)

**Alternatives considered:** At least two real options. One line each on why
it was rejected or deferred.

**Decision:** What we chose.

**Tradeoffs accepted:** Explicit gains and costs. This section is required.

**Consequences:** Code paths, docs, migrations, and the revisit trigger.
```

File: `docs/adr/NNN-slug.md`. Supersede an old ADR by setting its
`superseded-by` and `status: superseded`. Keep the old file.

Before filing: a competent reader would ask why the obvious default was
rejected; the alternatives are plausible here; the downsides are stated; a
revisit trigger is named.

### Bug

Log a bug when a report was reproduced, the root cause was non-obvious, or the
bug shows a design assumption that was wrong. Add it in the same change as the
fix, or as soon as the repro exists when the fix is deferred.

```yaml
---
kind: bug
owner: server
covers:
    - 'packages/server/src/<area>/**'
status: current
date: YYYY-MM-DD
flaw: state-ownership
package: server
fixed: yes
---
```

```markdown
# BUG-YYYY-MM-DD — short title

| Field               | Value                                     |
| ------------------- | ----------------------------------------- |
| **Date**            | YYYY-MM-DD                                |
| **Area**            | execution · ui · server · shared · canvas |
| **Symptom**         | What the user saw                         |
| **Repro**           | Minimal steps                             |
| **Root cause**      | Technical why                             |
| **Fix**             | Files or behaviour change                 |
| **Design flaw**     | What the architecture got wrong           |
| **Regression test** | Test path, or `none` plus a reason        |
```

`fixed: yes` matches a landed fix, `no` an open repro, `deferred` a known repro
whose fix is postponed. File name: `BUG-YYYY-MM-DD-slug.md` in `docs/bugs/` (a same-day
suffix becomes `BUG-YYYY-MM-DDx-slug.md`). The index is
[`docs/bugs/README.md`](../bugs/README.md).

## Placement

| Kind           | Directory                                   |
| -------------- | ------------------------------------------- |
| `product`      | `docs/product/`                             |
| `feature`      | `docs/product/features/`                    |
| `use-case`     | `docs/product/use-cases/`                   |
| `architecture` | `docs/architecture/` (UI notes under `ui/`) |
| `reference`    | `docs/reference/`                           |
| `guide`        | `docs/guides/`                              |
| `adr`          | `docs/adr/`                                 |
| `bug`          | `docs/bugs/`                                |
| `work`         | `docs/_work/`                               |
| `asset`        | `docs/assets/`                              |
| `index`        | `docs/README.md` or a layer `README.md`     |

Locked homes that the layer names alone do not spell out:

- `REACTIVE_NODES.md`, `NODES.md`, `LLM_NODES.md`, `LANGFLOWER_MCP.md` →
  `docs/reference/`.
- `HOW_TO_WRITE_REACTIVE_NODES.md` → `docs/guides/how-to-write-reactive-nodes.md`.
- `REFACTORING.md` → `docs/guides/REFACTORING.md`.
- The ngDiagram timing note → `docs/architecture/ui/NG_DIAGRAM.md`. The canvas
  guide stays at `packages/ui/docs/DIAGRAM_CANVAS.md`.
- `packages/runtime/spec.md` stays beside the runtime package.
- Package `ADR.md` / `FOUND_BUGS.md` merge into `docs/adr/` and `docs/bugs/`
  in the split step, with `package` set.
- `docs/assets/**/*.md` uses kind `asset` (or `index` for an assets README).
- Queued and in-flight notes (`TODO/`, `WIP/`, `TO_REVIEW`, `TBD`) use kind
  `work` or `index` under `docs/_work/`.
- History (`DONE/`, `code-regression/`, `agent-honesty-probe/`) moves under
  `docs/_archive/` and does not take frontmatter.

Only `docs/README.md` may be a markdown file directly in `docs/`. Package-local
docs are not placed by this table. They keep their path, use the same required
keys, and are listed in the router registry.

## Freshness

<a id="freshness"></a>

Changing code that a doc's `covers` globs match, without changing one of those
docs, fails the freshness test. The failure names the changed file and the
covering docs.

To acknowledge that behaviour and contracts are unchanged, put this trailer on
a commit in the range under test. The dash is an em dash, and the reason is
non-empty:

```text
Docs: none — <non-empty reason>
```

The tests prove attention. They prove that a covering doc was updated, or that
a reason was written down. They do not prove the prose is correct.

Details of the git range, the allow-list, and the missing-base behaviour live
with the freshness rule. The reminder text always points back to this section.

## Boundary failures

| Condition                                                                 | Rule             |
| ------------------------------------------------------------------------- | ---------------- |
| A doc under `docs/` is not linked from this router or a layer index       | `reachable`      |
| `kind` does not match the directory in the placement table                | `placement`      |
| Frontmatter is missing, or a required key is absent or invalid            | `frontmatter`    |
| A `covers` glob matches no tracked file                                   | `frontmatter`    |
| `product/`, `architecture/`, `reference/`, or `guides/` links to `_work/` | `link-direction` |
| A file outside the archive exception list links into `_archive/`          | `link-direction` |

`reachable` ignores `docs/_archive/` and generated files. `placement` also
fails when a markdown file sits directly in `docs/` other than `docs/README.md`.

The archive exception list is `docs/README.md` and
`docs/_work/TODO/README.md`. DONE lives inside `docs/_archive/`, so that
tree may link to itself.
A file that already lives under `docs/_archive/` may link to another archive
file.

## Exemptions

<a id="exemptions"></a>

These skip frontmatter:

- Anything under `docs/_archive/`.
- Generated files. They start with
  `<!-- generated by docs-gen; do not edit -->`.
  That includes `docs/adr/README.md`, `docs/bugs/README.md`,
  `docs/architecture/DOC_MAP.md`, and the package-local registry block in
  `docs/README.md`.
