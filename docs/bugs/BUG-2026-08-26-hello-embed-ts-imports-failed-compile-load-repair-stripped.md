---
kind: bug
owner: docs
covers: []
status: current
date: 2026-08-26
flaw: Compile failure and workflow...
package: compiler
fixed: yes
---

### BUG-2026-08-26 — hello-embed `.ts` imports failed compile; load repair stripped kb-ingest

| Field                  | Value                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-08-26                                                                                                                                                                                                                                                                                                                                                        |
| **Area**               | compiler · custom-nodes · editor                                                                                                                                                                                                                                                                                                                                  |
| **Status**             | fixed                                                                                                                                                                                                                                                                                                                                                             |
| **Symptom**            | Opening **KB ingest** showed “Loaded with 1 node(s) / 3 edge(s) removed (invalid)”. Canvas kept only Boolean, embed-provider, Finish.                                                                                                                                                                                                                             |
| **Repro**              | Seed `hello-embed` with `from './lib/x.ts'` and pack `tsconfig.json` **without** `allowImportingTsExtensions`. `langflower start`, load `kb-ingest`. Pack writes `COMPILATION_ERRORS.md`; `hello-embed-ingest` never registers.                                                                                                                                   |
| **Root cause**         | Pack compile runs `tsc --noEmit` from pack tsconfig (NodeNext). `.ts` import suffixes are illegal unless `allowImportingTsExtensions` (and `noEmit`). Failed entries never enter the palette. Workflow load repair treats missing custom `type`s as unknown and strips nodes/edges. hello-embed copied the `.ts` import style without the matching tsconfig flag. |
| **Fix**                | hello-embed `tsconfig.json`: `allowImportingTsExtensions: true`. Compiler tests compile `.ts`-suffix imports and the skeleton hello-embed pack.                                                                                                                                                                                                                   |
| **Design flaw signal** | Compile failure and workflow “invalid node” UX are the same event. Authors/helpers must read `COMPILATION_ERRORS.md` before treating load repair as a bad JSON graph. Seed packs that use `.ts` imports must ship the matching tsconfig flag.                                                                                                                     |
| **Regression test**    | `packages/compiler/src/compile-project-nodes.test.ts` — internal `.ts` imports + skeleton `hello-embed` pack compile                                                                                                                                                                                                                                              |
