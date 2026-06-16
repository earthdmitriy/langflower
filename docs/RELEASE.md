# Releasing `langflower` (npm)

Manual release of the **root** package `langflower`. Workspace packages
(`@langflower/*`, including `@langflower/cli`) are **not** published; they ship
inside the tarball under `vendor/`.

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
- `pack-release` hoists every production registry dependency of `vendor/*` and
  the CLI onto the root `langflower` `package.json` (e.g. `rxjs`, `ws`,
  `express`). Nested `file:./vendor/…` packages alone do not reliably install
  those deps for consumers.
- The tarball includes [`docs/public/`](public/README.md) (simplified user
  manuals) so links from the root [`README.md`](../README.md) resolve after
  `npm install` / on the npm package page. Full engineering docs under `docs/`
  stay monorepo-only. `pack-release` asserts README-referenced public manuals
  are present; `install-local` copies `docs/public` into the staged product.
- Release builds temporarily set `sourceMap` / `declarationMap` to `false` in
  [`tsconfig.base.json`](../tsconfig.base.json) (backup under `.release/`), then
  restore the file. Staged product also strips any leftover `*.map` files.
