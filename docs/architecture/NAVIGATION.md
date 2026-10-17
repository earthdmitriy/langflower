---
kind: architecture
owner: docs
covers:
    - 'tests/unit/package-boundaries/**'
status: current
---

# Code Navigation

Quick map for agents: where to read and where to change code.

## Package dependency graph

Source of truth is the enforced matrix
[`tests/unit/package-boundaries/allowed-edges.ts`](../../tests/unit/package-boundaries/allowed-edges.ts)
(gated by `package-json-dag.test.ts` and `production-imports.test.ts`). The
sketch below is `dependency → consumer` and must match that matrix:

```text
runtime → node-sdk
node-sdk → compiler
node-sdk → tools
node-sdk + runtime + tools → common-nodes
runtime + node-sdk + websocket-bridge → shared
tools → eval
shared + websocket-bridge → langflower-mcp
runtime + node-sdk + compiler + tools + common-nodes
  + shared + websocket-bridge → server
common-nodes + node-sdk + runtime + shared
  + websocket-bridge → ui
server + shared + eval → cli
```

The sketch includes `runtime → node-sdk` because
`ALLOWED_WORKSPACE_DEPS` allows it. `@langflower/node-sdk` has **no
production dependency** on `@langflower/runtime` — runtime is a
devDependency for parity tests only
([ADR-027](../adr/027-author-sdk-owns-port-types-no-production-runtime-dep.md)).
`@langflower/compiler` depends on the author SDK alone.

| Package                   | npm name                   | Role                                                                                                                                                                                                                                                             |
| ------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared`         | `@langflower/shared`       | Protocol integration layer over runtime / node-sdk / websocket-bridge: co-versioned WS protocol, config, workflow and checkpoint shapes + pure helpers — **no I/O**, and it does not own every type it re-exports ([AGENTS.md](../../packages/shared/AGENTS.md)) |
| `packages/node-sdk`       | `@langflower/node-sdk`     | Author SDK — `defineNode` / `defineReactiveNode`                                                                                                                                                                                                                 |
| `packages/runtime`        | `@langflower/runtime`      | `RuntimeFacade` (editor + runner), StatefulObservable graph, helpers                                                                                                                                                                                             |
| `packages/tools`          | `@langflower/tools`        | Project runtime: builtins, fence, webFetch, crawl, KB, MCP                                                                                                                                                                                                       |
| `packages/common-nodes`   | `@langflower/common-nodes` | Catalog nodes + unbound OpenAI adapters (`ai/features/openai/`)                                                                                                                                                                                                  |
| `packages/eval`           | `@langflower/eval`         | Fixture packs, scoring, fail-closed regression gate (epic 09)                                                                                                                                                                                                    |
| `packages/compiler`       | `@langflower/compiler`     | Discover/esbuild custom packs under `.langflower/nodes/`                                                                                                                                                                                                         |
| `packages/langflower-mcp` | `@langflower/mcp`          | Dev MCP stdio → live WS bridge (Cursor agents; ADR-024)                                                                                                                                                                                                          |
| `packages/server`         | `@langflower/server`       | **Thin:** WS, CRUD, secrets bind, attach `RunHostServices`                                                                                                                                                                                                       |
| `packages/ui`             | `@langflower/ui`           | Angular SPA + ngDiagram editor                                                                                                                                                                                                                                   |
| `packages/cli`            | `@langflower/cli`          | CLI workspace package; published product is root `langflower`                                                                                                                                                                                                    |

The desktop launcher is a **Rust crate at repo root** `launcher/`, not an npm
workspace package ([ADR-038](../adr/038-launcher-is-a-cli-supervisor.md)).
Author guide (no Rust assumed): [launcher/docs/README.md](../../launcher/docs/README.md).

Nested agent docs: each package has its own `AGENTS.md`.

Package DAG / ownership regression gates (unit):
[`tests/unit/package-boundaries/`](../../tests/unit/package-boundaries).

**Anti-pattern:** adding KB/crawl/MCP/LLM **implementations** under
`packages/server/src/`. Place them in tools / common-nodes and inject
([PRINCIPLES.md § Thin server](PRINCIPLES.md#thin-server--do-not-grow-domain-here)).

## Task → entry point

The task table is in [navigation-tasks.md](navigation-tasks.md).

## Adapted slices and platform

- `packages/ui/src/app/features/<feature>/` are adapted feature slices:
  components and feature-owned pure helpers/types stay together. Current slices
  are `canvas`, `composer`, `editor`, `feed`, `feed-folding`, `palette`,
  `sidebar`, and `topbar`.
- `packages/ui/src/app/services/` is the root platform and cross-feature
  orchestration layer: typed bridge ownership, remount-safe projections,
  execution folds, and UI-wide services. It is not a second feature tree.
- `packages/ui/src/app/components/` holds presentational primitives shared by
  more than one feature (inline field, static port-row, port CSS).
- `packages/ui/src/app/diagram/` holds canvas/diagram contracts (port ids,
  palette drag MIME).
- Feature components may inject root services and import `app/components/` /
  `app/diagram/`. Platform code may import a pure feature type/helper when that
  feature owns the vocabulary, but must not import feature components.

## Public API boundaries

- Import domain types from `@langflower/shared` using **concrete module paths**
  (no package `index.ts` — barrels are forbidden).
- Do **not** deep-import unrelated packages; keep boundaries in
  `package.json` `exports`.
- **`index.ts` is forbidden** everywhere in the repo — import concrete modules
  by path within a package. Details: [PRINCIPLES.md](PRINCIPLES.md) § Module exports.
- Server CLI entry: `packages/cli/src/cli.ts` → `bin/langflower.js`.
- Server bootstrap: `packages/server/src/create-server.ts` (`createServer`).

## Runtime vs repo

| Location          | Lives in                              | Notes                                                                                      |
| ----------------- | ------------------------------------- | ------------------------------------------------------------------------------------------ |
| User workflows    | `<project>/.langflower/workflows/`    | JSON graphs                                                                                |
| Custom node packs | `<project>/.langflower/nodes/<pack>/` | Default seed: `my-nodes/` ([ADR-030](../adr/030-custom-node-pack-layout-and-npm-model.md)) |
| Skeleton seed     | `packages/server/skeleton/`           | First-run minimum copied by bootstrap (epic 33); catalog extras stay in tree               |
| UI static build   | `packages/ui/dist/`                   | Served by server                                                                           |

## Related docs

- DONE/EPICS/README.md (`docs/_archive/DONE/EPICS/README.md`) — completed epics archive
- DONE/README.md (`docs/_archive/DONE/README.md`) — all completed plan indexes
- TODO/README.md (`docs/_work/TODO/README.md`) — queued plans
- TBD.md (`docs/_work/TBD.md`) — long-term goals / hard tradeoffs (not near-term queue)
- DONE/UI/README.md (`docs/_archive/DONE/UI/README.md`) — completed canvas UI/UX plans
- DONE/README.md (`docs/_archive/DONE/README.md`) — finished plans index
- DONE/LLM-NODES/llm-nodes-README.md (`docs/_archive/DONE/LLM-NODES/llm-nodes-README.md`) — LLM foundation phases
- [TESTING.md](../guides/TESTING.md) — unit, API, integration strategy
- [ARCHITECTURE.md](ARCHITECTURE.md) — flows and startup
- [ADR.md](../adr/README.md) — architecture decision records
- [EXTENSION_POINT.md](EXTENSION_POINT.md) — extension seams and their stability
- [VIRTUAL_SCROLL.md](ui/VIRTUAL_SCROLL.md) — work-log sliding window (why not CDK autosize)
- [STATUS.md](../product/STATUS.md) — what is stub vs implemented
- [features/node-library.md](../product/features/node-library.md) — built-in node catalog and harness spec
- [FOUND_BUGS.md](../bugs/README.md) — reproduced bugs + design flaw signals (retrospective)
- [PRINCIPLES.md](PRINCIPLES.md) — coding rules
- [../../packages/ui/docs/TYPOGRAPHY.md](../../packages/ui/docs/TYPOGRAPHY.md) — UI typography (in package)
- [../../packages/ui/docs/DIAGRAM_CANVAS.md](../../packages/ui/docs/DIAGRAM_CANVAS.md) — ngDiagram ports, sizing, incident log
