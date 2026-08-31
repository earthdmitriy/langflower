# Releasing `langflower` (npm)

Manual release of the **root** package `langflower`. Workspace packages
(`@langflower/*`, including `@langflower/cli`) are **not** published separately.
Product `dist/` is the bundled CLI (server, catalog, compiler concatenated).
Host peers and the bootstrap skeleton ship under `vendor/`.

## Prerequisites

- Clean git tree (or only intentional release edits)
- npm auth for the publish account (`npm whoami`)
- Node matching root `engines`

## Steps

1. **Bump version** in the root [`package.json`](../package.json) (`version` field).

2. **Gate + pack:**

    ```bash
    npm run pre-release
    ```

    Runs: format → test → build-all → pack-release.  
    Writes publish layout at repo root (`dist/`, `bin/`, `ui-dist/`, `vendor/`) and
    rewrites root `package.json` for publish (strips `workspaces` / scripts).  
    Backs up the monorepo manifest to `.release/package.json.backup`.  
    Optional inspection tarball: `artifacts/langflower-<version>.tgz`.

3. **Publish** (from repo root):

    ```bash
    npm publish
    ```

4. **Restore monorepo `package.json`:**

    ```bash
    cp .release/package.json.backup package.json
    # or: git checkout -- package.json
    ```

5. **Tag:**

    ```bash
    git tag vX.Y.Z
    git push origin vX.Y.Z
    ```

## Dogfood without registry

```bash
npm run install-local
```

Builds the same product shape under `.local-install/langflower` and
`npm install -g --install-links` it.

## Notes

- Do **not** publish `@langflower/node-sdk` or other workspace packages separately.
- Do **not** raise Vitest `testTimeout` to green-wash slow suites.
- After a bad publish, prefer a patch version; npm unpublish policy is limited.
- `pack-release` hoists production registry dependencies of the inlined
  workspace packages and the CLI onto the root `langflower` `package.json`
  (e.g. `rxjs`, `openai`, `typescript`, `esbuild`). Nested `file:./vendor/…`
  packages alone do not reliably install those deps for consumers.
- **Product CLI bundle:** `assembleProduct` esbuild-bundles
  `packages/cli/dist/index.js` into product `dist/` (`build/lib/bundle-product.mjs`).
  Eval and `compileProjectNodes` are split chunks (dynamic `import()`). External:
  `typescript`, `esbuild` / `@esbuild/*`, `@langflower/node-sdk`,
  `@langflower/runtime`, `rxjs`, `@rx-evo/stateful-observable` (custom packs
  still `file://` those peers — BUG-2026-07-28). Product chunks get a
  `createRequire` banner so bundled CJS (`commander`) can `require('node:*')`.
  Workspace `tsc` dist and
  `npm run start -w @langflower/cli` stay unbundled. Proof: count `*.js` in
  staged `dist/` (a handful of chunks) vs `countUnbundledWorkspaceJs()` (~450
  workspace emit files, plus former registry ESM opens).
- **Product `vendor/`** is only host peers (`node-sdk`, `runtime`) plus
  `vendor/server/skeleton/`. Server, catalog, compiler, and other workspace
  `tsc` trees are inlined into `dist/` and are **not** copied into vendor.
- The tarball includes [`docs/public/`](public/README.md) (simplified user
  manuals) so links from the root [`README.md`](../README.md) resolve after
  `npm install` / on the npm package page. Full engineering docs under `docs/`
  stay monorepo-only. `pack-release` asserts README-referenced public manuals
  are present; `install-local` copies `docs/public` into the staged product.
- Release builds temporarily set `sourceMap` / `declarationMap` to `false` in
  [`tsconfig.base.json`](../tsconfig.base.json) (backup under `.release/`), then
  restore the file. Product CLI `dist/` is esbuild with `sourcemap: false`.
  Host-peer vendor trees / UI staging skip leftover `*.map` on copy (`tsc`
  does not delete maps from a previous `sourceMap: true` workspace build) and
  still walk those trees as a safety net so `pack-release` never ships maps.
