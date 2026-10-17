---
kind: use-case
owner: docs
covers: []
status: current
---

# Skeleton (packaged seed & catalog)

**Status:** Ready — seed source of truth is
`packages/server/skeleton/`. First-run copies it; Settings → Bootstrap
force-reseeds templates without rewriting `langflower.jsonc`. A top-level
`dist/skeleton/` is not required. The sample-workflows catalog UI is an
optional tail, not this bar.

## Value

Ship a **packaged `skeleton/`** in the product dist that is the single source of
truth for what Langflower seeds into a project: langflower config, sample
workflows, a custom-node authoring instructions file, and sample tools/custom
nodes. On first need (no `.langflower/`) the product copies the **full**
skeleton; operators refresh outdated templates via Settings → Bootstrap without
rewriting `langflower.jsonc`. This is **not**
[bootstrap-new-project](bootstrap-new-project.md) — bootstrap owns _when_
first-run / force reseed runs; skeleton owns _what_ ships in dist.

## UX scenarios

### S1 — Dist ships `skeleton/`

**Who:** Packager / installer consumer of a Langflower release (or local
install that mirrors dist layout).

**Want:** A predictable folder named `skeleton` inside dist that contains
everything the product may later seed or offer — not ad-hoc paths under
server or demo-project code.

**Do:** Inspect the installed / released package layout for a top-level
`skeleton/` (relative to the product dist root).

**Expect:**

- Dist MUST include a folder named `skeleton`.
- That folder MUST contain: langflower config, sample workflows (including the
  coding seed file under id `basic-coder` owned by
  [bootstrap-new-project](bootstrap-new-project.md)), a custom-node authoring
  instructions file, and sample tools/custom nodes.
- Packaged `skeleton/` MUST be the source of truth for seed and catalog
  content — MUST NOT treat unrelated demo-project or in-server paths as the
  product catalog of record.

### S2 — Full first-run seed from skeleton

**Who:** Developer on an empty / unconfigured folder (first-run timing owned
by [bootstrap-new-project](bootstrap-new-project.md)).

**Want:** A complete starter project with onboarding and coding samples.

**Do:** Run `langflower start` (or the documented first-run path in
[getting-started](../features/getting-started.md)) on that folder.

**Expect:**

- Seed MUST copy the **full** packaged `skeleton/` tree (in-repo /
  package-shipped:
  [`packages/server/skeleton/`](../../../packages/server/skeleton)): langflower
  config (create-if-missing) + **all** `workflows/*.json` + **all** skills +
  sample custom-node package (`nodes/my-nodes/`) + the custom-node authoring
  instructions file.
- Default / open workflow MUST be **`starter`**
  (chat + agent with skill `langflower-helper` — see
  [bootstrap-new-project](bootstrap-new-project.md) S1).
- Skills seeded include at least `langflower-helper`, `langflower-node-writer`,
  `langflower-workflow-writer`, `spec-architect`.
- Sample custom-node pack contract: [ADR-030](../../adr/030-custom-node-pack-layout-and-npm-model.md).
- Content MUST come from the skeleton tree above, not from a parallel
  undocumented seed tree. Bootstrap MUST NOT auto-run `npm install` in the pack.

### S3 — Existing project: no silent wipe; explicit force reseed

**Who:** Developer with an existing Langflower project (`.langflower/` already
present).

**Want:** Local work preserved on start; optional refresh of packaged templates
after upgrading Langflower.

**Do:** Run `langflower start` on that folder; optionally open Settings →
Bootstrap to force-reseed templates.

**Expect:**

- CLI start MUST NOT wipe or overwrite existing project workflows / config when
  `.langflower/` already exists.
- Explicit Settings → Bootstrap MUST force-overwrite skeleton-owned templates
  and MUST NOT rewrite `langflower.jsonc` — see
  [bootstrap-new-project](bootstrap-new-project.md) S5.
- Optional catalog browse/copy UI (S4) remains backlog; it MUST NOT compete with
  the force-reseed path.

### S4 — Catalog: browse and copy predefined workflows

**Who:** Developer who wants another packaged sample after the minimal seed
(or on an existing project).

**Want:** See what each predefined workflow is for, get help, then copy only
what they choose into the project folder.

**Do:** Open the skeleton / samples catalog UI; read descriptions and help;
select one or more predefined workflows; confirm copy into the project.

**Expect:**

- UI MUST list predefined workflows from packaged `skeleton/` with
  descriptions and help (not bare filenames only).
- User MUST be able to copy a selected workflow into the project folder.
- Copy MUST be additive and explicit — MUST NOT silently overwrite a
  same-id workflow already in the project; on id conflict the catalog UX MUST
  offer an explicit choice (rename / skip / confirm). Conflict UX details live
  in [skeleton](../features/skeleton.md).

## UI specs

| Spec                                                                                | Scenarios covered                                                                                                                                                                      |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [skeleton.md](../features/skeleton.md)                                              | [S2](#s2--full-first-run-seed-from-skeleton), [S3](#s3--existing-project-no-silent-wipe-explicit-force-reseed), [S4](./skeleton.md) — UX parts; **not** [S1](#s1--dist-ships-skeleton) |
| [getting-started.md](../features/getting-started.md) _(target / timing-entry only)_ | [S2](#s2--full-first-run-seed-from-skeleton), [S3](#s3--existing-project-no-silent-wipe-explicit-force-reseed) — first-run / start entry points                                        |
| [settings-panel.md](../features/settings-panel.md)                                  | [S3](#s3--existing-project-no-silent-wipe-explicit-force-reseed) — Settings → Bootstrap force reseed                                                                                   |
| [workflow-management.md](../features/workflow-management.md)                        | [S4](./skeleton.md) — optional selective import (backlog)                                                                                                                              |

## Runtime requirements

Acid test: without packaged `dist/skeleton/` → [S1](#s1--dist-ships-skeleton) /
[S2](#s2--full-first-run-seed-from-skeleton) die; without Settings Bootstrap →
force reseed half of [S3](#s3--existing-project-no-silent-wipe-explicit-force-reseed)
dies; without catalog UI → [S4](./skeleton.md) dies.

| Need                                                                             | Why (scenario)                                                                                             | Today                                                                   | Caution                                                     |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------- |
| Packaged `dist/skeleton/` as seed + catalog source of truth                      | What ships ([S1](#s1--dist-ships-skeleton))                                                                | Partial — in-repo / package `skeleton/` SoT; top-level dist layout open | MUST NOT invent a second catalog root once packaging exists |
| Full skeleton seed (config + all workflows + skills + instructions + `my-nodes`) | First need ([S2](#s2--full-first-run-seed-from-skeleton))                                                  | Landed                                                                  | CLI only when `.langflower/` missing                        |
| No silent wipe on existing projects; force reseed via Settings                   | Preserve local work / upgrade templates ([S3](#s3--existing-project-no-silent-wipe-explicit-force-reseed)) | Landed for CLI skip + Settings Bootstrap                                | MUST NOT rewrite `langflower.jsonc` on force                |
| Catalog listing + selective copy into project                                    | Explicit extras (optional; not the seed bar)                                                               | Optional — not shipped; does not block the seed                         | Prefer UI over new server surface if it is built later      |
| Same-id copy conflict surfaced in catalog UX                                     | No silent overwrite (optional catalog)                                                                     | Optional — not shipped                                                  | MUST NOT silently overwrite if a catalog is added           |

## Status

**Ready.** The seed source of truth is
[`packages/server/skeleton/`](../../../packages/server/skeleton), copied on
first-run, with Settings force reseed. The old S1 requirement of a top-level
`dist/skeleton/` is withdrawn. The sample-workflows catalog (former S4) is
optional and not shipped; it does not hold this status.

### Missing parts

None for the seed. The catalog UI (browse, help, selective copy, same-id
conflict) remains an optional tail, not a Missing part of the seed.

### Workarounds

- First-run full seed from `packages/server/skeleton/`.
- After upgrade: Settings → Project → Bootstrap.
- No product catalog UI for selective sample import yet (full seed covers most needs).

### Demo / CI

- First-run copy and Settings Bootstrap are the seed. There is no
  `dist/skeleton/` gate.
- Related behaviour: [bootstrap-new-project](bootstrap-new-project.md) and
  [getting-started](../features/getting-started.md).
