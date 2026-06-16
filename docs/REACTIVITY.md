# Reactivity patterns (RxJS)

Practical rules for event folds, reactive node bindings, and runtime demand.
Policy: [ADR-004](ADR.md), [PRINCIPLES.md](PRINCIPLES.md).

## Choose the layer

```text
UI state derived from bridge events?
├─ yes → UI fold: actions → merge/combine → scan → selector
└─ no
   Inside defineReactiveNode.bind?
   ├─ yes → makeInput + combineInputs + pipeValue + configureOutput
   └─ no
      Must an upstream port stay subscribed?
      ├─ yes → runtime demand: connected output/passthrough
      └─ no  → ordinary Observable composition
```

- **UI fold** owns run, feed, HITL, permissions, node, and edge projections.
- **Node bind** owns input-to-output behavior. Use `combineInputs`; do not
  transplant UI-style raw `combineLatest` into `bind`.
- **Runtime demand** is graph materialization, not value pairing. Keep a port
  pulled through an explicit connected output or passthrough.

## Canonical UI flow

```text
source events → tagged actions → merge/combine → scan → selector
	→ shareReplay(1) → async/toSignal → node or edge presentation
```

1. Name and type raw bridge sources.
2. Normalize each source to a small closed action union.
3. `merge` independent facts; `combineLatest` required readiness.
4. Reduce with one immutable `scan`.
5. Map to narrow selectors; never create a writable duplicate or sweep DOM.

### One concern, one fold

Run activity, feed, HITL awaiting, permission asks, node chrome, and edge
chrome remain separate folds even when they share sources.

- A run-level boolean must not erase per-node state.
- One collection or flag must not have several writers.
- Optimistic UI is another action in the same fold.
- Keep folds module-local until reused. References:
  `packages/ui/src/app/services/execution-*-fold.ts`.

## Hydration, reset, and live guards

A snapshot and a live delta are actions in the same state machine. Hydration
must replay the same domain rules as live events.

- Wait for all real snapshots needed for classification.
- Never hydrate once against placeholder empty lookup maps.
- Represent reset explicitly: new run, interrupt, done, or agreed null state.
- After live actions advance replace-all state, ignore stale hydration with an
  explicit state-level `live` guard.
- Keep settled chrome when reconnect must restore it; reset on the next run.
- Deduplicate replace-all hydration by snapshot identity when catalog changes
  must not replay and wipe live actions.

Bootstrap order is testable behavior: execution-feed state may arrive before
workflow and palette state. Classification must wait for all three sources.
Incident details belong in [FOUND_BUGS.md](FOUND_BUGS.md), notably
BUG-2026-07-21b and BUG-2026-07-21d.

## Observables and signals

Keep event-driven data as an `Observable`.

- Prefer `async` for direct template consumption.
- Use `shareReplay(1)` for shared derived streams.
- Use `toSignal` for synchronous reads or `computed`, with a meaningful
  non-null empty fold value.
- Keep non-derived local UI drafts as signals.

Do not convert to a nullable signal only to avoid `async`. Never subscribe
merely to copy a stream value into a field or signal.

## Effect taxonomy

| Mechanism        | Allowed                                 | Forbidden                       |
| ---------------- | --------------------------------------- | ------------------------------- |
| `subscribe`      | imperative host/server/runtime edge     | UI projection writer            |
| Angular `effect` | imperative API driven by signals        | rebuilding/copying state        |
| `tap`            | runtime telemetry, tracing, diagnostics | mutation or hidden control flow |
| public method    | transport/host call, intent dispatch    | parallel fold mutation          |

Allowed edges include host APIs, server transport/filesystem calls, runtime
port telemetry, and cleanup of non-derived drafts. Keep callbacks small.
Prefer
`firstValueFrom`/`lastValueFrom` for one-shot bootstrap and
`takeUntilDestroyed()` for unavoidable component subscriptions.

```typescript
// Effect edge: state is already derived; only the host call is imperative.
readonly focusPendingReply = effect(() => {
	const id = this.pendingReplyControlId();
	if (id !== null) {
		this.focusHost.focus(id);
	}
});
```

```typescript
const observed$ = source$.pipe(
	tap((value) => telemetry.outputEmitted(portId, value)),
);
```

## Subjects carry intent only

Use `Subject` for intent absent from source events: optimistic HITL/permission
resolve or an imperative callback entering a pipe. Never use a
`BehaviorSubject` as a writable store; derived state belongs in a fold.

## `withLatestFrom` is forbidden

Do not introduce or retain `withLatestFrom` without explicit human
confirmation for that exact call site. It can drop a primary event before the
secondary emits and will not re-run when the secondary becomes ready.
`startWith(empty)` can instead create false readiness. Neither solves runtime
demand.

Prefer:

- `combineLatest` for genuine multi-source readiness;
- `switchMap` from ready context into future live events;
- separate actions and a fold;
- explicit passthrough/output demand for reactive ports.

A human-approved exception needs a short call-site comment explaining why
asymmetric sampling is correct. Details stay in
[FOUND_BUGS.md](FOUND_BUGS.md).

## Reactive node binding

Inside `defineReactiveNode.bind`:

- declare typed ports with `makeInput<T>`;
- combine stateful inputs with `combineInputs([a, b], mapFn)`;
- declare `defaultValue` on optional init/inventory ports;
- compose work with `pipeValue`;
- expose streams with `configureOutput`;
- share an expensive cycle across outputs when required.

Do **not** copy raw `combineLatest` plus `startWith` into node bindings.
`combineInputs` understands stateful connections; `defaultValue` lets the
runtime seed unconnected optional inputs correctly.

Feedback loop ports differ from init inputs. The documented turn-zero
`startWith` plus `concatMap` pattern is valid for feedback; do not include
feedback in init `combineInputs`. See
[HOW_TO_WRITE_REACTIVE_NODES.md](HOW_TO_WRITE_REACTIVE_NODES.md) and
[REACTIVE_NODES.md](REACTIVE_NODES.md).

### StatefulObservable error-lane

`StatefulObservable<T, E, Meta>`: **`E` is `error$` (`false | E`)**, not part of
`T`. `connect(throwError(() => e))` lands in `error$` (SO
`catchResponseError`). `combineInputs` propagates source errors.

Runner value seeds remain `{ value }` → `of(value)`. To put `CtxError` on
hidden ctx, the server seeds `throwError(() => CtxError)` and connects that
Observable onto the context port before `start` (see
[HOW_TO_WRITE_REACTIVE_NODES.md](HOW_TO_WRITE_REACTIVE_NODES.md)
§ StatefulObservable error-lane).

### Custom RxJS operators vs stream wrappers

Value-lane transforms belong in `pipe` / `pipeValue` as **operators**
(`OperatorFunction`), not as `(stream$) => stream$.pipeValue(...)` helpers.

```ts
// good — operator used inside pipeValue
const demuxByKind =
  (kind: string, project: (chunk: Chunk) => Out): OperatorFunction<Chunk, Out> =>
    pipe(filter((c) => c.kind === kind), map(project));

reasoning$: cycle$.pipeValue(demuxByKind('reasoning', (c) => c.text));

// bad — stream-in/stream-out wrapper around StatefulObservable
const demuxByKind = (cycle$, kind, project) =>
  cycle$.pipeValue(filter(...), map(project));
```

A custom operator is the native RxJS shape for reusable pipe logic. It may be
**module-local** (single consumer) or shared — that is separate from YAGNI
rules about extracting `utils/` modules. Do not treat “local operator” as
“premature shared util”.

Composers that take several deps (`prepareSession`, `runTurn`, options) stay
named functions (`createLlmSessionCycle$`); reusable value-lane mechanics
remain operators/folds below that composer.

LLM execution uses two explicit folds:

- `runLlmSessionMachine`: `mergeScan(..., 1)` owns queued turns, committed
  history, and feedback count.
- `runLlmLoop`: `expand` owns one turn's provider/tool/Sub-Agent/retry/Steer
  phases; provider `AsyncIterable` values are converted to typed RxJS facts.

Recoverable provider failures reduce to `suspended`, not an Observable error.
Fatal authentication/configuration/protocol failures still use the error lane.
Never mutate LLM history/counters in `tap`, callbacks, or `subscribe`.

## Higher-order operators

| Operator     | Rule              | Use when                               |
| ------------ | ----------------- | -------------------------------------- |
| `switchMap`  | cancel previous   | latest key/context/session wins        |
| `concatMap`  | queue in order    | every turn/action must finish          |
| `exhaustMap` | ignore while busy | duplicate submit/start must be blocked |
| `mergeMap`   | run concurrently  | work is independent and unordered      |
| `mergeScan`  | queue + fold      | ordered async work updates owned state |
| `expand`     | recursive phase   | state-machine transition drives effect |

Choose from product semantics; preserve required turns, order, and limits.

## Pure fold example

```typescript
type GateAction =
	| { readonly type: 'hydrate'; readonly ids: readonly string[] }
	| { readonly type: 'open' | 'close'; readonly id: string }
	| { readonly type: 'reset' };

const foldGate = (
	state: ReadonlySet<string>,
	action: GateAction,
): ReadonlySet<string> => {
	if (action.type === 'reset') {
		return new Set();
	}
	if (action.type === 'hydrate') {
		return new Set(action.ids);
	}
	return action.type === 'open'
		? new Set([...state, action.id])
		: new Set([...state].filter((id) => id !== action.id));
};

const openIds$ = merge(hydrate$, open$, close$, reset$).pipe(
	scan(foldGate, new Set<string>()),
	startWith(new Set<string>()),
	shareReplay(1),
);
```

## Testing sequences

Test ordered sequences, not isolated final values:

1. feed snapshot before workflow/palette, then readiness;
2. live delta followed by a stale snapshot;
3. optimistic action followed by server confirmation;
4. duplicate start for the same run;
5. explicit new-run and terminal resets;
6. resolving one parallel entity preserves siblings;
7. reconnect hydration restores settled chrome.

Test reducers directly, then keep a thin wiring test for readiness, guards,
merging, and selectors. Use Subjects as sources and subscribe before a
synchronous runtime start. For node bindings, test through `RuntimeFacade`,
connect controlled sources, seed context, rely on runtime `defaultValue` for
unconnected optional ports, and verify demand where an edge must remain hot.

## Anti-pattern checklist

- [ ] `.subscribe`/`effect` copies derived state into a field or signal.
- [ ] `tap` mutates shared state or controls business flow.
- [ ] Several writers maintain one collection or status.
- [ ] A run-level flag clears unrelated per-entity state.
- [ ] Hydration uses placeholder empty classification context.
- [ ] A stale snapshot replaces state after live actions.
- [ ] Reset is inferred instead of represented as an action.
- [ ] `withLatestFrom` lacks explicit human confirmation.
- [ ] Pairing is used where runtime demand is required.
- [ ] Node `bind` uses raw `combineLatest`, not `combineInputs`.
- [ ] Optional init uses `startWith`, not `defaultValue`.
- [ ] Higher-order semantics mismatch cancellation or ordering.
- [ ] UI chrome is applied through a global DOM sweep.

## Related

[PRINCIPLES.md](PRINCIPLES.md) ·
[REACTIVE_NODES.md](REACTIVE_NODES.md) ·
[HOW_TO_WRITE_REACTIVE_NODES.md](HOW_TO_WRITE_REACTIVE_NODES.md) ·
[EXECUTION_ARCHITECTURE.md](EXECUTION_ARCHITECTURE.md) ·
[FOUND_BUGS.md](FOUND_BUGS.md)
