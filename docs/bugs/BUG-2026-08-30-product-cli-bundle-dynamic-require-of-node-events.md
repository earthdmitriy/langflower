---
kind: bug
owner: docs
covers: []
status: current
date: 2026-08-30
flaw: Concatenating CJS Node librar...
package: cli
fixed: yes
---

### BUG-2026-08-30 — Product CLI bundle: dynamic require of `node:events`

| Field                  | Value                                                                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-08-30                                                                                                                                                                      |
| **Area**               | cli · release bundle                                                                                                                                                            |
| **Status**             | fixed                                                                                                                                                                           |
| **Symptom**            | Global `langflower` printed `Starting Langflower...` then crashed: `Error: Dynamic require of "node:events" is not supported` in `dist/chunk-*.js` (commander).                 |
| **Repro**              | `npm run install-local` after epic 44 phase 3; run `langflower`.                                                                                                                |
| **Root cause**         | esbuild ESM output wraps CJS `require` in a shim that throws when `require` is missing. Bundled `commander` (CJS) calls `require('node:events')`.                               |
| **Fix**                | `createRequire(import.meta.url)` banner on product chunks (`build/lib/bundle-product.mjs`).                                                                                     |
| **Design flaw signal** | Concatenating CJS Node libraries into ESM needs a real `require` (or leaving those packages external). A static grep of externals does not catch runtime `require` of builtins. |
| **Regression test**    | `tests/unit/release/bundle-product.test.ts` — spawn bundled `index.js --help`                                                                                                   |
