# Epic 31 — Custom nodes contract: `nodes/my-nodes` + multi `package.json`

**Status:** landed (2026-07-24)  
**Depends on:** [30-rename-node-sdk.md](30-rename-node-sdk.md)  
**Index:** [README.md](README.md)  
**Next:** [32-langflower-compiler.md](../../TODO/EPICS/32-langflower-compiler.md)  
**Feeds:** [33-bootstrap-skeleton-my-nodes.md](33-bootstrap-skeleton-my-nodes.md) _(landed)_

## Goal

Lock the **product contract** for project custom-node packs **before** building
the compiler: layout, npm model, default pack id `my-nodes`, README for humans
and agents, demo nodes on **`defineNode`**. Prefer docs/ADR (+ draft skeleton
tree) over full bootstrap wiring (epic 33) and over load (epic 32).

## Landed notes

- **ADR-030** — Custom node pack layout & npm model; ADR-007 / ADR-020 amended
- Skeleton draft:
  [`packages/server/skeleton/nodes/my-nodes/`](../../../packages/server/skeleton/nodes/my-nodes/)
  (`package.json`, `tsconfig.json`, `README.md`, `review-gate.ts` via
  `export default defineReactiveNode(…)` with independent `ok` / `fail`
  outputs)
- Demo aligned:
  [`demo-project/.langflower/nodes/my-nodes/`](../../../demo-project/.langflower/nodes/my-nodes/)
  — removed `langlower-review-gate/` barrel + fake `nodes/types.ts`
- Authors import `@langflower/node-sdk` directly (no root `nodes/types.ts`)
- Docs: PRODUCT, NAVIGATION, skeleton feature/UC, getting-started, NODES,
  HOW_TO, `spec.md` §1–4

## Gaps for epic 32 / 33 (no layout forks)

| Gap                                                                                                | Owner   |
| -------------------------------------------------------------------------------------------------- | ------- |
| Discover packs, esbuild bundle, cache, palette `source: 'custom'`, runtime resolve merge           | Epic 32 |
| `bootstrapProject` copies skeleton → `.langflower/nodes/my-nodes/` (no overwrite; no auto `npm i`) | Epic 33 |
| Shell Cap on public `ExecutionContext` (seed uses `child_process`)                                 | Later   |
| Custom-node sandbox                                                                                | TBD-001 |

## Acceptance criteria

1. Written contract committed (ADR-030 + feature/use-case updates) with
   **no** open choice between single-root vs per-pack `package.json` for the
   default seed.
2. Draft `my-nodes` tree exists at
   `packages/server/skeleton/nodes/my-nodes/` with
   `package.json`, `tsconfig.json`, `README.md`, and at least one
   `export default defineNode(…)` demo file.
3. Epic 32/33 plans can reference this doc without re-deciding layout.
4. Docs state: author `npm i`; server does not auto-install.

## Verify

Docs-only / draft files — seed is outside `packages/server` tsconfig `include`
(`src/**/*.ts` only). No full `verify` required for this epic.
