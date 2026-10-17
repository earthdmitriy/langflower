---
kind: adr
owner: docs
covers: []
status: current
id: ADR-007
supersedes: []
superseded-by: []
package: docs
---

## ADR-007 — esbuild for custom node packages

**Status:** accepted · **Date:** 2026-06-16 · **Updated:** 2026-08-30

**Context:** User node packs may import npm deps; load path needs a single ESM
artifact per entry (or pack) for palette metadata and later execution. Pack
layout / npm model: [ADR-030](./030-custom-node-pack-layout-and-npm-model.md).

**Alternatives considered:**

- **tsc emit per package** — respects types, slow, does not bundle dependencies.
- **webpack / rollup in server** — flexible, slower cold start and heavier config for
  arbitrary user `package.json`.
- **Dynamic `import()` of user TS without bundle** — requires user ts-node/tsx;
  inconsistent UX.

**Decision:** esbuild bundle to ESM; cache in `.langflower/.cache/nodes/` at
stable `<pack>/<entry>.mjs` paths. A sidecar `manifest.json` stores pack
fingerprints (sources + lockfiles + host peer stamp + rewrite policy id).
Matching fingerprints **load** existing `.mjs` files without typecheck/esbuild.
Miss compiles dirty packs only. `{ force: true }` (Custom → Update) wipes the
cache root then rebuilds every pack. Empty / missing `nodes/` still deletes
leftover cache. Load uses a unique temp copy of the stable `.mjs` so the ESM
module cache cannot pin the git path. Owned by `@langflower/compiler`
(`loadProjectNodes` / `compileProjectNodes`), not grown as server domain
logic. Discovery: each pack `*.ts` / `*.tsx` with `export default` (definition
or array); **no** required `index.ts`. Port metadata comes from the definition
object (`inputs` / `outputs` / `bind` probe) — **not** from a TypeScript
Compiler API scan of `execute` signatures.

**Compile pipeline (per pack, per entry):** (0) compare fingerprints; skip
clean packs; wipe the cache root only on `force`, empty `nodes/`, or `EBUSY`
recovery; (1) when the pack has `tsconfig.json`, run `tsc --noEmit` and
attribute errors to individual `export default` entry files (shared non-entry
errors fail all entries in that pack); (2) esbuild only entries that passed
typecheck, to stable `<pack>/<entry>.mjs`. One pack or one entry failing does
not block siblings. Failures write `COMPILATION_ERRORS.md` in the pack and
surface on `customPalette.snapshot` (`partial` when some nodes still loaded).
Internal `from './file.ts'` needs pack `allowImportingTsExtensions` (valid
only with `noEmit`); without it `tsc --noEmit` fails and the pack does not
compile.

**Host peer types for `tsc`:** resolve `@langflower/node-sdk`, `rxjs`, and
`@rx-evo/stateful-observable` from the **compiler’s install tree**
(`import.meta.resolve` + package.json `types` / `exports.types`), not via a
`.js` → sibling `.d.ts` guess and not from the user project’s `node_modules`.
`@types/node` is a compiler dependency so `typeRoots` works under
`npm i -g langflower` when the project folder has no `node_modules`. Peer-only
packs therefore typecheck without a pack-local `npm install`; author
`dependencies` still require pack `node_modules`.

**Host peer runtime for load:** the same peers stay **external** in the esbuild
artifact (shared module identity with the host), but bare specifiers are
rewritten to absolute `file://` URLs resolved from the compiler install tree.
Native `import()` of a unique temp copy of
`.langflower/.cache/nodes/<pack>/<entry>.mjs` therefore works in an empty
project with no project/`pack` `node_modules`. A host-stamp mismatch (new
install path / peer version) is a cache miss so upgrades cannot leave a stale
`file://` bundle on disk.

**Tradeoffs accepted:**

- (+) Fast rescans; one file to load for metadata (and later sandbox).
- (+) Handles user dependencies in one shot.
- (+) Pack `tsconfig.json` gates Update via `tsc --noEmit` before esbuild.
- (+) Peer-only packs work with global Langflower and an empty project tree
  (typecheck **and** runtime load).
- (+) Unchanged packs skip the toolchain on start (fingerprint + host stamp).
- (−) Force-wipe still fails loud if the cache dir cannot be deleted
  (e.g. Windows file lock).
- (−) Shared (non-entry) type errors fail every entry in that pack.
- (−) Cache `.mjs` embeds absolute host paths (local machine / install layout).

**Consequences:**

- Compiler returns definitions for palette + runtime merge; server only composes.
- Pack compile-error records on disk vs WS snapshot types are a DAG twin
  ([ADR-039](./039-dag-forced-twins-stay-copies-until-the-dag-flips.md)).
  `loadProjectNodes` re-exports `CompilePackError`; server assigns
  `loaded.errors` onto `customPalette.snapshot` — no identity mapper.
- Do not revive `node-compile/` / TS-API signature inference.
- Sandboxed execution of arbitrary custom code remains deferred ([TBD-001](../_work/TBD.md)).
- Published CLI bundling (`install-local` / `pack-release`) is a **separate**
  esbuild use: concatenate start/eval/compile chunks in product `dist/`. Keep
  host peers, `typescript`, and `esbuild` external so custom-pack `file://`
  identity and lazy compile still hold. Product `vendor/` is those host-peer
  packages plus the server skeleton — not a copy of every workspace `tsc`
  tree (epic 44 (`docs/_archive/DONE/EPICS/44-startup-optimization.md`)).

---
