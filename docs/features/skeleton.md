# Skeleton (seed & sample catalog)

## Goal

Give the user a **minimal first-run seed** and a separate **Sample workflows**
catalog to browse and import predefined workflows — with descriptions, help,
and explicit same-id conflict handling — without dumping the full sample set
into every project. **Draft today:** packaging and catalog UI are not landed;
validate against [skeleton](../use-cases/skeleton.md) (S2–S4).

## Core Principles

- **Minimum on first need, catalog for the rest** — first open MUST NOT
  auto-copy every predefined workflow; extras require explicit catalog
  choice. Minimum content MUST match use-case S2 (config + `starter` +
  instructions + two skills + one custom-node package).
- **No silent wipe/replace** — offering samples MUST NOT wipe or silently
  replace project workflows / config. The only destructive same-id path MUST
  be **Confirm** after an explicit user choice; wipe / full re-seed MUST NOT
  exist on this surface.
- **Catalog browse, help, and import** — the user MUST be able to browse
  packaged predefined workflows with descriptions and help, then **import
  sample** into the project (not the in-project topbar Copy `{id}-copy`
  flow).
- **No silent same-id overwrite** — catalog import MUST offer rename / skip /
  confirm on id conflict before any overwrite.
- **Peers own timing and packaging** — when first-run runs:
  [getting-started](getting-started.md) /
  [bootstrap-new-project](../use-cases/bootstrap-new-project.md). Dist
  `skeleton/` layout: use-case S1 (not a UI promise here). In-project
  library CRUD: [workflow-management](workflow-management.md). This feature
  owns seed _content_ contract + catalog browse / help / conflict UX.

## Feature Details

### What this is / is not

| This feature owns                                               | Owned elsewhere                                                                                                                                |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Minimal seed _content_ contract (what appears)                  | First-run / start _trigger and timing_ — [getting-started](getting-started.md), [bootstrap-new-project](../use-cases/bootstrap-new-project.md) |
| Catalog browse, descriptions, help, selective **import sample** | In-project workflow create / save / rename / delete / topbar Copy — [workflow-management](workflow-management.md)                              |
| Same-id conflict UX on catalog → project import                 | Dist packaging / packager layout — [skeleton](../use-cases/skeleton.md) S1 (not this UI surface)                                               |

MUST NOT claim bootstrap timing, full workflow-library CRUD, packaging layout,
or a wipe / full re-seed path for existing projects.

**Catalog naming:** the toolbar **project workflow catalog** (saved workflows
in the current project — [workflow-management](workflow-management.md)) MUST
NOT be treated as the same surface as this feature’s **Sample workflows**
skeleton catalog. Peer note: workflow-management’s “Sample workflows”
paragraph today describes auto-seeded samples already in the project catalog;
that paragraph MUST be updated when this lands so auto-seeded minimum vs
extras-via-catalog stay distinct.

### Full first-run seed (user-visible)

On first need (no `.langflower/`; **trigger/timing owned by peers**),
the user MUST receive a **full** skeleton seed matching use-case S2:

| Included on first-run                       | Notes                                                                                                                                                                                                    |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Langflower project config                   | Defaults only; MUST NOT invent provider secrets                                                                                                                                                          |
| **All** skeleton workflows                  | Including onboarding **`starter`** (default open) plus `simple-coder`, `advanced-coder`, `node-writer`, `agents-dialog`, `kb-create`, `kb-navigate`, …                                                   |
| Onboarding **skills**                       | At least `langflower-helper`, `langflower-node-writer` under `.langflower/skills/`                                                                                                                       |
| Custom-node authoring **instructions file** | `.langflower/instructions.md`                                                                                                                                                                            |
| **One** sample custom-node package          | Default pack id **`my-nodes`** — source: [`packages/server/skeleton/nodes/my-nodes/`](../../packages/server/skeleton/nodes/my-nodes/) ([ADR-030](../ADR.md#adr-030--custom-node-pack-layout--npm-model)) |

Getting-started / bootstrap own _when_ and the CLI path; this spec owns
_what_ appears. Existing projects refresh templates via Settings → Bootstrap
(force seed; never rewrites `langflower.jsonc`).

### Catalog view

**v1 entry point (MUST):** a toolbar / library-adjacent control labeled
**Sample workflows** opens the skeleton samples catalog.

The user opens **Sample workflows** to:

- **Browse** predefined workflows shipped with the product skeleton.
- See **descriptions** and **help** for each entry — MUST NOT list bare
  filenames only.
- Select one or more workflows to **import sample** into the current project.

Catalog listing MUST reflect packaged skeleton predefined workflows (source
of truth per use-case). Entries the user already has locally remain visible
as catalog samples; presence in the project does not remove them from the
catalog browse list (**Draft:** whether to badge “already in project” is
open for v1 — see Draft gaps).

### Import sample into project

After selection, the user confirms import. Import MUST be:

- **Explicit** — user chooses what to add; no background full-skeleton dump.
- **Additive** — new workflows appear in the project library without removing
  unrelated existing workflows.
- **Import sample** from the skeleton catalog — MUST NOT be the topbar
  in-project Copy that produces `{id}-copy`. Low-level workflow write may be
  shared with workflow-management after selection; browse / help / conflict UX
  stay here. MUST NOT claim that catalog browse is covered by the existing
  copy API.

### Same-id conflict UX

If a selected sample’s workflow id already exists in the project, the catalog
UX MUST NOT silently overwrite that workflow. The user MUST get an explicit
choice:

| Choice      | Effect                                                                                        |
| ----------- | --------------------------------------------------------------------------------------------- |
| **Rename**  | Import under a new id / name so both the existing workflow and the sample land in the project |
| **Skip**    | Leave the existing workflow untouched; do not import this sample                              |
| **Confirm** | Explicitly overwrite the existing same-id workflow after the user confirms                    |

Multi-select with mixed conflicts:

- Each conflicting id MUST be resolved (rename / skip / confirm) before any
  overwrite of that id.
- Non-conflicting selections MUST wait until the conflict-resolution flow
  closes, then import together with the resolved choices — MUST NOT copy
  non-conflicts immediately while conflicts are still open.

### Existing project

When the project already has Langflower project data:

- Product MUST NOT wipe or overwrite existing workflows / config merely by
  starting Langflower.
- Explicit Settings → Bootstrap MAY force-overwrite skeleton-owned templates
  without rewriting `langflower.jsonc`.
- Optional selective catalog import (S4) remains backlog and MUST NOT silently
  overwrite same-id workflows.

### States (ownership labeled)

| State                                     | User sees                                                                        | Ownership                                                  |
| ----------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| First-run complete (full skeleton seeded) | Project has config + all skeleton workflows + skills + instructions + `my-nodes` | **Content contract** — this spec; **when** it runs — peers |
| Catalog open                              | List of predefined workflows with description / help; select + import sample     | This spec (UI); **packaging** of the list — use-case S1    |
| Import in progress                        | Progress / busy affordance (**Draft**)                                           | This spec                                                  |
| Import conflict                           | Rename / skip / confirm choice — no silent overwrite                             | This spec                                                  |
| Import done                               | Selected samples present in project library; catalog remains available           | This spec                                                  |
| Existing project, catalog unused          | Prior work intact; no automatic extra samples                                    | Content: this spec; start/reuse timing: peers              |

### Draft gaps

| Gap                                                    | Done when                                                                                                                                                                                  |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| v1 catalog entry point                                 | Toolbar / library-adjacent **Sample workflows** is the shipped entry; alternate placements (empty-state CTA, etc.) deferred or documented as open questions in Implementation Details only |
| Conflict resolution (rename / skip / confirm)          | Each conflicting id must be resolved before overwrite; non-conflicts wait until conflict flow closes, then import with resolved choices                                                    |
| First-run full skeleton content                        | Matches use-case S2: config + all workflows + skills + instructions + `my-nodes`                                                                                                           |
| “Already in project” badge                             | Explicit yes or no for v1 (browse list still shows samples either way)                                                                                                                     |
| Peer: workflow-management “Sample workflows” paragraph | Updated so toolbar project catalog ≠ this skeleton **Sample workflows** catalog; auto-seeded minimum vs extras-via-catalog are distinct                                                    |
| Packaging layout (dist `skeleton/`)                    | **Not** a Done when of this UI spec — owned by use-case S1                                                                                                                                 |

## Implementation Details

**Status: Partial** — in-repo
[`packages/server/skeleton/`](../../packages/server/skeleton/) is the seed
source of truth and is copied on first-run (epic 33). Packaged top-level
`dist/skeleton/` (S1) and **Sample workflows** catalog UI (S3–S4) are not
landed. Validate catalog UX against [skeleton](../use-cases/skeleton.md)
S3–S4; packaging layout bar is use-case S1.

### Today (honest)

- First-run bootstrap copies **all** `workflows/*.json` from
  `packages/server/skeleton/` via
  `packages/server/src/bootstrap/project-bootstrap.service.ts`
  (including `starter`, coding samples, `kb-create`, `kb-navigate`) plus
  skills + instructions + `my-nodes`. Sample workflows **catalog UI** is
  still not shipped.
- `@langflower/server` ships `skeleton/` in package `files` (same layout as
  future `dist/skeleton/`).
- In-project workflow write after a future catalog import may reuse low-level
  write in `packages/server/src/workflow/workflow.service.ts` — **not** the
  topbar Copy `{id}-copy` product flow. **No new catalog protocol is invented
  here.**

### Catalog list source

| Need                                                      | Today   | Done when                                                                                                                                                                 |
| --------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| List predefined workflows for **Sample workflows** browse | Missing | UI reads packaged skeleton (or a named consumer of that package) and shows description / help per entry — not bare filenames and not “covered by” the in-project copy API |

### Open questions (not equal v1 Feature Details options)

- Alternate chrome placements (empty-state CTA, other library slots) beyond the
  MUST **Sample workflows** toolbar / library-adjacent entry.
- Whether v1 badges catalog rows that are already in the project.

### Target (not landed — do not treat as shipped)

| Need                                | Notes                                                                                                    |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Release layout includes `skeleton/` | Config, sample workflows (incl. `starter` + catalog ids), skills, instructions, `my-nodes` — use-case S1 |
| Minimal seed consumer               | Bootstrap / getting-started consume only the minimum from that folder                                    |
| Catalog UI                          | **Sample workflows** browse + descriptions/help + selective import sample + rename/skip/confirm conflict |
| Prefer UI over new server surface   | Reuse low-level workflow write if present; no speculative protocol; browse is a separate Missing bar     |

### Related docs

- Validating use-case: [skeleton](../use-cases/skeleton.md)
- Timing / first-run: [getting-started](getting-started.md),
  [bootstrap-new-project](../use-cases/bootstrap-new-project.md)
- In-project library after selection: [workflow-management](workflow-management.md)
  (update Sample workflows paragraph when this lands)
- Startup / layout (when packaging lands): [ARCHITECTURE](../ARCHITECTURE.md),
  [PRODUCT](../PRODUCT.md)

### Demo / CI

None for packaged skeleton or catalog UX — do not claim gates that do not
exist.
