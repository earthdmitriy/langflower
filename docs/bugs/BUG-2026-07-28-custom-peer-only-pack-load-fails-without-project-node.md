---
kind: bug
owner: docs
covers: []
status: current
date: 2026-07-28
flaw: Closing host resolution for *...
package: compiler
fixed: yes
---

### BUG-2026-07-28 — Custom peer-only pack load fails without project node_modules

| Field                  | Value                                                                                                                                                                                                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-07-28                                                                                                                                                                                                                                                            |
| **Area**               | compiler · custom-nodes                                                                                                                                                                                                                                               |
| **Status**             | fixed                                                                                                                                                                                                                                                                 |
| **Symptom**            | After `langflower start` in an empty folder, seed `my-nodes` entries failed with `Failed to load bundled module: Cannot find package '@langflower/node-sdk'` (and rxjs / stateful-observable).                                                                        |
| **Repro**              | Empty project (no `node_modules`); seeded `.langflower/nodes/my-nodes` peer-only pack; Custom → Update / `compileProjectNodes`.                                                                                                                                       |
| **Root cause**         | esbuild left host peers as bare externals; native `import()` of `.cache/nodes/.../*.mjs` resolved from the cache path / project tree. Typecheck already used compiler-host peers (BUG-2026-07-24); runtime load did not. Vitest aliases masked the gap in unit tests. |
| **Fix**                | `bundle-pack.ts` rewrites host peer imports to absolute `file://` URLs from `resolveHostPackageEntry`; cache key includes host runtime stamp + policy id.                                                                                                             |
| **Design flaw signal** | Closing host resolution for **tsc only** is incomplete — any phase that emits a loadable artifact must apply the same host-peer contract, and tests must exercise native Node import without Vitest aliases.                                                          |
| **Regression test**    | `compile-project-nodes.test.ts` — peer-only pack outfile has no bare peer imports + subprocess `node` import; `resolve-host-types.test.ts` — `resolveHostPackageEntry`                                                                                                |
