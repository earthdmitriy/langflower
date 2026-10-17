# Code regression — compiler

## Meta

- Paths: `packages/compiler/src/`
- Date: 2026-09-20
- Mode: delta
- Coverage: Full re-read of the same 15 production modules as 2026-09-19 (no `index.ts`, no new files): `discover-packs.ts`, `load-project-nodes.ts`, `compile-project-nodes.ts`, `compile-types.ts`, `cache-paths.ts`, `cache-manifest.ts`, `cache-wipe.ts`, `pack-fingerprint.ts`, `bundle-pack.ts`, `typecheck-pack.ts`, `resolve-host-types.ts`, `load-cached-nodes.ts`, `validate-default-export.ts`, `format-compilation-errors.ts`, `write-compilation-errors.ts`. Tests sampled: `resolve-host-types.test.ts` (`/llm` JS resolve + bare `hostPathMappings`), `compile-project-nodes.test.ts` peer-only fixture (bare `@langflower/node-sdk`, not `/llm`). ts-scan: `hostPathMappings`, `isHostPeerSpecifier`, `hasCustomNodePacks`, `packCacheDirName`, `CompilePackError`, `toPackErrors` (unresolved), `defineLlmNode` (recommended `@langflower/node-sdk/llm`), `CustomPalettePackError` / `PaletteCompilationDiagnostic` (shared twins), `list_exports` of the three public modules, `list_imports` of compile/load. Cross-checked only to reconcile: `packages/compiler/package.json` `exports`, `packages/compiler/AGENTS.md`, node-sdk `exports` `/llm` + `/create-typed-ui-schema`, ADR-039 compile-error row. LEDGER closed `compiler-host-peer-subpath-paths` on 2026-09-20; pack-cache name collision stays open.
- Previous report: 2026-09-19 — Critical=0 Important=4 Suggestion=3 (numbered items; kebab ids assigned here for ledger stability)

## Previous findings (delta mode)

| id                                   | severity  | status     | evidence                                                                                                                                                                                                                                  |
| ------------------------------------ | --------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `compiler-host-peer-subpath-paths`   | Important | fixed      | Closed 2026-09-20 — see LEDGER.                                                                                                                                                                                                           |
| `compiler-pack-cache-name-collision` | Important | still-open | `packCacheDirName` still `replace(/[^\w.-]+/g, '_')`. Manifest / `packCacheDir` still key on `package.json` `name` (`nextPacks[decision.pack.packageName]`). Distinct names `@acme/nodes` and `_acme_nodes` still alias to `_acme_nodes`. |

## Principles check

- **PASS — package DAG / must-not-depend.** `list_imports` on `compile-project-nodes.ts` / `load-project-nodes.ts`: `@langflower/node-sdk`, Node built-ins, local modules only. No server / UI / shared / common-nodes / websocket-bridge.
- **PASS — no `index.ts` barrels / leftover public re-exports.** Zero `index.ts` under `packages/compiler`. `list_exports` of `compile-project-nodes.ts` has no `hasCustomNodePacks`. `package.json` `exports` remain the three start/toolchain paths. `toPackErrors` still unresolved (ts-scan).
- **PASS — thin compose / one cache stack.** Load stays free of static `typescript` / esbuild and dynamic-imports compile on miss / `{ force: true }`. Shared `planPackCache` + `loadPackFromCache`. Failed packs omitted from the manifest.
- **PASS — `type` + arrows; no production `any`.** Boundary casts stay `unknown` / esbuild `Message` at the I/O edge.
- **PASS — composer readability.** Each composer lists sibling steps. Repeated discover/plan is extra work, not a listed class (previous FAIL dropped).
- **PASS — ADR-039 compile-error twin.** JSDoc on `CompilePackError` names the shared copy. Server assign path is the ADR gate. Missing named parity file is not `twin-without-adr`.
- **PASS — Results at bundle / load / wipe.** `bundleEntry`, `loadBundledDefault`, `wipeCacheRoot`, `parseDefaultExport` return `{ ok }`. Discover throw left in Non-issues.
- **PASS — RxJS / `withLatestFrom`.** N/A (host-peer resolve only).
- **PASS — host-peer subpath `paths`.** `hostPathMappings` includes `@langflower/node-sdk/llm` and other published subpaths (LEDGER `compiler-host-peer-subpath-paths`, 2026-09-20).
- **FAIL — `two-writers`.** Cache dir + manifest key still alias distinct pack names onto one folder (`compiler-pack-cache-name-collision`).

## FOUND_BUGS signals

- **BUG-2026-07-28** (peer-only host contract incomplete across compile phases) — **same-mechanism gap remains for subpaths.** Bare peers still get `hostPathMappings` + `file://` rewrite + host stamp; peer-only test still locks native `node` import. `isHostPeerSpecifier` already includes `@langflower/node-sdk/llm`; `hostPathMappings()` does not. A peer-only pack that imports the documented `defineLlmNode` path fails `tsc` (`Cannot find module`) and never reaches esbuild.
- **BUG-2026-07-24** (tsc host peers for bare names) — **does not recur** for the three bare packages. Residual is the subpath gap above, not a restored rxjs `.d.ts` miss.
- **BUG-2026-07-29** (compile on every WS connect) — **does not recur in this package.** Cache hit still skips the toolchain.
- **BUG-2026-08-26** (`.ts` suffix vs `allowImportingTsExtensions`) — **does not recur.** `typecheck-pack.ts` still honors pack `tsconfig.json`.

## Glue / adapters / parallel types

- **No `*Adapter` / `*Mapper` classes** in `packages/compiler/src/`.
- **ADR-039 (keep; do not merge).** `CompileDiagnostic` / `CompilePackError` stay field-for-field with shared `PaletteCompilationDiagnostic` / `CustomPalettePackError`. Gate is structural assign at the server, not a named parity test.
- **Not glue.** Duck-guard in `validate-default-export.ts` is load-time validation (node-sdk still has no `isReactiveNodeDefinition`). `onCompile` is a named start-path edge.

## Streamlining & simplifications

none

## Design-flaw fixes

none

## Findings

1.  - id: `compiler-pack-cache-name-collision`

- class: two-writers
- severity: Important
- first-seen: 2026-09-19
- status: open
- path: `packages/compiler/src/cache-paths.ts` `packCacheDirName`; writers `compile-project-nodes.ts` `nextPacks[decision.pack.packageName]` / `packCacheDir(...)` and `discover-packs.ts` `readPackageName`
- evidence: `packCacheDirName('@scope/name')` and `packCacheDirName('_scope_name')` both become `_scope_name`. Two folders that share a `package.json` `name` (or collapse under the sanitizer) write one `.cache/nodes/<pack>/` dir and one `manifest.packs` key; last write wins. No discover error. Folder name is only the fallback when `name` is missing.
- proposed fix: Key cache dirs by the unique `nodes/<folder>` name. If two packs declare the same `package.json` `name`, return a `CompilePackError` instead of merging them.

## Non-issues / looked OK

- **LEDGER:** no compiler Closed/Wontfix rows; nothing to reopen.
- **False-positive (2):** repeated discover/plan on miss is extra work, not a class.
- **False-positive (4):** ADR-039 compile-error twin; accepted gate is assign, not a parity file.
- **False-positive (5–7):** temp-file leak, full `hasCustomNodePacks` walk, duplicate `node_modules` skip, discover `throw` — principle / cleanup notes, not listed classes.
- **2026-09-18 leftovers stayed deleted:** no `hasCustomNodePacks` re-export from compile; no `./format-compilation-errors` public export; no `toPackErrors`.
- **No compiler → shared / UI / common-nodes leak.**
- **One cache stack** (`cache-paths` + `cache-manifest` v1 + `cache-wipe`). Corrupt manifest still treated as miss (documented).
- Host peer list still shared by tsc `paths`, esbuild externals, and `hostRuntimeStamp` for **bare** names; policy id `host-peer-file-url-v1` unchanged.
- Temp-file `import()` strategy (unique copy + `?t=`) still matches ADR-007 / BUG-2026-07-28; gap is cleanup only.
- Per-entry typecheck attribution and `COMPILATION_ERRORS.md` (failed entries only) unchanged.
- No `index.ts`, no `interface`, no production `any`, no RxJS folds.
