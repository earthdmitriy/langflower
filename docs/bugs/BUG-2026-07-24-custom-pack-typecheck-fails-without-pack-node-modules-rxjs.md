---
kind: bug
owner: docs
covers: []
status: current
date: 2026-07-24
flaw: Host type resolution must fol...
package: compiler
fixed: yes
---

### BUG-2026-07-24 — Custom pack typecheck fails without pack node_modules (rxjs .d.ts)

| Field                  | Value                                                                                                                                                                                                 |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-07-24                                                                                                                                                                                            |
| **Area**               | compiler · custom-nodes                                                                                                                                                                               |
| **Status**             | fixed                                                                                                                                                                                                 |
| **Symptom**            | Peer-only pack with valid `rxjs` / `@langflower/node-sdk` imports wrote `COMPILATION_ERRORS.md` (“Could not find a declaration file…”) even with no author deps.                                      |
| **Repro**              | Pack with `tsconfig.json` + `peerDependencies` only, no pack/`project` `node_modules`; Update / `compileProjectNodes`.                                                                                |
| **Root cause**         | Host paths mapped `import.meta.resolve('rxjs')` → `dist/cjs/index.js` and guessed sibling `.d.ts`; rxjs types live at package.json `types` / `exports.types`. Also `typeRoots` assumed monorepo root. |
| **Fix**                | `packages/compiler/src/resolve-host-types.ts` — resolve peers from compiler install via package.json types/exports; `@types/node` as compiler dep for host `typeRoots`.                               |
| **Design flaw signal** | Host type resolution must follow npm package metadata and the **Langflower install tree**, not project layout or JS↔DTS filename symmetry.                                                            |
| **Regression test**    | `packages/compiler/src/resolve-host-types.test.ts`; `compile-project-nodes.test.ts` — peer-only pack without `node_modules`.                                                                          |
