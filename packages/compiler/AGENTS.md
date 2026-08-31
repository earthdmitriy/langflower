# @langflower/compiler

Discover, esbuild-bundle, and cache project custom-node packs under
`.langflower/nodes/`. Returns definitions for palette + runtime resolve.
Writes pack `COMPILATION_ERRORS.md` on failure (no silent fails).

## Boundary

- **Owns:** pack discovery (`export default` entries), esbuild ESM bundle,
  cache under `.langflower/.cache/nodes/<pack>/<entry>.mjs` (stable paths for
  `git diff`), pack fingerprint + sidecar `manifest.json`, structured compile
  errors + on-disk markdown parity. `discover-packs` / `hasCustomNodePacks` and
  `load-project-nodes` stay free of static `typescript` / esbuild so server
  start can scan and **hit-load** without the compiler toolchain.
- **Must not depend on:** server, UI, common-nodes, shared, websocket-bridge.
- **May depend on:** `esbuild`, `@langflower/node-sdk` (validation / author API).
- **Consumers:** `@langflower/server` (thin compose into `customPalette` +
  resolve registry). Published CLI concatenates this package into product
  `dist/` chunks; `compile-project-nodes` stays a split chunk with `typescript`
  / esbuild external (`build/lib/bundle-product.mjs`).

## Public imports

```typescript
import { compileProjectNodes } from '@langflower/compiler/compile-project-nodes';
import { hasCustomNodePacks } from '@langflower/compiler/discover-packs';
import { loadProjectNodes } from '@langflower/compiler/load-project-nodes';
```

No `index.ts` barrel.

`loadProjectNodes` is the start-path API: cache hit loads existing `.mjs`;
miss or `{ force: true }` dynamically imports `compile-project-nodes`.
`compileProjectNodes` is the toolchain (typecheck + esbuild).

## Bundle policy

| Class                                                         | Policy                                                               |
| ------------------------------------------------------------- | -------------------------------------------------------------------- |
| Author deps                                                   | Bundle into ESM cache artifact                                       |
| `@langflower/node-sdk`, `rxjs`, `@rx-evo/stateful-observable` | External (host); rewrite to absolute `file://` from compiler install |
| `node:*`                                                      | External (bare)                                                      |
| Missing author `dependencies` in pack `node_modules`          | Entry error — no auto `npm install`                                  |

Host peers resolve from **this package’s install tree** (`import.meta.resolve`

- package.json `types` / `exports.types` for tsc; same resolve → `file://` in
  the esbuild artifact for runtime load), not from the user project. Peer-only
  packs typecheck **and** load without project/pack `node_modules` (global
  `langflower` OK). Load uses a unique temp `import()` so Node ESM / Vitest
  cannot reuse the previous module.

## Cache

Sidecar `.langflower/.cache/nodes/manifest.json` (gitignored — host stamp is
machine-specific). Pack fingerprint hashes all pack `.ts` / `.tsx` (same walk
as discover), `package.json`, `tsconfig.json`, lockfiles, plus a **host stamp**
(resolved peer paths/versions + rewrite policy id `host-peer-file-url-v1`).
Failed packs are not recorded so the next start retries. Wipe the whole cache
root only on empty `nodes/`, `{ force: true }`, corrupt manifest (treated as
miss), or `EBUSY` / `EPERM` recovery. Incremental compile deletes vanished pack
dirs and dirty-pack outfiles; it does not wipe siblings.

## Compile pipeline

Per **dirty pack** (or every pack when `force`), then per **`export default`
entry** (independent):

1. If `tsconfig.json` exists → `tsc --noEmit` (programmatic). Entry-file
   diagnostics fail only that entry; shared non-entry errors fail all entries
   in the pack. Host peers / `@types/node` come from the compiler host.
2. esbuild only entries that passed typecheck, to
   `.langflower/.cache/nodes/<pack>/<entry>.mjs`.
3. Return `{ nodes, errors }` (partial success OK). Pack
   `COMPILATION_ERRORS.md` lists failed entries only.

Pack `tsconfig.json` is the typecheck config. NodeNext packs that import with
a **`.ts` suffix** must set `allowImportingTsExtensions: true` (requires
`noEmit`). Missing that flag fails `tsc` and the pack does not compile.
Seed: hello-embed `tsconfig.json`. `my-nodes` uses extensionless imports and
omits the flag.
