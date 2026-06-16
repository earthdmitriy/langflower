# Bootstrap new project

**Status:** Partial — CLI first-run seeds the full skeleton when `.langflower`
is missing; Settings → Bootstrap force-reseeds templates without touching
`langflower.jsonc`. Fail-closed empty-provider path is still open.

## Value

Get from an **empty or unconfigured folder** to a Langflower project that can
answer “how do I start?” and later run coding workflows after the user sets an
LLM provider — without manual server setup or cloud accounts. This is
**product bootstrap** (first-run + explicit reseed), not an agent graph; coding
graph scenarios start at [coding-agent](coding-agent.md) / skeleton
`simple-coder` / `advanced-coder`. Packaged seed content lives in
[skeleton](skeleton.md) — bootstrap owns _when_ first-run / force reseed runs;
skeleton owns _what_ ships.

## UX scenarios

### S1 — First-run bootstrap from CLI

**Who:** Developer with an empty or unconfigured folder (no `.langflower/`).

**Want:** One local command that scaffolds project data and useful sample
graphs — not an empty canvas.

**Do:** Install `langflower` and run `langflower start [project-dir]` (or
equivalent first-run CLI) pointing at the folder.

**Expect:**

- If the folder has **no** `.langflower/` directory, bootstrap MUST create
  `.langflower/`, default configs, custom-node pack `nodes/my-nodes/`,
  `instructions.md`, skills from skeleton, and **all** skeleton workflows
  (including **`starter`**, `simple-coder`, `advanced-coder`, `node-writer`,
  `agents-dialog`, …).
- Bootstrap MUST seed **`starter`** as the default / open graph
  (`currentWorkflowId: starter`).
- Providers MUST NOT be invented on disk with secrets.
- Editor MUST open against that project root.

### S2 — Reuse an existing project as-is

**Who:** Developer pointing Langflower at a folder that already has
`.langflower/`.

**Want:** Prior workflows and config preserved — no silent re-seed on start.

**Do:** Run `langflower start` on that folder.

**Expect:**

- Existing `.langflower/` MUST be reused as-is.
- CLI MUST NOT copy or overwrite skeleton templates when `.langflower/`
  already exists.
- To refresh outdated templates after a Langflower upgrade, the operator uses
  Settings → Bootstrap (force seed) — see [S5](#s5--settings-bootstrap-force-reseed).

### S3 — Configure providers before a real run

**Who:** Developer after bootstrap (or on an existing project) with no usable
provider yet.

**Want:** An obvious onboarding path to LM Studio / OpenAI-compatible (or
similar) endpoints and credentials — and a run that fails closed instead of
hanging.

**Do:** On connect with no effective providers, the editor opens **Global
Settings** with an onboarding info block. Add a provider there (or hand-edit
`.langflower/langflower.jsonc` /
[project-configuration](../features/project-configuration.md) — dual path).
Then attempt a run on a seeded workflow that needs an LLM.

**Expect:**

- With no effective providers, connect/reconnect MUST open **Global Settings**
  (server-driven chrome via `session.state.snapshot.settings`) so the operator
  sees where to add an OpenAI-compatible provider.
- The empty providers list MUST explain that simple nodes / Fake LLM still work
  without a provider, and that a real provider is required for live model runs,
  Sub-Agent workflows, and seeded coding samples.
- Dual path: Settings UI **or** hand-edit satisfies provider setup.
- With no usable provider yet, a run MUST fail closed: MUST NOT hang.
- The error MUST name the missing provider and/or config path so the developer
  knows what to edit in `langflower.jsonc` (fail-closed named-path messaging
  is still a separate gap — see Missing parts).
- Bootstrap MUST NOT invent secrets.

### S4 — Start from the seeded onboarding workflow

**Who:** Developer after bootstrap (provider configured or not).

**Want:** The onboarding seed as the obvious default / open graph, then a
coding sample path when ready.

**Do:** Open the project after bootstrap; confirm the seeded workflow is the
default / open graph.

**Expect:**

- Seeded **`starter`** MUST be the default / open first graph.
- Coding samples (`simple-coder`, `advanced-coder`, …) MUST already be in the
  project catalog after first-run (full skeleton seed).

### S5 — Settings Bootstrap force reseed

**Who:** Developer who upgraded Langflower and needs refreshed skeleton
templates without losing provider / MCP settings.

**Want:** One explicit action that rewrites packaged templates in the project.

**Do:** Open Settings → Project → Bootstrap → confirm.

**Expect:**

- Server MUST force-overwrite skeleton-owned workflows, skills, `my-nodes`,
  and `instructions.md` from the packaged skeleton.
- Server MUST NOT rewrite `langflower.jsonc` (providers, API keys, MCP).
- Server MUST NOT overwrite an existing `config.json`.
- User-authored workflow files whose ids are not in the skeleton MUST remain.
- Force seed MUST be rejected while a run is active.
- After success, workflow catalog (and custom palette) MUST refresh without a
  full app restart.

## UI specs

| Spec                                                          | Scenarios covered                                                                                                                                                                           |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Getting started](../features/getting-started.md)             | [S1](#s1--first-run-bootstrap-from-cli), [S2](#s2--reuse-an-existing-project-as-is), [S3](#s3--configure-providers-before-a-real-run), [S4](#s4--start-from-the-seeded-onboarding-workflow) |
| [Project configuration](../features/project-configuration.md) | [S3](#s3--configure-providers-before-a-real-run)                                                                                                                                            |
| [Settings panel](../features/settings-panel.md)               | [S3](#s3--configure-providers-before-a-real-run) (empty-provider open + chrome), [S5](#s5--settings-bootstrap-force-reseed)                                                                 |

## Runtime requirements

| Need                                                   | Why (scenario)                                                                                                     | Today                                                                                         | Caution                                                       |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Detect missing `.langflower/` + scaffold full skeleton | First-run layout ([S1](#s1--first-run-bootstrap-from-cli))                                                         | CLI gates on directory presence                                                               | Secrets MUST NOT be invented on disk                          |
| Skip seed when `.langflower/` exists                   | Preserve prior data ([S2](#s2--reuse-an-existing-project-as-is))                                                   | CLI skips bootstrap                                                                           | MUST NOT silent-reseed on start                               |
| Seed all skeleton workflows; `starter` default         | Useful first graph ([S1](#s1--first-run-bootstrap-from-cli), [S4](#s4--start-from-the-seeded-onboarding-workflow)) | Full skeleton copy on create                                                                  | Force reseed is Settings-only                                 |
| Settings force reseed without touching jsonc           | Upgrade templates ([S5](#s5--settings-bootstrap-force-reseed))                                                     | `project.bootstrap.requested`                                                                 | Reject while run active                                       |
| Empty-provider open Global Settings + onboarding copy  | Discoverable provider setup ([S3](#s3--configure-providers-before-a-real-run))                                     | Connect forces `settings: { open: true, scope: 'global' }` when effective `provider` is empty | Dual path Settings **or** hand-edit; no invented secrets      |
| Empty providers + fail-closed message                  | Real LLM path without hang ([S3](#s3--configure-providers-before-a-real-run))                                      | Empty `provider: {}` on bootstrap; onboarding chrome landed                                   | Error MUST name missing provider / config path; MUST NOT hang |

## Status

**Partial** — `langflower start` creates the full skeleton when `.langflower`
is missing; Settings → Bootstrap force-reseeds templates without rewriting
`langflower.jsonc`. Empty-provider connect opens Global Settings with
onboarding copy. Fail-closed named-path provider error on run is still open.

**Implementable when** S1–S5 Expects pass for seed/reseed paths, and S3
fail-closed provider error lands.

### Missing parts

| Layer   | Gap                                                                                   | Scenarios | Done when                                                                   |
| ------- | ------------------------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------- |
| Runtime | Fail-closed empty-provider path (no hang; error names missing provider / config path) | S3        | Run without provider fails closed with a named path into `langflower.jsonc` |

### Workarounds

- Point CLI at the folder: `langflower start ./my-repo`.
- After upgrading Langflower, open Settings → Project → Bootstrap to refresh
  templates.
- Edit `.langflower/langflower.jsonc` by hand for providers.

### Demo / CI

- Bootstrap implementation:
  `packages/server/src/bootstrap/project-bootstrap.service.ts`
- Spec: `packages/server/src/bootstrap/spec.md`
- Unit / integration / WS tests cover create seed, CLI skip, and force reseed.
- Coding north-star after bootstrap: [coding-agent](coding-agent.md);
  skeleton `simple-coder` / `advanced-coder`; demo smoke `basic-coder` under
  `demo-project/.langflower/workflows/`.
- Config shape: [CONFIG.md](../CONFIG.md). Product purpose:
  [PRODUCT.md](../PRODUCT.md).
