---
kind: adr
owner: docs
covers: []
status: current
id: ADR-030
supersedes: []
superseded-by: []
package: docs
---

## ADR-030 — Custom node pack layout & npm model

**Status:** accepted · **Date:** 2026-07-24

**Context:** Before shipping `@langflower/compiler` and bootstrap seed copy,
the product must lock how project custom nodes live on disk: folder layout,
default pack id, entry discovery, and who runs `npm install`. Ambiguity here
forks epic 32/33 and dogfood demos.

**Alternatives considered:**

- **Single root `.langflower/nodes/package.json`** — simpler multi-file start;
  weak reuse / publish story; rejected as default seed.
- **Per-pack `package.json` (chosen)** — each subdirectory under
  `.langflower/nodes/` is a shareable unit; one seed pack start cost ≈ one
  `npm i`.
- **Required `index.ts` barrel** — rejected; compiler discovers `export default`
  on `*.ts` / `*.tsx` files.
- **Generated root `nodes/types.ts` re-export** — rejected for demos/seed;
  authors import `@langflower/node-sdk` directly.
- **Server silent `npm install`** — rejected; author (or agent) installs in the
  pack; bootstrap never auto-installs.

**Decision:**

1. Default seed pack id **`my-nodes`** at `.langflower/nodes/my-nodes/`.
2. Each pack has its own `package.json` with peer/dependency on
   `@langflower/node-sdk` (not the full runtime tree as author concern).
3. Entry files: **no** required `index.ts`; `export default` a definition or
   array. Author API default: **`defineNode`**.
4. Draft skeleton lives at
   [`packages/server/skeleton/nodes/my-nodes/`](../../packages/server/skeleton/nodes/my-nodes)
   (epic 33 copies into projects; future `dist/skeleton/` is packaging S1).
5. Author dependencies allowed in pack `dependencies`; bundled later by the
   compiler ([ADR-007](./007-esbuild-for-custom-node-packages.md)).

**Tradeoffs accepted:**

- (+) Pack can be copied or published; clear peer on the host SDK.
- (+) One seed pack keeps first-run ceremony low (`npm i` once in `my-nodes/`).
- (−) Slightly more ceremony than a single root `package.json`.
- (−) Authoring packs need Custom → Update after edits; peer deps come from
  the host.

**Consequences:**

- Docs / demo / skeleton must not reintroduce `index.ts` or `nodes/types.ts`
  as the contract.
- Epic 32 discovers packs as subdirs of `.langflower/nodes/` (ignore
  `node_modules`, cache, dotfiles).
- Epic 33 copies the locked skeleton path
  (`packages/server/skeleton/`, shipped in package `files`); never overwrites
  an existing `nodes/my-nodes` (or other minimum-seed paths).
- **SDK version in a pack manifest is documentation, not resolution.** The
  compiler always resolves `@langflower/node-sdk` (plus `rxjs`,
  `@rx-evo/stateful-observable`) from the **Langflower install tree**
  (`HOST_PEER_PACKAGES` /
  [`resolve-host-types.ts`](../../packages/compiler/src/resolve-host-types.ts)),
  for both tsc `paths` and the esbuild externals. A pack therefore compiles and
  runs against the host SDK regardless of the range it declares; a stale pin
  never downgrades anything and never pulls a second SDK copy.
- **Skeleton packs pin the exact current SDK version** (asserted by
  `tests/unit/release/skeleton-sdk-pin.test.ts`), so a seeded project always
  starts from the SDK the product ships. Version and upgrade mechanics —
  including what happens to an older pack after an SDK bump —
  [RELEASE.md § Pack ↔ SDK compatibility](../guides/RELEASE.md).

---
