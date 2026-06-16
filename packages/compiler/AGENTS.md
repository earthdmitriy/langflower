# @langflower/compiler

Discover, esbuild-bundle, and cache project custom-node packs under
`.langflower/nodes/`. Returns definitions for palette + runtime resolve.
Writes pack `COMPILATION_ERRORS.md` on failure (no silent fails).

## Boundary

- **Owns:** pack discovery (`export default` entries), esbuild ESM bundle,
  content-hash cache under `.langflower/.cache/nodes/`, structured compile
  errors + on-disk markdown parity.
- **Must not depend on:** server, UI, common-nodes, shared, websocket-bridge.
- **May depend on:** `esbuild`, `@langflower/node-sdk` (validation / author API).
- **Consumers:** `@langflower/server` (thin compose into `customPalette` +
  resolve registry).

## Public imports

```typescript
import { compileProjectNodes } from '@langflower/compiler/compile-project-nodes';
```

No `index.ts` barrel.

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
  `langflower` OK). Cache keys include a host runtime stamp so install upgrades
  and the rewrite policy invalidate stale bare-import artifacts.

## Compile pipeline

Per **pack**, then per **`export default` entry** (independent):

1. If `tsconfig.json` exists → `tsc --noEmit` (programmatic). Entry-file
   diagnostics fail only that entry; shared non-entry errors fail all entries
   in the pack. Host peers / `@types/node` come from the compiler host.
2. esbuild only entries that passed typecheck.
3. Return `{ nodes, errors }` (partial success OK). Pack
   `COMPILATION_ERRORS.md` lists failed entries only.
