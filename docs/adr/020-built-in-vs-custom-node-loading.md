---
kind: adr
owner: docs
covers: []
status: current
id: ADR-020
supersedes: []
superseded-by: []
package: docs
---

## ADR-020 — Built-in vs custom node loading

**Status:** accepted · **Date:** 2026-07-20 · **Updated:** 2026-07-24

**Context:** Product requires one **authoring** contract so built-in nodes prove
the extension path for `.langflower/nodes/` packs ([PRODUCT.md](../product/PRODUCT.md)).
Loading every built-in through the custom-node esbuild scan on each start would
hurt startup time. Pack layout: [ADR-030](./030-custom-node-pack-layout-and-npm-model.md).

**Alternatives considered:**

- **Same bundler/scan path for built-ins and custom** — maximum parity; slower
  cold start; harder to ship a fixed catalog with the npm package.
- **Different authoring APIs** — faster shortcuts for built-ins; breaks the
  “write custom like built-in” guarantee.
- **Sandbox + scan everything including built-ins at runtime** — deferred with
  user-node sandbox ([TBD.md](../_work/TBD.md) TBD-001).

**Decision:**

- **Authoring:** built-ins (`@langflower/common-nodes`) and custom packs use the
  same SDK (`@langflower/node-sdk`). Default author path is **`defineNode`**;
  `defineReactiveNode` is advanced (RxJS / StatefulObservable).
- **Loading:** built-ins are imported from the published package into the
  palette/registry (no per-start bundler). Custom packs under
  `.langflower/nodes/<pack>/` are scanned and esbuild-bundled
  ([ADR-007](./007-esbuild-for-custom-node-packages.md)) by
  `@langflower/compiler`, exposed on `customPalette.snapshot` (system catalog
  stays on `palette.snapshot`).

**Tradeoffs accepted:**

- (+) Fast startup; one mental model for writing nodes.
- (+) Custom path exercises the real extension surface.
- (−) Two load paths to keep in sync (registry shape, port metadata).
- (−) Sandboxed execution of arbitrary custom code still deferred.

**Consequences:**

- UI merges system `palette.snapshot` with `customPalette.snapshot` for canvas
  / execution lookups; the Custom section reads only `customPalette.snapshot`.
- Do not move built-ins onto the scan path “for purity” without a startup budget.
- Revisit when sandboxed user-node execution ships.

---
