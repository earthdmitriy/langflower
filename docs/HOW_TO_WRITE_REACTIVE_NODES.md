# How to write reactive nodes

Practical authoring guide for `@langflower/node-sdk`.
Prefer **`defineNode`** for sync/Promise nodes; use **`defineReactiveNode`**
when you need RxJS streams. Project packs:
[ADR-030](ADR.md#adr-030--custom-node-pack-layout--npm-model),
[seed README](../packages/server/skeleton/nodes/my-nodes/README.md).
Multi-file packs that use `from './x.ts'` must set
`allowImportingTsExtensions` + `noEmit` in pack `tsconfig.json` (see
[hello-embed](../packages/server/skeleton/nodes/hello-embed/tsconfig.json));
otherwise the pack does not compile.

| Related doc                                                   | Role                                                                              |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| [NODES.md](NODES.md)                                          | Folder layout, categories, checklist                                              |
| [REACTIVE_NODES.md](REACTIVE_NODES.md)                        | Runtime / UI activity model                                                       |
| [EXECUTION_ARCHITECTURE.md](EXECUTION_ARCHITECTURE.md)        | How runs wire and complete                                                        |
| [REACTIVITY.md](REACTIVITY.md)                                | RxJS fold rules (no stray `.subscribe`; **no `withLatestFrom` without human OK**) |
| [packages/node-sdk/AGENTS.md](../packages/node-sdk/AGENTS.md) | SDK package boundaries + **factory folders**                                      |
| SDK samples                                                   | `packages/node-sdk/.../test/samples/`                                             |
| Production examples                                           | `packages/common-nodes/src/**/node.ts`                                            |

### SDK factory folders

| Folder                       | Factory / import                              |
| ---------------------------- | --------------------------------------------- |
| `define-node/`               | `defineNode` — `@langflower/node-sdk`         |
| `define-reactive-node/`      | `defineReactiveNode` (+ IO helpers, base ctx) |
| `define-tool-registrations/` | `defineToolRegistrations` (+ `ToolHandle`)    |
| `define-llm-node/`           | `defineLlmNode` — `@langflower/node-sdk/llm`  |

New factories → new sibling folder. Do not add loose factory files inside
another factory’s directory.

### ExecutionContext (authors)

Base `ExecutionContext` is **identity + panel only** (`projectDir`, `runId`,
`nodeId`, `params`, `uiSchema`). Custom authors do **not** get `files` / `kb` /
`crawl` / `memory` / chat streams / skills on ctx.

LLM nodes (`defineLlmNode`) may receive `toolHandles` via
`LlmExecutionCaps`. Outside world for agents = **ToolHandle**
(wired packs, MCP nodes, and jsonc MCP flattened onto that array),
not host bags on ctx. Built-in graph nodes that need disk/network create it
internally with `@langflower/tools`.

---

## 0. Simple nodes (`defineNode`)

Default path for custom / sync nodes — **no RxJS** in the author file.

```ts
import { defineNode } from '@langflower/node-sdk';

export const gateNode = defineNode({
	type: 'example-gate',
	displayName: 'Gate',
	category: 'Logic',
	uiSchema: [] as const,
	inputs: {
		code: { wireType: 'number', required: true },
	},
	outputs: {
		ok: { wireType: 'boolean' },
	},
	execute(_ctx, inputs) {
		return { ok: Number(inputs.code) === 0 };
	},
});
```

- Adapter over `defineReactiveNode` (one reactive runtime).
- `throw` / rejected Promise → port error.
- Default `emitOncePerActivation: true`.
- Sample: `packages/node-sdk/src/node-factory/define-node/test/samples/gate-node.ts`.

---

## 1. Minimal reactive node

```ts
import { defineReactiveNode } from '@langflower/node-sdk';
import { map } from 'rxjs';

export const shoutNode = defineReactiveNode({
	type: 'common-shout',
	displayName: 'Shout',
	category: 'Text',
	description: `
Uppercase the wired string.

Typical uses:
- Normalize a label before Compare
`.trim(),
	uiSchema: [] as const,
	bind(_ctx, { makeInput, configureOutput }) {
		const text = makeInput<string>('text', {
			name: 'text',
			wireType: 'string',
			required: true,
		});

		const out$ = text.pipeValue(
			map((value) => String(value ?? '').toUpperCase()),
		);

		return {
			inputs: [text],
			outputs: [configureOutput('text', out$, { wireType: 'string' })],
		};
	},
});
```

Rules baked into this shape:

- One named export from `node.ts` (see [NODES.md](NODES.md)).
- `description` is user markdown for the palette popover and inspector
  (use cases; not author internals). JSDoc on the const is for authors.
- `bind` runs once as a discarded metadata probe, then once for each
  `getInstance()` live graph. It does not run again when that instance restarts
  a run (`done` / Stop / next Start).
- Keep `bind` free of module-level I/O and shared mutation; instance-local
  closures are allowed and **may intentionally keep state across runs** until
  the user loads another workflow, the node is rematerialized, or Langflower
  shuts down. See [REACTIVE_NODES](REACTIVE_NODES.md) § Instance lifetime.
- Ports are `StatefulConnection` / `StatefulObservable`, not raw Subjects.
- Always pass a generic to `makeInput<T>(...)`.

### Domain tool packs — `defineToolRegistrations`

Purpose utility atop `defineReactiveNode` (own folder
`node-factory/define-tool-registrations/`): emits one `tools` port
(`tool-handle`) with the full pack. Each tool has its own `invoke` function
(typically imported from `@langflower/tools/domain-tool-configs`), so custom
nodes can define callable tools without a closed `toolId` registry.

```ts
import { defineToolRegistrations } from '@langflower/node-sdk';
import { MEMORY_TOOL_CONFIGS } from '@langflower/tools/domain-tool-configs';

export const memoryToolsNode = defineToolRegistrations({
	type: 'common-memory-tools',
	displayName: 'Memory Tools',
	category: 'Memory',
	tools: MEMORY_TOOL_CONFIGS,
});
```

Internal tool loop (Option 3) calls `handle.invoke(args, toolCtx)`. The server
wraps permitted builtins as `ToolHandle`s whose `invoke` closes over
`harness.invoke`.

---

## 2. `bind` helpers

```ts
bind(ctx, { makeInput, configureOutput, combineInputs }) { … }
```

| Helper                                  | Use for                                                       |
| --------------------------------------- | ------------------------------------------------------------- |
| `makeInput<T>(portId, meta)`            | Declare an input port + its stream                            |
| `configureOutput(portId, stream, meta)` | Attach an output stream + wire/feed meta                      |
| `combineInputs([a, b, …], mapFn)`       | Stateful combine (prefer over raw `combineLatest`)            |
| `ctx`                                   | Hidden context port — base `ExecutionContext` (`params`, ids) |

`ctx` is a `StatefulObservable<ExecutionContext>`. Include it in `combineInputs`
when the cycle needs panel `params`. LLM inventory (`toolHandles`)
arrives on Caps for `defineLlmNode` only.

### Stateful values and demand

`StatefulConnection` is the writable edge relay; `StatefulObservable` is the
read side returned by node outputs. Status is first-class dataflow:
**inactive / loading / value / error**. `pipeValue` applies operators to
successful values while preserving the other states. Use
`statefulObservable({ input, loader })` only for genuinely asynchronous or
multi-step loaders, not identity wrappers or simple maps.

**StatefulObservable streams are always hot.** Multiple `pipeValue` demux
subscribers share the upstream work — do **not** wrap node sessions in
`shareReplay` “to multicast”.

Reusable value-lane logic → **custom RxJS operator** (`OperatorFunction`) passed
into `pipeValue`, not a helper that accepts a `StatefulObservable` and calls
`pipeValue` inside. Example: `demuxByKind` in `llm-session-shell.ts`. Operators
may stay file-local; that is not a forbidden `utils/` extract. See
[REACTIVITY.md](REACTIVITY.md) § Custom RxJS operators vs stream wrappers.

`pipeValue` is variadic like `Observable.pipe` — pass operators as arguments
(`session$.pipeValue(filter(…), map(…))`). Prefer that over
`pipeValue(pipe(filter(…), map(…)))` for ordinary demux/map chains.

**Errors are part of the stream.** Prefer `throwError` (or a failing loader)
when a turn/policy must stop visibly — the runtime emits
`state: 'error'` on wired outs. Do not fake a successful value to “clear”
loading, and do not silently `EMPTY`-drop a refusal the user should see.

### StatefulObservable error-lane (`error$`)

`StatefulObservable<T, E, Meta>` — **2nd generic `E` is the error-lane type**,
not a field on `T`.

| Stream   | Meaning                        |
| -------- | ------------------------------ |
| `value$` | Successful `T` only            |
| `error$` | `false \| E` — separate stream |

How an error gets into `error$`:

1. `connection.connect(throwError(() => e))` — SO catches the Rx error
   (`catchResponseError`) and stores `e` typed as `E`.
2. A failing `loader` that rejects / errors the same way.
3. `combineInputs` / `combineStatefulObservables` forwards source error-lanes
   (`UnwrapStatefulObservablesError`).

Hidden node **ctx** is typed
`StatefulObservable<ExecutionContext, CtxError, PortMeta>`. System MCP connect
fail (S6): server builds a context seed whose `value` is
`throwError(() => CtxError)`, then peels Observables and `connect`s them onto
`contextSymbol` **before** `runner.start` — because runner value seeds use
`of(value)` and would put an Observable into **value$**, not `error$`. Plain
`ExecutionContext`seeds stay`{ value: ec }`as today. Do **not** add`RuntimeSeedPortValue.error`or sniff`CtxError` out of the value lane.

See also [REACTIVITY.md](REACTIVITY.md) § StatefulObservable error-lane.

Reactive work is subscription-driven. Every dependency that must execute must
remain reachable from a returned output. When a control output samples another
input, add an explicit passthrough output for that input if it must stay pulled:

```ts
const preview = configureOutput('preview', result, {
	inferTypeFrom: result,
});
```

Follow [REACTIVITY.md](REACTIVITY.md) for fold, subscription, and
`withLatestFrom` rules. Do not reproduce those rules locally.

---

## 3. Inputs

### Always type `makeInput`

```ts
// good
makeInput<string>('userPrompt', { wireType: 'string', required: true });
makeInput<readonly ToolHandle[]>('tools', {
	wireType: 'tool-handle',
	multi: 'combine',
	defaultValue: [],
});

// bad — no generic, or `unknown` as a dodge
makeInput('tools', { … });
makeInput<unknown>('x', { … });
```

If the wire contract is not finalized yet, add a **named** domain type next to
the node (and a `TODO`) instead of `unknown`.

### Named wire types (not generic `json` for peer contracts)

`RuntimeEditor` accepts an edge only when source and target `wireType` strings
match (plus `any` / `dynamic`). A structured contract between nodes therefore
needs its **own** wire type string — export a const next to the payload type
and use that const on every producer/consumer port.

```ts
// good — editor rejects crawl json → tools, string → tool-handle, etc.
import { TOOL_HANDLE_WIRE_TYPE, type ToolHandle } from '@langflower/node-sdk';
makeInput<readonly ToolHandle[]>('tools', {
	wireType: TOOL_HANDLE_WIRE_TYPE,
	multi: 'combine',
	defaultValue: [],
});

// bad — any other `json` port can connect; canvas validation is useless
makeInput('tools', { wireType: 'json' });
```

Canvas Sub-Agent handle names are `{displayName}(subagent)` (e.g.
`Writer(subagent)`). The first frame from that `common-sub-agent` node
closes the caller feed visit.

**Do not** invent peer contracts on `wireType: 'json'`. Reserve `json` for
opaque blobs with no typed peer (e.g. crawl page / link dumps). Named wire
example: `tool-handle` (`TOOL_HANDLE_WIRE_TYPE`). Optional hub
`common-tool-collection` combines many `tools` wires into one array;
agents still accept **multi combine** without it (ADR-035).

### Optional ports → `defaultValue` (not `startWith`)

Unconnected optional **init / inventory** ports must not stall `combineInputs`.
Declare a default on the port; the **runtime** seeds it at `start` / `startNode`
when the port is still inactive and has no edge:

```ts
const tools = makeInput<readonly ToolHandle[]>('tools', {
	name: 'tools',
	wireType: 'tool-handle',
	multi: 'combine',
	defaultValue: [],
});
const systemPrompt = makeInput<string>('systemPrompt', {
	name: 'systemPrompt',
	wireType: 'string',
	inline: 'text-multiline',
	defaultValue: '',
});
```

Do **not** write `tools.value$.pipe(startWith([]))` inside `bind`.

Server path also persists `defaultValue` into `node.inputs` on add-node for the
canvas; runtime applies the same rule for harness / unit tests that skip the
server materializer.

### Loop-back turn ports (`startWith` + `concatMap` exception)

Do **not** put `feedback` in init `combineInputs` (wired feedback skips
`defaultValue` seeding → Soft↔Hard deadlock; ADR-016 / BUG-2026-07-19).

The `startWith` + `concatMap` pair belongs only to feedback-turn streams.
`startWith` primes **turn 0**; `concatMap` queues feedback that arrives while
the current turn is still streaming:

```ts
feedback.value$.pipe(
	startWith(''), // turn-0 prime — NOT on tools/init peers
	concatMap((raw) => {
		// first emission → turn 0; later non-empty → feedback turns
	}),
);
```

**Forbidden:** `startWith` on init-combine peers (`tools`, …) as a
substitute for `defaultValue`.

### Multi inputs

| `multi`     | Meaning                                                                            |
| ----------- | ---------------------------------------------------------------------------------- |
| `'combine'` | `combineLatest` array — after first emit, any slot re-fire re-emits                |
| `'zip'`     | RxJS `zip` array — emit only when **every** wired slot has a **new** event (flush) |
| `'merge'`   | Forward each upstream emission as it arrives                                       |

```ts
const values = makeInput<string[]>('value', {
	name: 'values',
	wireType: 'string',
	multi: 'combine',
	required: true,
});

// Join-once-per-round (e.g. Concat) — not combineLatest:
makeInput<string[]>('value', {
	name: 'values',
	wireType: 'string',
	multi: 'zip',
	required: true,
});
```

### Inline editors

Set `inline` on the input for on-node controls (`'text'`, `'text-multiline'`,
`'boolean'`, `'number'`, select-family, preview kinds). See `InputParams` in
`io-helpers.ts`.

For numeric steppers with a domain floor/step, prefer the object form — not bare
`'number'` / `'text'`:

```ts
inline: { type: 'number', min: 1, step: 1 },
defaultValue: 1,
```

### HITL

Attach `hitl: { … }` on the reply input. Patterns:
`packages/common-nodes/src/hitl/*/node.ts`.

---

## 4. Combining inputs and running work

Prefer this shape for multi-input cycles:

```ts
const output$ = combineInputs([value, delayInput], ([inputValue, delayMs]) => ({
	inputValue,
	delayMs,
})).pipeValue(
	concatMap(({ inputValue, delayMs }) =>
		of(inputValue).pipe(delay(Number(delayMs ?? 0))),
	),
);
```

### Multi-output paced sessions (one counter, several outs)

When several outs must stay in lockstep (e.g. N× `value` then `done`), do **not**
run a separate `switchMap` / `take` per output. Dual pacing re-subscribes the
trigger stream and desyncs counters.

**Do this instead:**

1. One session: `combineInputs([sessionKey…]).pipeValue(switchMap(…))`.
2. Inside that `switchMap`, pace with the trigger stream
   (`startWith(undefined)` for first ASAP, then real trigger events).
3. Emit tagged events with `kind: '…' as const` (no extra named union type).
4. Each out only demuxes: `session$.pipeValue(filter(…), map(…))` — pass
   operators to `pipeValue` directly; do **not** wrap them in RxJS `pipe(...)`.
5. Do **not** put the pacing `trigger` in the same `combineInputs` as the
   session key (that blocks the ASAP first emit).
6. Do **not** add `shareReplay` on the session — `StatefulObservable` is already
   hot, so demux outs share one upstream without an extra multicast operator.

Reference: `common-nodes/.../flow/repeat/node.ts`. Loop’s dual streams on
`bodyResult` are OK when outs intentionally use **different** `take` shapes;
value/`done` lockstep needs one tagged session.

Production references:

| Pattern                            | Example                                        |
| ---------------------------------- | ---------------------------------------------- |
| Pass-through + delay               | `common-nodes/.../flow/delay/node.ts`          |
| Paced repeat + demux outs          | `common-nodes/.../flow/repeat/node.ts`         |
| Map-collect loop                   | `common-nodes/.../flow/loop/node.ts`           |
| Multi string join                  | `common-nodes/.../text/concat/node.ts`         |
| Params + streaming cycle (imitate) | `common-nodes/.../ai/nodes/fake-llm/node.ts`   |
| Agent session + history (real)     | `common-nodes/.../ai/nodes/openai-llm/node.ts` |
| `stopsRun` sink                    | `common-nodes/.../output/finish/node.ts`       |

### LLM init vs feedback turns

Do **not** put `feedback` in the same `combineInputs` as prompt/tools/system/`ctx`.
Init re-emissions recreate the session (`switchMap`); feedback advances turns
inside the current session. Real history lives in **openai-llm**; **fake-llm**
only imitates streaming for demos (same port split, no message history).

```ts
const context$ = combineInputs(
	[userPrompt, tools, systemPrompt, ctx],
	([prompt, toolList, systemPromptValue, ec]) => {
		// use ec.params.*, ec.toolHandles (LlmExecutionCaps)
		// skill / stream come from private run-host services inside common-nodes
		return {/* context */};
	},
);
```

### Do not put host I/O on author ExecutionContext

Skill bodies, API keys, files/kb/crawl, and chat factories are **not** public
EC fields. Specialized LLM wiring in common-nodes reads a private run-host bag
seeded by the server; graph I/O nodes call `@langflower/tools` `create*`
helpers. Custom authors reach the outside world via **ToolHandle**
(including MCP tools).
See [LLM_NODES.md](LLM_NODES.md).
---

## 5. Outputs

```ts
configureOutput('response', response$, {
	wireType: 'string',
	feed: { role: 'result' },
});

configureOutput('reasoning', reasoning$, {
	wireType: 'string',
	feed: { role: 'reasoning', streaming: true },
});

configureOutput('value', output$, {
	inferTypeFrom: value, // passthrough dynamic type
});
```

| Meta                   | When                                                                                                                                                                                                                                                 |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wireType`             | Fixed type on the canvas (named peer contracts — not generic `json`)                                                                                                                                                                                 |
| `inferTypeFrom`        | Passthrough — type follows an input                                                                                                                                                                                                                  |
| `feed.role`            | Sidebar work-log role (`reasoning`, `progress`, `draft`, `result`, …). **`result`** = conversation bubble (one row per emit). **`reasoning`** = LLM thinking stream. **`progress`** = same growing layout; caption PROGRESS (ingest/crawl/job logs). |
| `feed.streaming: true` | Chunks append in the feed UI **and** the visit stays open (interleaved streams). Omit it so the frame **closes the visit**; later same-node frames while last still append.                                                                          |

**Progress / log lines** (ingest, crawlers, long jobs): use
`{ role: 'progress', streaming: true }` — same growing layout as reasoning,
caption **PROGRESS**. Do **not** use `result`.

```ts
configureOutput('progress', progress$, {
	wireType: 'string',
	feed: { role: 'progress', streaming: true },
});
```

| Wrong                                   | What the feed does                                                                  |
| --------------------------------------- | ----------------------------------------------------------------------------------- |
| `{ role: 'result' }`                    | Bright bubble per emit; omitting `streaming` also **closes the visit** each time.   |
| `{ role: 'result', streaming: true }`   | Still bubbles (`result` is not a growing role); one visit, many conversation rows.  |
| `{ role: 'progress', streaming: true }` | One technical stream; caption PROGRESS; chunks concatenate (suffix `\n` for lines). |

**Progress line text:** put a zero-padded `(n/total)` **first**, then the
path/name, then the rest (heading, status). Do **not** put the counter
after a variable-length path or title — it jumps in the work-log 2-line
peek. Pad both numbers to the digit width of the total you actually
count (chunks, if you emit one line per embed):
`String(n).padStart(String(total).length, '0')`.

```ts
const width = String(total).length;
const pad = (n: number) => String(n).padStart(width, '0');
progress$.next(`(${pad(i)}/${pad(total)}) ${relPath} — ${label}\n`);
```

```text
(01/12) notes.md — Alpha
(0001/9999) docs/long-name.md — Intro
```

`finish` / plumbing that must not appear in the work log: `feed: { role: 'none' }`.

**No fake events / no silent refusals:** do not emit placeholder values on
feed/observability ports (`''`, synthetic config dumps, idle `of(null)`) just
to leave loading — leave the port pending/inactive. When a policy or failure
stops work, error the cycle (optionally with a real `toolLog` line first); never
swallow with bare `EMPTY`. See [LLM_NODES.md](LLM_NODES.md)
§ Port events: real facts only, fail visibly.

### Multi-output streaming from one cycle

Split one cycle stream with `filter` / `map` per port (see fake-llm /
openai-llm). The runtime subscribes end-node outputs **before** seeding
defaults/context so shared `shareReplay(1)` streams still deliver every chunk
to unwired ports (`reasoning`, `draftResponse`, …).

Choose flattening semantics from the node's actual contract. The special
`startWith` + `concatMap` recipe above is reserved for ordered feedback turns.

---

## 6. Panel params (`uiSchema`)

```ts
uiSchema: [
	{ field: 'tokenDelayMs', type: 'number', label: 'Token delay (ms)', default: 40 },
] as const,
```

- Use `as const` so `ExecutionContext.params` infers field types.
- Read params from `ec.params` via `ctx` (not a sync snapshot at bind time).
- Panel defaults come from `uiSchema[].default`; port defaults from
  `makeInput` `defaultValue` — different layers.

---

## 7. Special node flags

| Flag                          | Effect                                               |
| ----------------------------- | ---------------------------------------------------- |
| `stopsRun: true`              | First output emission ends the run (`common-finish`) |
| `emitOncePerActivation: true` | One shot per activation                              |
| `bypassPorts`                 | Router-style channel materialization                 |

---

## 8. Catalog and server wiring

Authors usually only export the node const and register it in
`packages/common-nodes/src/catalog.ts`.

The catalog stores the `ReactiveNodeDefinition` directly. Runtime composition
resolves the definition by `type`, calls `getInstance()` once for each canvas
node, adds that instance to `RuntimeFacade.editor`, and seeds the hidden context
port at run start. Those instances stay alive across `done` / Stop / Start; only
loading another workflow (or removing the node / shutting down the process)
creates fresh instances.

Do not deep-import SDK internals. Published import:

```ts
import { defineReactiveNode } from '@langflower/node-sdk';
```

---

## 9. Testing

Unit tests typically use `RuntimeFacade`:

1. `node.getInstance()` for each node under test.
2. `connect(of(...))` on source literals you control.
3. `editor.addNode` / `addEdge`.
4. Subscribe to `runner.events$` **before** `runner.start(...)` when
   `tokenDelayMs: 0` (emissions can be synchronous).
5. Seed `contextSymbol` per node in `start({ … })`. LLM tests that need stream /
   skill use `attachRunHostServices` (common-nodes), not public EC fields.

Optional ports with `defaultValue` do not need a manual `connect` in tests —
the runtime seeds inactive unconnected ports at start.

Integration coverage: `tests/integration/` (build packages first).

---

## 10. Anti-patterns

| Avoid                                           | Prefer                                                                                    |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Raw `combineLatest` + `startWith` on init ports | `combineInputs` + `defaultValue`                                                          |
| `feedback` inside init `combineInputs`          | Init combine + `feedback.pipe(startWith(''), concatMap…)`                                 |
| Dual `switchMap`/`take` per related out         | One session of `{ kind: '…' as const }` events; outs `pipeValue(filter, map)`             |
| `shareReplay` on a `StatefulObservable` session | Unnecessary — SO is already hot; use one tagged session + demux outs                      |
| `pipeValue(pipe(filter, map))` for demux        | `pipeValue(filter, map)`                                                                  |
| Named event-union type for local demux          | Inline `{ kind: 'value' as const, … }` / `{ kind: 'done' as const }`                      |
| Pacing `trigger` inside session `combineInputs` | Session key in `combineInputs`; pace with `trigger.value$` inside `switchMap`             |
| Bare `inline: 'number'` when min/step matter    | `inline: { type: 'number', min, step }`                                                   |
| `await readFile` / skill reads in custom nodes  | Private run-host / tools `create*` inside specialized nodes only                          |
| Bare `makeInput('x', …)` / `unknown` ports      | `makeInput<T>` + domain types                                                             |
| `.subscribe` inside `bind` for business logic   | `pipeValue` / `combineInputs` folds                                                       |
| Hidden sampled input dependency                 | Explicit passthrough output so the input stays pulled; see [REACTIVITY.md](REACTIVITY.md) |
| Sync read of `params` at define time            | `ctx` inside `combineInputs`                                                              |
| Glue adapters for port mismatches               | Fix types / wire contracts at the source                                                  |
| Barrel `index.ts` next to the node              | Single `node.ts` export                                                                   |

---

## 11. Checklist before merge

- [ ] `type` is unique (`common-…` for built-ins)
- [ ] Folder layout + `NODE.md` if behavior is non-obvious ([NODES.md](NODES.md))
- [ ] Every `makeInput` has a generic and a `wireType` (or `dynamic: true`)
- [ ] Optional inputs have `defaultValue`
- [ ] Cycles use `combineInputs` (include `ctx` when params / context matter)
- [ ] Lockstep multi-outs use one tagged session + demux (not dual `switchMap`)
- [ ] Outputs use `configureOutput` (`feed` if they belong in the work log)
- [ ] Registered in `common-nodes` catalog when shipping a built-in
- [ ] Unit test with `RuntimeFacade` (subscribe before `start` if sync)
- [ ] `node build/tools/agent-run.mjs dead-code` then `verify`
