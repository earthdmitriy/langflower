---
kind: adr
owner: docs
covers: []
status: current
id: ADR-004
supersedes: []
superseded-by: []
package: docs
---

## ADR-004 — Functional / reactive style with RxJS

**Status:** accepted · **Date:** 2026-06-16 · **Updated:** 2026-07-22

**Context:** The editor, registry, internal WebSocket bridge, and runtime expose
facts and intents over time. Mutable service fields and command-shaped UI state
create stale reads, duplicate server state, and hidden ordering between features.
The runtime itself is reactive-only: nodes bind `StatefulObservable` ports and
execution demand enters through `RuntimeFacade.runner`.

**Alternatives considered:**

- **Imperative services + mutable fields** — lower RxJS learning curve, harder to
  compose bridge facts, hydration, execution, and canvas updates without stale
  reads.
- **NgRx / Akita store** — structured global state, but adds a second event/store
  model beside the typed internal bridge and node/runtime streams.
- **Angular signals-only** — fine for UI-local state; less natural for server-side
  streams, cross-feature temporal folds, and WebSocket orchestration already
  standardized on RxJS.
- **RPC/command-first UI state** — each request owns a response and local mutation;
  rejected because the bridge is broadcast, server facts are authoritative, and
  reconnect hydration must be reconciled explicitly with live deltas.

**Decision:**

- **Bridge-first UI state:** clients emit typed `*.requested` intents and consume
  authoritative bridge facts/snapshots as Observables. Normalize them to tagged
  actions, `merge`/`combineLatest` deliberately, reduce each concern through one
  pure immutable `scan` fold, then expose selectors/projections.
- Hydration, new-run identity, interrupt/done, and other resets are explicit fold
  actions with defined precedence over live deltas; they are not incidental
  resubscriptions or mutable service flags.
- UI-local signals are projections or ephemeral drafts. Cross-feature execution
  concerns may live in UI services as one fold consumed by multiple feature
  surfaces.
- Node authoring uses `defineReactiveNode.bind` and `StatefulObservable`.
  Execution uses `RuntimeFacade.editor` plus `RuntimeFacade.runner`; the bridge
  carries `runner.*` intents/facts. There is no parallel batch engine or
  `ReactivePortBus` contract.
- Immutable updates use `readonly` types (not `Object.freeze`).
- Side effects remain named edges. Allowed forms are imperative host boundaries
  (HTTP, FS, WebSocket, process, storage, ngDiagram), Angular `effect()` for
  derived-signal → host synchronization, telemetry-only RxJS `tap`, and owned
  terminal subscriptions with cleanup. None may act as a hidden state reducer.

**Tradeoffs accepted:**

- (+) Reconnect hydration and live bridge ordering have explicit, unit-testable
  policies instead of hidden mutable writers.
- (+) Runtime, server, and UI share a demand/fact model without DTO stores or
  execution-mode adapters.
- (+) Pure folds make ordering, reset, and stale-hydration bugs reproducible.
- (−) Tagged actions and selectors add vocabulary for small concerns.
- (−) RxJS operator choice and subscription lifecycle require discipline.
- (−) ngDiagram remains an imperative host boundary requiring a real shape
  conversion where its model differs from Langflower domain types (ADR-008).

**Consequences:**

- Follow [PRINCIPLES.md § Standard flow](../architecture/PRINCIPLES.md#standard-flow) for UI
  orchestration and its side-effect allow-list.
- Prefer `async` pipe / `toSignal` projections; terminal subscriptions require
  explicit edge ownership and cleanup.
- Keep one concern in one fold; split independent concerns and combine their
  projections instead of duplicating state.
- Graph/fold updates return new objects, never mutate upstream values.

---
