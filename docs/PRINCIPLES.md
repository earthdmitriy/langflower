# Coding Principles

Non-negotiable rules for all Langflower code. Summarized in root `AGENTS.md`.

## Functional / reactive / declarative

- Pure functions and immutable transformations over imperative mutation.
- RxJS streams for state and event composition; side effects stay at named edges.
- Angular: `async` pipe; signals only when they integrate cleanly with RxJS.
- Event-driven design: create an observable pipe and define transformations
  inside the pipe — do not `.subscribe` to write fields.
- Patterns (merge → scan → `toSignal`, when subscribe is OK, anti-patterns):
  [REACTIVITY.md](REACTIVITY.md).
- **`withLatestFrom` is forbidden** unless a human explicitly confirms that
  call site. Prefer `combineLatest` (or redesign). Details:
  [REACTIVITY.md](REACTIVITY.md) § `withLatestFrom`.

### Standard flow

Build stateful concerns in this visible order:

1. **Source facts and intents** — consume authoritative bridge/runtime facts and
   local user intents as streams. Do not disguise a requested intent as a fact
   that already happened.
2. **Normalize tagged actions** — map boundary-specific frames to a closed
   discriminated union (`{ type: 'hydrate', ... }`, `{ type: 'received', ... }`,
   `{ type: 'hardReset', ... }`). Validation and protocol decoding happen here.
3. **Merge or combine** — `merge` independent actions in time order.
   `combineLatest` only when one projection genuinely requires the current value
   of every source; it is not a substitute for carrying facts in the action.
4. **Pure `scan` fold** — one concern has one state type and one fold. The fold
   receives `(state, action)`, returns a new state, and performs no I/O, logging,
   signal writes, or service calls.
5. **Selector / projection** — derive view-specific values with `map`,
   `distinctUntilChanged`, computed selectors, or pure functions. Do not put
   presentation fields into the source fold merely to avoid a selector.
6. **Edge effect** — render, send, persist, or call an imperative host only after
   state/action preparation is complete.

Do not split one state concern across several competing `scan`s or mutable
fields. Split genuinely independent concerns into separate folds, then combine
their projections. Resets and hydration are first-class tagged actions with
explicit precedence: define what starts a new identity, what a hard reset clears,
and whether a late snapshot may overwrite live deltas. Never encode reset policy
as an incidental `startWith`, resubscription, or mutable flag outside the fold.

### Reactive taxonomy

Use the model that owns the concern; do not wrap one model in another:

- **UI orchestration — RxJS.** Bridge facts, local intents, cross-feature state,
  hydration, and view projections use the standard flow above. UI services may
  own cross-feature folds when the concern spans several feature surfaces.
- **Node authoring — `bind` + `StatefulObservable`.** A
  `defineReactiveNode` binds typed input/output port state with
  `makeInput`, `configureOutput`, and `combineInputs`. Node state follows port
  activation and must not be rebuilt as a UI-style event store.
  `StatefulObservable` status (**inactive / loading / value / error**) is part
  of the dataflow — use stream errors for visible refusals; never fake port
  values to clear loading or silently `EMPTY`-drop a failure the canvas should
  show ([LLM_NODES.md](LLM_NODES.md) § Port events).
- **Runtime demand — `RuntimeFacade` + `runner.*`.** `RuntimeFacade.editor`
  owns the executable graph; `RuntimeFacade.runner` wires demand, start,
  resume, interrupt, and telemetry. Across the bridge, clients emit
  `runner.*.requested` intents and fold authoritative `runner.*` facts. There
  is no separate batch execution model or `ReactivePortBus`.

### Side-effect allow-list

Side effects are allowed only at an identifiable edge:

- imperative host edges: HTTP, filesystem, WebSocket, process APIs, browser
  storage, and ngDiagram/canvas mutation;
- an Angular `effect()` that synchronizes an already-derived signal with an
  imperative host API; it must not become a hidden reducer or copy state between
  services;
- RxJS `tap` for telemetry, diagnostics, or tracing only — never domain-state
  mutation or control flow;
- a terminal subscription that invokes an edge and has explicit lifecycle
  ownership/cleanup.

Event handlers may emit intents into the flow. Any other state change belongs in
a pure fold or immutable transform, not in `subscribe`, `tap`, or `effect`.

## Composer entry points

When a flow has several ordered steps, do **not** hide the call stack in a
chain where `A` calls `B`, `B` calls `C`, `C` calls `D`. That scatters
ownership of order and makes the entry point unreadable.

**Norm:** one **composer** is the entry point. It lists steps in execution
order. Steps are siblings — they do not call the next step.

Apply whenever order matters and a reader needs a single place to see it:
setup/wiring/bootstrap, multi-step domain work, handlers that must show
“first X then Y”, value pipelines (`T → U → V`), or steps with side effects.

Steps may be pure transforms, perform side effects, close over shared
context, or thread a context object through the sequence. A value pipeline
(each step’s return feeds the next) is **one** valid mode — not the only
one.

```typescript
// BAD — order buried in nested callers
const run = (input: Input) => stepA(input); // stepA calls stepB → stepC

// GOOD — composer is the entry; order is explicit
export const runFeature = (input: Input): Output => {
	const a = stepA(input);
	const b = stepB(a);
	stepC(b); // side effect OK
	return stepD(b);
};
```

Prefer explicit sequential calls in the composer body. A `pipe`-style helper
is fine in spirit when it keeps the same flat sibling list; do **not** add
[`typed-pipe`](https://www.npmjs.com/package/typed-pipe) (or lodash `flow` /
fp-ts) as a dependency for this — capable for transforms, closures, and
side effects, but not adopted (YAGNI / package maturity). Async stream
composition stays RxJS — see [REACTIVITY.md](REACTIVITY.md).

Mark the composer with a short call-order comment or JSDoc so the sequence
stays visible without opening every step. Example of the pattern in the
server bridge (not the definition of the rule):
[`packages/server/src/bridge/attach-langflower-bridge.ts`](../packages/server/src/bridge/attach-langflower-bridge.ts).

## Feature-sliced structure

Langflower uses an **adapted, pragmatic feature-sliced model**, not canonical
Feature-Sliced Design. Prefer vertical ownership and explicit dependency
direction; do not introduce FSD layer names or public-api barrels for ceremony.

### Terms and ownership

- **Package** — deploy/build boundary under `packages/`, with dependencies
  declared in `package.json`.
- **Slice** — a cohesive product/domain capability inside a package
  (`features/editor/`, `ai/openai-llm/`, `kb/`). It owns implementation, tests,
  local contracts, and feature-specific projections.
- **Unit** — the smallest colocated implementation cluster: usually one
  consumer file plus its test and, only when needed, sibling helpers/components.
- **Kernel / Platform** — low-level capability with no product-feature
  ownership: runtime graph semantics, WebSocket transport, project I/O, or
  framework/host integration. A kernel is not a dumping ground named `shared`.

Feature ownership follows behaviour, not screen location. A feature owns its
local UX and actions. A UI service may own a **cross-feature fold** when one
authoritative concern (runner gate, execution feed, HITL, permissions) drives
several surfaces; features consume its selectors and emit intents rather than
maintaining parallel state.

ngDiagram is an imperative platform boundary. Vendor models and mutations stay
inside canvas/diagram components and bridge services. Workflow, runtime, and
feature state must use Langflower domain shapes; convert only where a real
vendor shape differs, and never cache a mirrored copy merely to resynchronize it.

### Package DAG

The checked-in `package.json` dependencies are the executable DAG; this summary
uses `dependency → consumer`:

```text
node-sdk → common-nodes
runtime ─────────→ common-nodes   (execution; no authoring SDK dep)
tools ───────────→ common-nodes
runtime + node-sdk + websocket-bridge → shared
runtime + node-sdk + tools + common-nodes
  + shared + websocket-bridge → server
common-nodes + node-sdk + runtime + shared
  + websocket-bridge → ui
tools → eval
shared + websocket-bridge → langflower-mcp
server + shared + eval → cli
```

`@langflower/node-sdk` (author SDK) does **not** depend on
`@langflower/runtime` for production — port/instance types are owned by the
SDK and locked to runtime via compile-time parity tests
([ADR-027](ADR.md#adr-027--author-sdk-owns-port-types-no-production-runtime-dep)).
Runtime remains a
devDependency of the SDK for tests only.

Do not create reverse imports or package cycles. Kernel/platform packages must
not import their consumers. The thin-server rule below further constrains what
may live in `server` even when the package DAG would technically allow it.

### Import and extraction rules

- A unit may import concrete modules from its own slice. Across slices, depend
  on the owning slice's concrete exported module or move orchestration to the
  package composition/service boundary; do not reach into another feature's
  component internals.
- Higher composition may import lower-level slices/kernel modules. Lower-level
  code must not import a feature just to call back upward; pass a typed
  capability or move ownership instead.
- Cross-package imports use declared `package.json` exports. Within a package,
  use concrete paths. `index.ts` and re-export aggregators remain forbidden.
- Keep single-consumer pure helpers and local types above their consumer,
  module-local without `export`. Tests stay beside the code they cover.
- Extract shared code only when **two or more real consumers** need the same
  semantics, the name shrinks those call sites, and the destination can own it
  without an upward dependency. Similar syntax alone is not shared semantics.
- No thin wrappers, global `utils`, registry-of-registries, pass-through
  helpers, or abstractions added «for later». Inline first; extract on proven
  reuse. **YAGNI.**
- **Exception shape, not exception to YAGNI:** a local RxJS
  `OperatorFunction` used in `pipe` / `pipeValue` is the normal way to name
  stream transforms — it is **not** a premature `utils/` module. Prefer
  `source.pipeValue(op(...))` over `(source$) => source$.pipeValue(...)`.
  Details: [REACTIVITY.md](REACTIVITY.md) § Custom RxJS operators vs stream
  wrappers.

Node-specific folder rules: [NODES.md](NODES.md). Common-node catalog layout:
[`packages/common-nodes/AGENTS.md`](../packages/common-nodes/AGENTS.md).

## Thin server — do not grow domain here

`@langflower/server` is a **composer + transport** layer. Agent/project runtime
and provider adapters must not accumulate under `packages/server/src/`.

| Kind of code                                                                                | Package                                                          |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Builtin tools, path fence, permissions, SSRF `webFetch`, crawl persist, KB store, MCP stdio | [`@langflower/tools`](../packages/tools/AGENTS.md)               |
| Catalog nodes, graph helpers, unbound OpenAI factories                                      | [`@langflower/common-nodes`](../packages/common-nodes/AGENTS.md) |
| WS, session/HITL, workflow CRUD, config/secrets bind, checkpoints, inject ctx               | [`@langflower/server`](../packages/server/AGENTS.md)             |

**Rules for agents:**

1. **Do not** add `packages/server/src/{kb,crawl,mcp,llm}/` (or equivalent) for
   domain logic. Inject factories from tools/common-nodes in
   `bridge/build-execution-context.ts` / `bridge/bind-llm-context.ts`.
2. Common nodes may import published **declarative configs and pure runtime
   capabilities** from `@langflower/tools` (for example domain tool configs,
   HTML helpers, or crawl composition). Node `bind` code must not perform host
   I/O directly; I/O is invoked through injected `ctx.*` capabilities or
   attached handlers. Tools must not depend on server, shared, or
   node-sdk.
3. New project I/O or protocol clients → **tools** first. New LLM provider
   HTTP adapters → **common-nodes** (`ai/<provider>/`), with a thin server bind
   for secrets.
4. If server “needs” a helper that is not WS/config/secrets, **move it out** in
   the same change — do not leave a parallel copy in server.

Canonical boundary: [ADR-014](ADR.md#adr-014--project-root-harness-io).

## No adapters, no glue code

**Default stance:** adapter layers and glue code are a **design smell** — they usually
mean two boundaries were not aligned at the source.

- **Fix the boundary first** — unify types and APIs at the producer or consumer so
  call sites stay direct. Do not add `*Adapter`, `*Mapper`, `*Bridge`, or passthrough
  wrappers to paper over mismatches.
- **Glue code is forbidden** — shims that only reshuffle fields, re-export with
  renaming, or translate identical concepts between packages.
- **If an adapter is truly unavoidable** — treat it as an architecture decision, not
  a local workaround. Add a dedicated [ADR](ADR.md) entry with:
    - **Why** the mismatch exists and cannot be fixed now
    - **Alternatives rejected** (including fixing upstream)
    - **Exit criteria** — when the adapter can be removed
- **Review signal:** every existing adapter should be treated as a possible design
  flaw until its ADR explains why it stays.

## Delete obsolete code immediately

When something is replaced, delete it in the same change.

- No deprecation periods, compatibility shims, or parallel APIs kept "for migration".
- No "legacy" callouts in docs or comments — remove the old path.
- Zero-consumer exports, unreachable files, and unused types are **deleted**, not
  marked deprecated and not left unexported “for later”.

**Before finishing a feature (agents):**

1. `node build/tools/agent-run.mjs dead-code` — list unused files, orphan exports,
   unused exported types in `packages/**`.
2. **Delete** every reported item (whole files, symbols, types). Removing the
   `export` keyword alone is not sufficient.
3. `node build/tools/agent-run.mjs check-exports` — confirm no orphan exports remain.
4. Re-run `dead-code` if the change touched public API or removed call sites.
5. `node build/tools/agent-run.mjs verify` — build + exports check + tests.

`check-exports --fix` only strips `export`; prefer manual deletion guided by
`dead-code`.

## Module exports

- **`index.ts` is forbidden** — do not add `index.ts` barrel files anywhere in the
  repo (including package roots and feature folders). There is no package entry
  barrel; import **concrete module paths** only.
- **No re-export aggregators** — do not add `export * from './foo'` shim files
  to collect siblings.
- **Within a package**, import concrete paths
  (e.g. `./types/workflow-graph.ts`), never a directory barrel.
- **Across packages**, import concrete published paths when defined in
  `package.json` `exports`; otherwise fix the boundary — do not introduce a new
  `index.ts` to paper over it.
- **Export with a consumer** — do not add a `package.json` `exports` entry, barrel
  symbol, or re-export shim until the **same change** includes a real importer
  (test, sample, server, or catalog node). Zero-consumer exports are removed, not
  kept “for later”.
- **Finish gate** — before marking API work done: `dead-code` → delete findings →
  `check-exports` → `verify` (see § Delete obsolete code immediately).

See also [NAVIGATION.md](NAVIGATION.md) § Public API boundaries and
[NODES.md](NODES.md) § node folder exports (no per-node barrels).

## Functional error handling

Expected failures are **values** in their channel — not hidden control flow.

- Prefer a discriminated result (`{ ok: true, … } | { ok: false, message }`, or
  an equivalent tagged union) for missing config, missing env, validation, and
  other predictable failure modes in pure helpers / resolvers.
- Pure helpers and resolvers **must not throw** for those cases — return
  `ok: false` and let the caller map the result into its channel (WS
  `error` field, node stream error, empty catalog, …).
- **Node ports:** `StatefulObservable` already models **error** beside value /
  loading / inactive. When a reactive cycle must stop visibly (policy cap,
  hard fail), error that stream so telemetry gets `state: 'error'`. Do not
  invent a successful placeholder emission, and do not swallow the refusal
  with bare `EMPTY`.
- Reserve uncaught `throw` / Promise rejection for truly unexpected bugs or for
  the final I/O edge when the host contract cannot carry a Result (e.g. an
  existing stream factory with no error chunk). Inside a node cycle,
  `throwError` into the `StatefulObservable` is the supported error channel.
- Never use throw as control flow inside scan folds, config resolvers, or
  bridge payload builders.

Example: `resolveProviderCredentials` returns
`{ ok: false, message }` when `{env:VAR}` is unset; `listProviderModels`
maps that to `{ models: [], error }` instead of crashing the request.
LLM Soft↔Hard storm cap (`maxFeedbackTurns`) asks HITL continue via
`runner.permission.ask`; **Deny** maps to `toolLog` + cycle error — not a
silent drop.

## Type safety

- TypeScript strict mode everywhere.
- **`any` forbidden** — use `unknown` + type guards.
- **`as` is a last resort** — each cast needs an explicit reason in code review.
  Prefer, in order:
    1. **`satisfies`** / **`as const`** for literal narrowing
    2. **Utility types** (`Equal`, `ExpectEqual`, mapped types) in `types/expect-type.ts`
    3. **Type guards** (`isRecord`, `isWsPushEvent`, …) at runtime boundaries
    4. **Generic helpers** (e.g. `buildReadonlyNodeMap`) instead of `Object.fromEntries(...) as Record<...>`
- Lock utility-type contracts in **`*.types.test.ts`** via `assertTypeEqual<ExpectEqual<Actual, Expected>>()`.
  A mismatch resolves to `never` and fails compilation.
- Persisted product and internal WebSocket protocol types live in
  `@langflower/shared`. Runtime contracts (`RunId`, runner events, port state)
  stay with `@langflower/runtime`; node-author SDK contracts stay with
  `@langflower/node-sdk`. Do not mirror an existing owner type in
  another package.

## Immutability

- No in-place mutation of objects, arrays, or maps.
- No `Object.freeze` — use `readonly` types.
- Updates return new values (spread, copy, persistent structures).
- RxJS operators must not mutate upstream values.

```typescript
// ❌ BAD
const addNode = (graph: WorkflowGraph, node: WorkflowNode): void => {
	graph.nodes.push(node);
};

// ✅ GOOD
const addNode = (graph: WorkflowGraph, node: WorkflowNode): WorkflowGraph => {
	return { ...graph, nodes: [...graph.nodes, node] };
};
```

## Style

- Prettier: tabs, single quotes, width 80 (`prettier.config.mjs`).
- ESLint: strict TS + Angular (`eslint.config.mjs`).
- kebab-case files; PascalCase types/components; `handle*` handlers; `is*` booleans.

## Testing

- Unit tests for pure logic; API tests mirror UI `HttpClient` contracts.
- Integration tests use `tests/tmp/` temp project dirs — see [TESTING.md](TESTING.md).
- **Found bugs:** after fixing a reproduced bug, append [FOUND_BUGS.md](FOUND_BUGS.md)
  (design flaw signal + regression test) — feeds retrospective.
- **WebSocket:** unit-test `ws-message-guards` in `@langflower/shared`; integration
  tests reject malformed frames.
