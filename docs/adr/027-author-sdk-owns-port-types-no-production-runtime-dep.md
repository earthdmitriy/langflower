---
kind: adr
owner: docs
covers: []
status: current
id: ADR-027
supersedes: []
superseded-by: []
package: docs
---

## ADR-027 — Author SDK owns port types (no production runtime dep)

**Status:** accepted · **Date:** 2026-07-23

**Context:** Custom-node packs must peer on the author SDK
(`@langflower/node-sdk`) plus
`rxjs` / `@rx-evo/stateful-observable` — **not** the full
`@langflower/runtime` tree (editor/runner). Meanwhile
`defineReactiveNode` / `getInstance()` must remain structurally usable by
`RuntimeEditor.addNode`. Importing `PortMeta` / `RuntimeNode` /
`RuntimeWireType` from runtime into the SDK reintroduced that dependency
even for `import type`.

**Alternatives considered:**

- **Keep SDK → runtime dependency** — single source of truth for port types;
  rejected: custom authors inherit runtime as a peer/transitive concern.
- **Invert ownership (runtime imports port types from SDK)** — one owner;
  rejected: execution kernel would depend on the authoring package (wrong DAG
  direction for a thin runtime).
- **New leaf package (`@langflower/wire` / port-types)** — both depend on it;
  deferred: YAGNI for four types; revisit if twins proliferate beyond this
  boundary.
- **Structural twins in SDK + compile-time parity (chosen)** — SDK purity;
  drift risk mitigated by tests.

**Decision:**

1. Author SDK **owns** `PortMeta`, `WireType`, `MetaFromStatefulObservable`,
   and `ReactiveNodeInstance` under
   `packages/node-sdk/.../port-meta.ts` / `types.ts`.
2. Production `package.json` of the SDK lists **only** `rxjs` and
   `@rx-evo/stateful-observable`. `@langflower/runtime` is a **devDependency**
   (samples / parity only).
3. `WireType` keeps the same TypeScript brand string as runtime
   `RuntimeWireType` (`'RuntimeWireType'`) so bypass maps stay assignable
   without casts at the editor boundary.
4. Lock the twin with
   [`runtime-parity.types.test.ts`](../../packages/node-sdk/src/node-factory/define-reactive-node/runtime-parity.types.test.ts):
   `ExpectEqual` on `PortMeta` / `WireType`, bidirectional assignability of
   instance core ↔ `RuntimeNode` (minus `nodeId` / `bypassConnections`), and
   the `addNode` argument shape.

This is an **acceptable twin** for node-sdk purity — same class of tradeoff as
ADR-014 structural matches between tools and node-sdk, but narrower
and explicitly gated.

**Tradeoffs accepted:**

- (+) Custom / `defineNode` authors do not take a production dependency on
  runtime.
- (+) Runtime stays free of an upward dependency on the authoring SDK.
- (−) Two declarations of port meta / wire brand; must update both when the
  contract changes.
- (−) Brand string shared by convention (`'RuntimeWireType'`) — renaming
  either side without the other breaks assignability and the parity test.

**Consequences:**

- Package DAG: SDK does not depend on runtime in production; see
  [PRINCIPLES.md](../architecture/PRINCIPLES.md) § Package DAG.
- Changing `PortMeta` / wire / instance fields requires updating **both**
  packages and keeping `runtime-parity.types.test.ts` green.
- Revisit trigger: prefer a shared leaf package if a third consumer needs the
  same types, or if parity failures become frequent.

---
