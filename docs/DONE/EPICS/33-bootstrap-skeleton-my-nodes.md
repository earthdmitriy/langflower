# Epic 33 — Bootstrap / skeleton seed `nodes/my-nodes`

**Status:** landed (2026-07-24)  
**Depends on:** [31-custom-nodes-my-nodes-contract.md](31-custom-nodes-my-nodes-contract.md)
(content contract); [32-langflower-compiler.md](32-langflower-compiler.md)
(load path for seeded nodes).  
**Index:** [README.md](README.md)

## Goal

On first-run / empty `.langflower`, **bootstrap** copies the locked minimum
seed, including **`nodes/my-nodes`**, instructions, onboarding skills, and
**`starter`** workflow from the skeleton tree. No wipe of existing project
data; no auto `npm install`.

## Landed notes

- Skeleton SoT: [`packages/server/skeleton/`](../../../packages/server/skeleton/)
  (`nodes/my-nodes` synced from demo-project; skills + five workflows;
  `instructions.md`)
- Bootstrap: [`project-bootstrap.service.ts`](../../../packages/server/src/bootstrap/project-bootstrap.service.ts)
    - [`resolve-skeleton-root.ts`](../../../packages/server/src/bootstrap/resolve-skeleton-root.ts)
      — copy-if-missing minimum; package `files` includes `skeleton`
- Spec: [`packages/server/src/bootstrap/spec.md`](../../../packages/server/src/bootstrap/spec.md)
- First-run auto-seed: `my-nodes`, `instructions.md`,
  `langflower-helper`, `langflower-node-writer`, `starter`
  (`currentWorkflowId: 'starter'`)
- Catalog-only (not auto-copied): `node-writer`, `agents-dialog`,
  `simple-coder`, `advanced-coder`
- Docs: getting-started, skeleton feature/UC, bootstrap-new-project, STATUS

## Acceptance criteria

1. Fresh temp project + `bootstrapProject` →
   `.langflower/nodes/my-nodes/{package.json,tsconfig.json,README.md}` + at
   least one `export default defineNode` demo file exist.
2. Second bootstrap does not destroy user edits under `my-nodes`.
3. Docs (getting-started, skeleton use-case S2) match actual seed.
4. After author peer resolve / Custom Update, demo node appears as custom
   (manual smoke — not automated in this epic).

## Verify

```bash
node build/tools/agent-run.mjs verify --quick
# bootstrap unit/integration coverage as added
```
