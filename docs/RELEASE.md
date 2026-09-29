# Releasing Langflower

Three **independent** artifacts. Cut any one without the others. Semver and
git tags are not tied together.

- **Product CLI** `langflower` — root npm package; tag `vX.Y.Z`. Version lives
  in root [`package.json`](../package.json). Other workspace packages
  (`@langflower/cli`, `@langflower/runtime`, …) are **not** published
  separately. Product `dist/` is the bundled CLI (server, catalog, compiler
  concatenated). Host peers and the bootstrap skeleton ship under `vendor/`.
- **Author SDK** [`@langflower/node-sdk`](#publishing-langflowernode-sdk) —
  scoped npm package; tag `node-sdk-vX.Y.Z`. Independent registry release.
- **Desktop launcher** — not on npm. GitHub Release zips on tag
  `launcher-vX.Y.Z` (must match [`launcher/Cargo.toml`](../launcher/Cargo.toml)
  `version`). Workflow:
  [launcher-release.yml](../.github/workflows/launcher-release.yml).

Publishing the SDK to npm does **not** change what the next `langflower`
tarball vendors. The product copies `vendor/node-sdk` from this tree only
during product `pack-release`.

## Prerequisites

Shared for every cut:

- Clean git tree, or only the intentional version-bump commit for this
  artifact
- npm auth for the publish account (`npm whoami`) — npm artifacts only
- Node matching root `engines.node` (today **≥ 22.22.3**)

## Product CLI: `langflower` (npm)

1. **Bump version** in the root [`package.json`](../package.json) (`version`
   field). Commit that bump (and only that) **before** packing.

2. **Typecheck** (`pre-release` does **not** run it):

    ```bash
    npm run typecheck
    ```

3. **Gate + pack:**

    ```bash
    npm run pre-release
    ```

    Runs: format → test → build-all → pack-release.
    Writes publish layout at repo root (`dist/`, `bin/`, `ui-dist/`, `vendor/`)
    and rewrites root `package.json` for publish (strips `workspaces` /
    scripts).
    Backs up the monorepo manifest to `.release/package.json.backup`.
    Optional inspection tarball: `artifacts/langflower-<version>.tgz`.

    Do **not** commit `dist/`, `bin/`, `ui-dist/`, `vendor/`, or the rewritten
    publish `package.json`.

4. **Publish** (from repo root):

    ```bash
    npm publish --access public
    ```

5. **Restore monorepo `package.json`:**

    ```bash
    cp .release/package.json.backup package.json
    # or: git checkout -- package.json
    ```

6. **Tag** (suffix must match the root `version`). Pushing the tag does **not**
   create a GitHub Release page; that page is for `launcher-v*` zips.

    ```bash
    git tag vX.Y.Z
    git push origin vX.Y.Z
    ```

7. **Confirm:**

    ```bash
    npm view langflower version
    ```

<a id="publishing-langflowernode-sdk"></a>

## Publishing `@langflower/node-sdk`

Independent registry release of the author SDK. Semver and git tags are **not**
tied to root `langflower` (`vX.Y.Z`) or the launcher (`launcher-v*`).

Product `langflower` still vendors `vendor/node-sdk` for host `file://`
identity (BUG-2026-07-28). Do **not** switch that peer to the registry in the
same change. Revisit only if the host later resolves the SDK from npm instead
of `vendor/`.

1. **Bump** `version` in
   [`packages/node-sdk/package.json`](../packages/node-sdk/package.json)
   when the public API changes. First registry cut is `0.1.0`. Then update the
   skeleton pack manifests to the same **exact** version (see
   [Pack ↔ SDK compatibility](#pack--sdk-compatibility)) —
   `tests/unit/release/skeleton-sdk-pin.test.ts` fails until they match.
   Commit the SDK + skeleton pin bump **before** tagging.

2. From the repo root (clean tree, npm auth, Node matching `engines`):

    ```bash
    npm run typecheck
    npm run test
    node build/tools/agent-run.mjs build-package nodeSdk
    npm pack -w @langflower/node-sdk --dry-run
    npm publish -w @langflower/node-sdk --access public
    ```

    Tarball `files` is `dist` only. Emit excludes `src/**/test/**` fixtures.
    Reject sources, tests, and a production `@langflower/runtime` dependency.
    Workspace `tsc` may include `.map` files; product `pack-release` still
    strips maps from `vendor/node-sdk`.

3. **Tag** (suffix must match the SDK version):

    ```bash
    git tag node-sdk-vX.Y.Z
    git push origin node-sdk-vX.Y.Z
    ```

Do **not** publish `@langflower/runtime` or other workspace packages this way.

### Pack ↔ SDK compatibility

Three versions can disagree: the SDK in the product install tree
(`vendor/node-sdk`), the range a custom pack declares, and the version the pack
was authored against.

**Resolution rule:** the compiler always resolves `@langflower/node-sdk`,
`rxjs`, and `@rx-evo/stateful-observable` from the **Langflower install tree**
(`HOST_PEER_PACKAGES` in
[`resolve-host-types.ts`](../packages/compiler/src/resolve-host-types.ts)) — for
tsc `paths` and as esbuild externals. The pack manifest entry is an
editor/documentation hint; it never selects the implementation, and a pack-local
`node_modules/@langflower/node-sdk` is not loaded.

Consequences of an upgrade:

| Situation                                            | Result                                                                                                                                                                                                                      |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product SDK newer than the pack's declared version   | Pack compiles and loads against the **new** SDK. `hostRuntimeStamp()` includes peer versions, so the compile cache is invalidated and every pack is recompiled after the upgrade.                                           |
| New SDK is backward compatible                       | Nothing to do; the stale manifest range is cosmetic.                                                                                                                                                                        |
| New SDK removed or changed API the pack used         | That pack fails typecheck: errors land in the pack's `COMPILATION_ERRORS.md`, the pack is skipped, and the palette keeps working with the remaining nodes. Fix the pack source (agent or author), then **Custom → Update**. |
| Pack declares a newer SDK than the installed product | Not enforced — no version gate. Missing API surfaces as a normal compile error in the same place.                                                                                                                           |

Therefore: **keep the seeded skeleton on the exact current SDK version** so new
projects start aligned (`packages/server/skeleton/nodes/*/package.json`,
asserted by `tests/unit/release/skeleton-sdk-pin.test.ts`). Never mass-rewrite
pins in existing user projects — they are inert. Treat an SDK removal or rename
as a breaking change for packs: bump the SDK minor/major and note the migration,
because already-authored packs will fail to compile after the upgrade.

## Desktop launcher (GitHub Release)

The Slint supervisor is **not** part of `npm publish`. Do **not** attach
launcher zips to npm tags `vX.Y.Z`. Local build, portable Rust, and CI matrices:
[launcher/docs/build-and-release.md](../launcher/docs/build-and-release.md)
and [launcher/README.md](../launcher/README.md).

1. **Bump** `version` in [`launcher/Cargo.toml`](../launcher/Cargo.toml)
   and keep `Cargo.lock` in sync. Commit that bump (and the lockfile if it
   changed) **before** tagging.

2. **Optional local check:** `npm run launcher:test`. If the change set also
   includes TypeScript or docs the monorepo gates, run `npm run typecheck`
   and `npm run test` as well. Launcher tests are **not** part of
   `pre-release` / `verify`.

3. **Tag and push** (suffix must match the crate version or the tag-push job
   fails):

    ```bash
    git tag launcher-vX.Y.Z
    git push origin launcher-vX.Y.Z
    ```

    Manual **Run workflow** on
    [launcher-release.yml](../.github/workflows/launcher-release.yml)
    can publish the current SHA to a `launcher-v*` tag without that check.

4. **Wait** for the workflow. Confirm GitHub Release **Launcher X.Y.Z** has
   all five assets:

    - `langflower-launcher-windows-x64.zip`
    - `langflower-launcher-windows-arm64.zip`
    - `langflower-launcher-macos-arm64.zip`
    - `langflower-launcher-macos-x64.zip`
    - `SHA256SUMS.txt`

    Windows zips contain `langflower-launcher.exe` (unsigned — SmartScreen
    will warn). macOS zips contain `Langflower.app`, ad-hoc signed and not
    notarized, so Gatekeeper still warns: right-click the **app** → Open.
    Node.js ≥ 22 and `npm install -g langflower` remain required.

## Dogfood without registry

```bash
npm run install-local
```

Builds the same product shape under `.local-install/langflower` and
`npm install -g --install-links` it.

## Notes

- Do **not** publish workspace packages other than `@langflower/node-sdk`
  (see above). Product `pre-release` / root `npm publish` is unchanged.
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
