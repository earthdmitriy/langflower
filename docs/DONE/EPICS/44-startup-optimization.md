# Epic 44 — Startup optimization

**Status:** landed  
**Depends on:** [epic 32](32-langflower-compiler.md)
(landed — `@langflower/compiler` + `customPalette`);
[epic 40](40-custom-node-recompile-reload.md)
(landed — stable `.cache/nodes` paths, wipe-then-rewrite, hot-swap,
`compile_custom_nodes`).  
**Index:** [README.md](README.md)  
**Do not mix with:** TBD-001 sandbox; file-watch auto-compile; using **tsgo**
as a bundler (it is `tsc`, not a concatenator); lazy-splitting the built-in
catalog / OpenAI SDK (follow-up, not this epic).

## Landed

CLI heartbeat prints before the server graph loads. Custom packs fingerprint

- host-stamp cache; start loads `.mjs` on hit. Product `install-local` /
  `pack-release` esbuild-bundles CLI `dist/` to **8 JS files** (workspace tsc
  emit of the same packages is ~450 JS, plus former node_modules opens).
  `typescript` / esbuild / host peers stay external. Catalog still runs inside
  the start chunk (not lazy). Product `vendor/` is only `node-sdk`, `runtime`,
  and `server/skeleton` — inlined workspace `tsc` trees are not copied.
  Measurement: count `*.js` under staged product
  `dist/` after `bundleProductCli`; baseline `countUnbundledWorkspaceJs()` in
  [`build/lib/bundle-product.mjs`](../../../build/lib/bundle-product.mjs).

## Goal

Make `langflower` start feel alive immediately, skip the custom-node
toolchain when disk cache is valid, and ship fewer ESM files in the
published CLI so cold Windows starts are not 872 `open()`s before the
first line of stdout.

Today the process is silent for up to ~10s on a cold disk (Defender + page
cache), then prints `Compiling custom nodes ...`. A second start is much
faster. The gap is **before** that line: static imports already pulled
`typescript` (~15 MB JS), esbuild, the common-nodes catalog, OpenAI, and
the WS bridge. Compilation itself runs **after** the message, and every
start **wipes** `.langflower/.cache/nodes/` even when sources did not
change (epic 40).

## Problem

1. **No heartbeat.** `bin/langflower.js` is a static `import '../dist/index.js'`.
   ESM hoists that import, so no `console.log` in that file can run first.
   `cli.ts` also statically loads `eval` and `start`; `start-command.ts`
   statically loads `createServer`, which statically loads
   `@langflower/compiler/compile-project-nodes` (and thus `typescript` +
   esbuild) plus `attachLangflowerBridge` + `@langflower/common-nodes`.
2. **Always-compile.** `hasCustomNodePacks` lives in the same module as
   `compileProjectNodes`. `CustomPaletteService` also statically imports
   `compileProjectNodes`. `createServer` always typechecks + esbuilds
   every pack. Tracked `.cache/nodes/*.mjs` exist for `git diff`, then
   get deleted.
3. **Many small ESM files.** Workspace packages emit via `tsc` (one JS
   per TS file). The published product copies that tree to `vendor/` and
   hoists `rxjs` / `openai` / `undici`. Warm `import(create-server)` is
   ~700ms / ~872 modules; cold start is file-open bound.

## Locked decisions

1. **Heartbeat is a dynamic import in the bin.** First stdout must happen
   **before** the server graph loads:

    ```text
    Starting Langflower...
    ```

    Implementation: `bin/langflower.js` prints, then `await import('../dist/index.js')`.
    A static `import` after `console.log` does **not** work (hoist).

2. **Custom-node cache is content + host stamped; compile is lazy.**
   Keep **stable** outfile paths (epic 40 — no hash/uid directories).
   Store a sidecar manifest (e.g. `.langflower/.cache/nodes/manifest.json`)
   with a **pack-level** fingerprint:

    - all pack `.ts` / `.tsx` (same walk as discover; skip `node_modules`,
      `dist`, dot-dirs);
    - `package.json`, `tsconfig.json`;
    - author-dep identity (`package.json` / lock; not a guess from mtime
      alone);
    - **host stamp:** resolved install paths/versions of
      `@langflower/node-sdk`, `rxjs`, `@rx-evo/stateful-observable` and
      the rewrite policy id (bundles embed absolute `file://` peers —
      [BUG-2026-07-28](../../FOUND_BUGS.md)).

    **Hit:** `import()` existing `.mjs` (temp copy + `?t=` as today). Do
    **not** load `typescript` or esbuild. CLI may print
    `Custom nodes up to date` instead of `Compiling custom nodes ...`.

    **Miss:** `await import('@langflower/compiler/compile-project-nodes')`,
    then compile **dirty packs only**. Update those outfiles + manifest.
    Do not wipe the whole cache tree; delete vanished entries. Full wipe
    remains for a corrupt manifest, `EBUSY` recovery, or explicit force.

    **Force:** Palette **Update** and an explicit force flag on
    `customPalette.update.requested` always compile (user intent =
    rebuild). Agent `compile_custom_nodes` after writing `.ts` is normally
    a miss (hashes changed); it must still be able to force.

3. **Product bundling is a release step, not a replacement for workspace
   `tsc`.** `install-local` / `pack-release` esbuild-bundle the CLI start
   graph. Monorepo tests and `npm run start -w @langflower/cli` keep
   per-package `tsc` emit + package `exports`.

    | Artifact      | Contents                                            | Notes                                                                       |
    | ------------- | --------------------------------------------------- | --------------------------------------------------------------------------- |
    | `start` chunk | CLI start + server + catalog + RxJS + express + ws  | Loaded after the heartbeat line                                             |
    | `eval` chunk  | `langflower eval`                                   | Not loaded on `start`                                                       |
    | compile       | `compileProjectNodes` + `typescript` + esbuild      | Dynamic import on miss/force only                                           |
    | **external**  | `typescript`, `esbuild` / `@esbuild/*`              | Never inline into `start`                                                   |
    | **on disk**   | `vendor/node-sdk`, host `rxjs`, skeleton, `ui-dist` | Custom packs still resolve `file://` peers; bootstrap copies skeleton files |

    Tree-shake (`sideEffects: false` on workspace packages) is allowed as
    a size bonus. It will **not** drop catalog nodes while `catalog.ts`
    imports them all. Concatenation (fewer files) is the startup win.

    Do **not** one-file the whole product including TypeScript — that
    delays first stdout.

## Out of scope

- File-watch auto-compile (still epic 40 out of scope).
- Making committed `.mjs` portable across machines without a miss (would
  need load-time peer rewrite instead of baked `file://`). A host-stamp
  miss after `install-local` / new npm prefix is **correct**.
- tsgo / TypeScript 7 as a bundler.
- Lazy OpenAI / undici / per-node catalog splits.
- `NODE_COMPILE_CACHE` as the sole fix (optional extra in phase 1, not
  required).
- Changing Custom palette UX beyond Update = force and honest CLI lines.

## In scope

### Phase 1 — Immediate CLI message

- [x] Dynamic import in published and workspace `bin/langflower.js`.
- [x] Print `Starting Langflower...` before loading `dist/index.js`
      (skipped for `eval` / `--help` / `--version`).
- [x] Lazy-register `langflower eval` so `start` / `--help` do not import
      `@langflower/eval`.
- [x] Do not statically import `compile-project-nodes` from `create-server`
      or `CustomPaletteService`. Discover/has-packs lives in
      `@langflower/compiler/discover-packs` (no `typescript` / esbuild).
- Later CLI lines stay: compile progress, `Langflower running at …`,
  `Project: …`.

### Phase 2 — Cache hit / miss / force

- [x] Sidecar manifest; pack-level fingerprint as locked above.
- [x] Start path: discover → compare → hit load **or** miss compile.
- [x] Amend epic 40 / [ADR-007](../../ADR.md#adr-007--esbuild-for-custom-node-packages)
      / [`packages/compiler/AGENTS.md`](../../../packages/compiler/AGENTS.md):
      **wipe-every-compile is no longer the default.** Stable paths stay.
- [x] `CustomPaletteService.update(projectDir, { force?: boolean })` (or
      equivalent). UI Update passes `force: true`.
- [x] Unit tests: helper-file change is a miss; unchanged sources + same
      host stamp is a hit (no esbuild); host-stamp change is a miss; force
      rewrites even on hash match; vanished entry is deleted.

### Phase 3 — Release bundling

- [x] esbuild (already a compiler dependency) in `stage-release` /
      `install-local` / `pack-release`.
- [x] Split entries + externals as locked above.
- [x] Keep `vendor/node-sdk` and `vendor/runtime` as real packages on disk
      (esbuild externals / `file://` identity). Do **not** copy inlined
      workspace `tsc` trees (server, common-nodes, compiler, …) into vendor.
      Bootstrap seed stays at `vendor/server/skeleton/`.
- [x] Proof: published/global `langflower` start graph opens far fewer JS
      files than today’s ~872 (document the measurement method in the land
      notes). Workspace `verify` still uses unbundled `tsc` dist.

## Suggested implementation order

1. Phase 1 (heartbeat + split compiler import + lazy eval). User-visible
   even before cache work.
2. Phase 2 (manifest + skip toolchain on hit + force Update).
3. Phase 3 (release esbuild). Can land after 1–2; does not unblock them.

## Acceptance criteria

1. Running `langflower` (TTY) prints `Starting Langflower...` **before**
   any compile / listen line. A cold start must not sit in silence until
   `Compiling custom nodes`.
2. `langflower --help` and `langflower start` do not load `@langflower/eval`.
3. Unchanged packs + matching host stamp: start does not import
   `typescript` / esbuild; registry loads from existing
   `.cache/nodes/<pack>/<entry>.mjs`. CLI does not claim it compiled if
   it did not.
4. Editing a non-entry helper `.ts` in a pack is a miss; the new bundle
   content is loaded (existing compiler test must keep passing).
5. Palette **Update** force-compiles even when hashes match.
6. `compile_custom_nodes` still hot-swaps (epic 40). After a write +
   compile in one turn, later tool-loop iterations see new handlers.
7. Published / `install-local` CLI uses bundled start/eval chunks with
   `typescript` + esbuild external. Custom peer-only packs still load
   (`file://` host peers — regression from BUG-2026-07-28).
8. Docs listed below match shipped behaviour. STATUS AC1 (web server
   starts) stays honest about remaining catalog-load cost if any.

## Docs on land

- This file → `docs/DONE/EPICS/`; both epic indexes.
- [ADR-007](../../ADR.md#adr-007--esbuild-for-custom-node-packages) —
  incremental cache + lazy compile import; wipe is no longer mandatory
  on every call.
- [`packages/compiler/AGENTS.md`](../../../packages/compiler/AGENTS.md) —
  manifest, pack fingerprint, light discover export, no static
  `compile-project-nodes` from server start.
- [`packages/cli/AGENTS.md`](../../../packages/cli/AGENTS.md) —
  dynamic bin import; eval lazy.
- [`docs/RELEASE.md`](../../RELEASE.md) / stage-release comments — product
  chunks + externals.
- [STATUS.md](../../STATUS.md) AC1 if the start path changes.
- Helper KB only if a Can/Cannot line changes (unlikely).

## Verify

- Intermediate (optional): focused vitest on compiler hit/miss/force and
  CLI bin parse; `verify --quick` while iterating.
- **Close-out (required):** `npm run test` or full
  `node build/tools/agent-run.mjs verify` — unit **and** integration. Do
  not mark this epic done on `--quick` alone. Include compiler pack
  tests and a start-path test that `compile-project-nodes` is not in the
  static import graph of `create-server`.

## Links

- CLI bin (static import today):
  [`packages/cli/bin/langflower.js`](../../../packages/cli/bin/langflower.js)
- Server warm palette:
  [`packages/server/src/create-server.ts`](../../../packages/server/src/create-server.ts)
- Always-wipe compile:
  [`packages/compiler/src/compile-project-nodes.ts`](../../../packages/compiler/src/compile-project-nodes.ts)
- Discover walk (must feed the fingerprint):
  [`packages/compiler/src/discover-packs.ts`](../../../packages/compiler/src/discover-packs.ts)
- UI Update intent:
  [`packages/ui/src/app/features/palette/components/palette-sidebar.component.ts`](../../../packages/ui/src/app/features/palette/components/palette-sidebar.component.ts)
  `requestCustomPaletteUpdate`
- Product assemble:
  [`build/lib/stage-release.mjs`](../../../build/lib/stage-release.mjs)
