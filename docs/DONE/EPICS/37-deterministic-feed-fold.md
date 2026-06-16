# Epic 37 — Deterministic feed-folding abstraction (UI)

**Status:** queued  
**Depends on:** —  
**Index:** [README.md](README.md)  
**Source:** retired note `docs/TODO/deterministic-feed-fold.md` (folded into this epic)  
**Feeds:** [grok-feed](../../use-cases/grok-feed.md), [hitl-chat](../../features/hitl-chat.md)
(foundation only — no Status flip in this epic)

## Goal

Ship a **deterministic, TDD-built** RxJS fold that turns a chronological stream
of server port frames into a **three-level nested Observable** hierarchy
(node → port → port streaming), shaped so a later UI can unwrap it with
**nested `async` pipes** — as a standalone feature `feed-folding` (logic +
tests only; no live wire-up in this epic).

Current `execution-feed-fold` + `feed-section` sometimes mis-orders or drops
HITL-related frames (catalog-gated live paths, settle/steer, permission cues).
This epic extracts a pure, replayable abstraction so later work can swap the
work-log fold without inventing the model under time pressure.

## Problem (why now)

- One global `scan` over mixed actions (`snapshot` / `output` / `user` /
  `permission*` / `settle`) couples chronology, catalog lookup, and UX settle
  rules — HITL `input-received` is easy to skip or reorder relative to outputs.
- Reconnect and live paths share vocabulary but not one deterministic reducer
  over a single event list (see BUG-2026-07-21b and related feed/HITL notes in
  [FOUND_BUGS](../../FOUND_BUGS.md)).
- Needed: a small feature that owns **grouping + stream shape** only; presentation
  (`FeedSection`, timeline bubbles) stays elsewhere until a follow-up epic.

### Roast resolved in this revision

The prior draft named nested streams but did not define their lifetime:
rebuilding `NodeFeedItem` / `PortEvent` with `of(...)` and a local
`shareReplay` for every source array means that each outer emission replaces
the child Observable. That can render a snapshot, but it is not a durable
port-stream projection for nested `async` pipes.

This epic therefore has one explicit source rule: **share the chronological
array source once, then derive every nested level from that same shared
source.** Node, port, and item streams recompute their respective immutable
list snapshots on each source emission. No child stream owns an imperative
subscription, a `Subject`, or an independently accumulated mirror.

## Out of scope

- **Do not** wire `WorkflowExecutionService`, `createFeedState$`,
  `lf-work-log-panel`, or `feed-timeline` to the new fold.
- **Do not** delete or rewrite `execution-feed-fold.ts` / `feed-section.ts`.
- Do not change runtime event shapes or use-case Status. The one protocol
  addition allowed here is server-authoritative `runner.permission.accepted`.
- **Palette catalog lookup** — no `palette.snapshot` / `PaletteNodeDefinition`
  / `feed.role` / `config.hitl` resolution inside `feed-folding`. HITL tagging
  uses caller-supplied predicates or fixture meta (see Required types), not
  live palette maps.
- No current-feed migration to the new nested fold: draft/tool and composer
  visuals stay on the current fold until a follow-up “switch UI feed” epic.
  Current permission projections may consume `runner.permission.accepted` to
  remove an ask authoritatively.

## In scope

- New feature slice `packages/ui/src/app/features/feed-folding/` — **no
  Angular components**, no templates; pure types + fold operators + unit tests.
- Required types below (names may tighten in PR, semantics must hold).
- **HITL + steer as first-class port frames** with explicit `meta` (not a
  separate action channel). Steer classified from
  `STEER_CONTROL_PORT_ID` + `SteerControlPayload` (`@langflower/node-sdk/llm`);
  HITL reply meta from an injected port predicate / pre-tagged frames — never
  from palette.
- Permission ask / grant / deny are first-class **feed-source events**, but
  not falsely labelled runtime port events: ask is server-authoritative;
  grant/deny arrive only through the server-authoritative
  `runner.permission.accepted` fact.
- TDD: write failing cases first (HITL/steer interleave, multi-port, multi-node,
  snapshot replay identity), then implement.
- **Custom RxJS `OperatorFunction`s are the unit of work** (see
  [REACTIVITY](../../REACTIVITY.md) § Custom RxJS operators) — not a single
  imperative `bucketEvents` helper wrapped in `map`. Compose them in one
  public pipe (`foldPortEventsToNodeFeed`); tests may target operators alone
  or the composer.
- **Output shape is nested Observables** (not a flat `FeedState` array):
  1st = nodes, 2nd = ports per node, 3rd = streaming values per port —
  each level an `Observable` of a **list** so `@for` + nested `async` works.

---

## Required types

Normalize **string-port** frames only (`portId: symbol` is out of the feed
model — same as today’s fold). Prefer reusing `RunId` / port state from
`@langflower/runtime` where the shape already matches; do **not** invent a
parallel `RuntimeRunnerEvent`.

### Feed-event presentation taxonomy

This is a **semantic classification**, separate from the runtime transport
kind (`output-emitted` / `input-received`) and separate from palette lookup.
The normalizer receives it as explicit metadata or an injected resolver; it
must never guess it from arbitrary text.

| Presentation                           | Source and payload                                     | UI contract (future switch only)                                                                            |
| -------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `data`                                 | Ordinary input/output; unmarked plumbing               | Secondary data; muted technical block, collapsed by default                                                 |
| `tool-request`                         | Tool/MCP/sub-agent invocation request                  | Distinct tool log, collapsed by default; first half of a tool interaction                                   |
| `tool-response`                        | Tool/MCP/sub-agent result or failure                   | Same tool interaction; second half, appended after its request                                              |
| `reasoning`                            | Model reasoning chunks                                 | Stream in place; only last line visible, older chunks under collapse                                        |
| `draft`                                | Model draft chunks                                     | Stream in a left-aligned agent bubble                                                                       |
| `hitl-user`                            | HITL reply or `steerControl { kind: 'steer', text }`   | Right-aligned user bubble; steering text is not a separate agent/system row                                 |
| `steering-pause`                       | `steerControl { kind: 'pause' }`                       | Distinct pause/control marker; settles the preceding live draft                                             |
| `steering-resume`                      | `steerControl { kind: 'resume' }`                      | Muted control marker only when needed for chronology; never a user bubble                                   |
| `permission-ask`                       | Server `runner.permission.ask`                         | Distinct pending permission cue                                                                             |
| `permission-grant` / `permission-deny` | Accepted `runner.permission.reply`                     | Distinct decision record only after server `runner.permission.accepted`; retain authoritative source status |
| `result`                               | Author-marked final/result port                        | Important agent result bubble                                                                               |
| `recovery`                             | Retry/suspended/recovery port                          | Always-visible recovery notice; may open Steer composer when suspended                                      |
| `shell`                                | Shell command logs                                     | Technical collapsed block; command and output remain ordered                                                |
| `error`                                | Port `state: 'error'` or explicit failed tool response | Visible failure state; error stays data, not an RxJS error                                                  |

**Missing from the original list:** final/result, error/failure, recovery
(retry/suspended), shell/MCP logs, and `steering-resume`. MCP is a
`tool-request` / `tool-response` interaction, while shell stays a separate
technical kind. Run `done` / `interrupted` are lifecycle events, not
port/feed-content rows; they settle chrome in the follow-up projection.

### Required author metadata: close a node visit

**Recommendation: add this metadata to the node-sdk feed contract.** Port names
are not a safe inference rule: a node may call its final port `response`,
`answer`, `approve`, or `deny`, and an `approve` / `deny` may be an
`input-received` gate event rather than an output.

```typescript
type FeedPortMeta = {
	readonly role?: FeedRole;
	readonly visitBoundary?: 'close';
};
```

- Default is `visitBoundary: 'continue'`.
- The terminal port event is still appended to the current node card.
- `visitBoundary: 'close'` then closes that visit. The next port event from
  the same `runId` + `nodeId` creates a new card.
- Mark agent `response` / final ports and Review / HITL `approve` / `deny`
  ports with `close`; do it on both input and output port metadata where that
  node’s terminal fact can arrive on either direction.
- The feed normalizer receives this metadata through its injected resolver; it
  does not import palette state or infer terminality from `portId`.

```typescript
import type { Observable } from 'rxjs';
import type { RunId } from '@langflower/runtime';
import type { SteerControlPayload } from '@langflower/node-sdk/llm';

/**
 * Presentation is supplied at the boundary. It is never inferred from text.
 */
export type FeedPresentation =
	| 'data'
	| 'tool-request'
	| 'tool-response'
	| 'reasoning'
	| 'draft'
	| 'hitl-user'
	| 'steering-pause'
	| 'steering-resume'
	| 'permission-ask'
	| 'permission-grant'
	| 'permission-deny'
	| 'result'
	| 'recovery'
	| 'shell'
	| 'error';

/**
 * `close` appends the terminal frame, then closes that node visit. The next
 * frame for the same `(runId, nodeId)` opens a new feed card / visit.
 */
export type FeedVisitBoundary = 'continue' | 'close';

export type ToolInteractionMeta = {
	readonly presentation: 'tool-request' | 'tool-response';
	/** Required: joins request and response into one collapsed interaction. */
	readonly interactionId: string;
	readonly visitBoundary?: FeedVisitBoundary;
};

export type OrdinaryPortFrameMeta = {
	readonly presentation: Exclude<
		FeedPresentation,
		| 'tool-request'
		| 'tool-response'
		| 'hitl-user'
		| 'steering-pause'
		| 'steering-resume'
		| 'permission-ask'
		| 'permission-grant'
		| 'permission-deny'
	>;
	readonly visitBoundary?: FeedVisitBoundary;
};

export type PortFrameMeta = ToolInteractionMeta | OrdinaryPortFrameMeta;

export type PermissionDecisionMeta = {
	readonly presentation:
		'permission-ask' | 'permission-grant' | 'permission-deny';
	readonly askId: string;
	/** Ask and accepted decision are server-authoritative facts. */
	readonly authority: 'server';
};

export type HitlUserMeta = {
	readonly presentation: 'hitl-user';
	readonly origin: 'hitl-reply' | 'steer';
	readonly payload?: SteerControlPayload;
	readonly visitBoundary?: FeedVisitBoundary;
};

export type SteeringMeta =
	| {
			readonly presentation: 'steering-pause';
			readonly payload: SteerControlPayload;
			readonly visitBoundary?: FeedVisitBoundary;
	  }
	| {
			readonly presentation: 'steering-resume';
			readonly payload: SteerControlPayload;
			readonly visitBoundary?: FeedVisitBoundary;
	  };

/** One chronological server frame after feed-relevant filtering. */
export type PortEventFromServer = {
	readonly source: 'port';
	readonly kind: 'output-emitted' | 'input-received';
	readonly runId: RunId;
	readonly nodeId: string;
	readonly portId: string;
	readonly state: 'value' | 'error' | 'pending';
	readonly value: unknown;
	readonly meta: PortFrameMeta | HitlUserMeta | SteeringMeta;
};

/**
 * Permission is carried on the bridge control plane, not a runtime port.
 * The synthetic portId keeps it addressable in the same node → port hierarchy.
 */
export type PermissionFeedEvent = {
	readonly source: 'permission';
	readonly kind: 'permission';
	readonly runId: RunId;
	readonly nodeId: string;
	readonly portId: `permission:${string}`;
	readonly state: 'value' | 'error' | 'pending';
	readonly value: unknown;
	readonly meta: PermissionDecisionMeta;
};

export type FeedEventFromSource = PortEventFromServer | PermissionFeedEvent;

/** One emission on a port’s value stream (order = fold order). */
export type PortStreamItem = {
	readonly source: FeedEventFromSource['source'];
	readonly runId: RunId;
	readonly state: FeedEventFromSource['state'];
	readonly value: unknown;
	readonly meta: FeedEventFromSource['meta'];
	/** Monotonic index in the source `FeedEventFromSource[]` sequence. */
	readonly seq: number;
};

/**
 * 3rd level — port streaming. `stream` emits the **full list so far** of
 * items for this `(runId, nodeId, visitId, portId)` (replay + append), so
 * `@for (item of port.stream | async)` works.
 */
export type PortEvent = {
	readonly portId: string;
	readonly stream: Observable<readonly PortStreamItem[]>;
};

/**
 * 2nd level — ports for one node. `foldedEventsFromPorts` emits the **full
 * port list so far** (first-seen order), each port carrying its 3rd-level
 * `stream`.
 */
export type NodeFeedItem = {
	readonly runId: RunId;
	readonly nodeId: string;
	/** Deterministic visit key, e.g. `${runId}:${nodeId}:${firstSeq}`. */
	readonly visitId: string;
	/** True after this visit receives its explicit terminal boundary frame. */
	readonly isClosed: boolean;
	readonly foldedEventsFromPorts: Observable<readonly PortEvent[]>;
};

/**
 * 1st level — run-scoped node visits. Composer output: list of
 * `(runId, nodeId, visitId)` groups in first-seen order. Same input array ⇒
 * same visit order, port order, and per-port seq/values.
 */
export type FoldPortEventsToNodeFeed = (
	events$: Observable<readonly FeedEventFromSource[]>,
) => Observable<readonly NodeFeedItem[]>;
```

### Nested Observable output (async-pipe contract)

**Highlight:** the fold product is intentionally **nested Observables**, not a
single flattened projection. A future work-log template unwraps with nested
`async` pipes (wire-up is **out of scope** for this epic):

| Level | What                  | Type                                                | Template unwrap                                    |
| ----- | --------------------- | --------------------------------------------------- | -------------------------------------------------- |
| 1st   | Nodes                 | `Observable<readonly NodeFeedItem[]>`               | `@for` over `nodes$` + `async`                     |
| 2nd   | Ports of a node       | `Observable<readonly PortEvent[]>` on the node      | `@for` over `node.foldedEventsFromPorts` + `async` |
| 3rd   | Port streaming values | `Observable<readonly PortStreamItem[]>` on the port | `@for` over `port.stream` + `async`                |

```html
<!-- illustrative follow-up UI — not part of this epic -->
@for (node of nodeFeed$ | async; track node.visitId) {
<section>
	@for (port of node.foldedEventsFromPorts | async; track port.portId) { @for
	(item of port.stream | async; track item.seq) {
	<!-- render item.value / item.meta.presentation -->
	} }
</section>
}
```

Rules for nested streams:

- Each level emits a **list snapshot** (growing, first-seen stable order), not
  a single latest scalar — otherwise nested `@for` + `async` cannot iterate.
- Late subscribers must see the same lists (replay); new frames append without
  reshuffling earlier `nodeId` / `portId` order (I5).
- Do **not** collapse to today’s flat `FeedSection[]` inside this feature.
- The three levels are projections of **one** shared
  `Observable<readonly FeedEventFromSource[]>`; a child Observable must not be
  `of(...)` plus a private `shareReplay` reconstructed independently for every
  outer snapshot.
- The current input is an authoritative **full history snapshot**. It replaces
  the prior history; an append is represented by the next longer array. A later
  live-event adapter may build that array with a separate `scan`, but is out of
  scope here.
- An open node is keyed by `(runId, nodeId)`, a visit by
  `(runId, nodeId, visitId)`, and a port stream by
  `(runId, nodeId, visitId, portId)`. The keys prevent a stale run from
  appending to a later run of the same graph node.

### Normalization helper (feature-local)

```typescript
export type ToPortEventFromServerOptions = {
	/**
	 * True when `portId` is a HITL reply input. Caller supplies this without
	 * palette (tests: fixed set; later UI wiring may close over defs).
	 * Default: never HITL.
	 */
	readonly isHitlReplyPort?: (portId: string) => boolean;
	/**
	 * Assigns semantic presentation for non-HITL/non-steer port frames.
	 * The boundary may use author metadata later; this feature never reads
	 * palette snapshots itself. Default: `{ presentation: 'data' }`.
	 */
	readonly resolvePortMeta?: (event: unknown) => PortFrameMeta;
};

/** Map a runtime/bus frame into `PortEventFromServer` or skip. */
export type ToPortEventFromServer = (
	event: unknown, // RuntimeRunnerEvent at call sites
	options?: ToPortEventFromServerOptions,
) => PortEventFromServer | null;
```

- Accept `output-emitted` / `input-received` with `typeof portId === 'string'`.
- Drop `done`, symbol ports, and non-port kinds.
- **Steer (in scope):** if `portId === STEER_CONTROL_PORT_ID` and
  `isSteerControlPayload(value)`, preserve the exact payload and classify:
  `pause` → `steering-pause`; `steer` → `hitl-user` with
  `origin: 'steer'`; `resume` → `steering-resume`. The fold does not invent
  separate settle actions.
- **HITL (in scope):** if `kind === 'input-received'` and
  `options.isHitlReplyPort?.(portId)` → `meta: { presentation: 'hitl-user',
origin: 'hitl-reply' }`. No palette / `config.hitl` lookup inside this
  feature.
- Otherwise → `options.resolvePortMeta?.(event)` or
  `{ presentation: 'data' }`.
- Correctness: HITL/steer frames stay in source order under the right
  `(nodeId, portId)` streams, with `meta` intact on every `PortStreamItem`.

### Permission boundary adapter (feature-local)

`runner.permission.ask` and server `runner.permission.accepted` decisions are
not runtime port telemetry. Adapt them into `PermissionFeedEvent` **before**
merging with the port history arrays:

- ask → synthetic `portId: 'permission:' + askId`, `presentation:
'permission-ask'`, `authority: 'server'`;
- accepted Allow → `presentation: 'permission-grant'`, `authority: 'server'`;
- accepted Deny → `presentation: 'permission-deny'`, `authority: 'server'`.

The adapter must preserve arrival order within its input source. Merging port
and permission sources into one chronological array is a composition-boundary
responsibility; this pure feature accepts the resulting ordered array and does
not invent an arrival timestamp. Until composition supplies that ordering,
cross-source chronology is **unknown** — do not use `merge` timing or a local
clock as a substitute.

### Two-part tool interaction

A tool / MCP / sub-agent interaction is not one concatenated string:

1. Emit `tool-request` with an `interactionId` when invocation starts.
2. Emit `tool-response` with the **same** `interactionId` when it settles.
   Preserve `state: 'error'` for failure; do not convert it to an RxJS error.

The port stream carries both items in chronological order. The later UI groups
them by `interactionId` into one collapsed tool disclosure, with request first
and response second. A missing `interactionId` is a data-contract violation:
render as secondary `data`, do not heuristically pair by adjacent text.

---

## Draft implementation

### Unit of work: custom RxJS operators

Per [REACTIVITY](../../REACTIVITY.md) § Custom RxJS operators and
[PRINCIPLES](../../PRINCIPLES.md): reusable stream transforms are
`OperatorFunction`s used inside `pipe`, **not** `(events) => …` bucket helpers
and **not** `(stream$) => stream$.pipe(…)` wrappers.

| Layer     | Shape                           | Role                                                                                              |
| --------- | ------------------------------- | ------------------------------------------------------------------------------------------------- |
| Operator  | `(): OperatorFunction<In, Out>` | One deterministic projection; operators accepting a node/port key still return `OperatorFunction` |
| Composer  | `foldPortEventsToNodeFeed`      | Shares the source once, then wires `sharedFrames$.pipe(projectNodeFeed(sharedFrames$))`           |
| Normalize | `toPortEventFromServer`         | Pure frame map (non-stream); may feed a thin `mapToPortEventFromServer(opts)` operator later      |

TDD targets **each operator** first (marble / synchronous `of(array)` cases),
then the composer for end-to-end invariants.

### Layout

```text
packages/ui/src/app/features/feed-folding/
├── types.ts                      # PortEventFromServer, PortEvent, NodeFeedItem, …
├── to-port-event.ts              # RuntimeRunnerEvent → PortEventFromServer | null
├── to-permission-feed-event.ts   # ask / accepted decision → PermissionFeedEvent
├── fold-port-events.ts           # composer: pipe of operators below
├── operators/
│   ├── assign-seq.ts             # attach monotonic seq
│   ├── node-visits.ts            # run/node visits, split on `close`
│   ├── ports-for-node.ts          # node id + shared source → port list
│   ├── items-for-port.ts          # node/port ids + shared source → item list
│   └── project-node-feed.ts      # shared source → outer node list
└── tests/
    ├── to-port-event.test.ts
    ├── to-permission-feed-event.test.ts
    ├── operators/
    │   ├── assign-seq.test.ts
    │   ├── node-visits.test.ts
    │   ├── ports-for-node.test.ts
    │   ├── items-for-port.test.ts
    │   └── project-node-feed.test.ts
    └── fold-port-events.test.ts   # composer / I1–I10 / I3b–I3d
```

No `components/`. No import from `sidebar/` presentation modules (avoid pulling
`FeedSection` / timeline). May import steer guards / `STEER_CONTROL_PORT_ID`
from `@langflower/node-sdk/llm`. Must **not** import palette snapshots or
`execution-catalog`. Platform `services/execution-feed-fold.ts` must **not**
import this feature yet.

### Algorithm (deterministic)

Input: `Observable<readonly FeedEventFromSource[]>` — each emission is the
**full** chronological list so far (snapshot replace or append-rebuild; caller
chooses). The composer assigns sequence, then shares the resulting frames once:

```typescript
const sharedFrames$ = events$.pipe(
	assignSeq(),
	shareReplay({ bufferSize: 1, refCount: true }),
);
```

Every downstream operator is a pure projection of `sharedFrames$`; it must not subscribe
internally. `refCount: true` means the feature does not retain an execution
history after the final UI subscriber leaves. The later work-log integration
owns any application-lifetime subscription.

Pipeline (names may tighten; order must hold):

1. `assignSeq()` — maps each source history to `SequencedFrame[]`, assigning
   `seq = array index`. It neither sorts nor deduplicates frames.
2. `nodeVisits()` — folds the sequenced history into first-seen
   `({ runId, nodeId, visitId })[]`, closing / opening visits at explicit
   `meta.visitBoundary` values.
3. `portsForNode(runId, nodeId, visitId)` — maps the **same shared history** to
   first-seen `PortEvent[]` for that visit. Each `PortEvent` receives an
   `itemsForPort` projection over that same source.
4. `itemsForPort(runId, nodeId, visitId, portId)` — filters the shared history
   for that exact key and maps it to ordered `PortStreamItem[]`;
   `meta` and `seq` survive unchanged.
5. `projectNodeFeed(sharedFrames$)` — an `OperatorFunction` that creates the
   1st-level run-scoped `NodeFeedItem[]`; each node owns the 2nd-level
   `portsForNode(runId, nodeId, visitId)`, and each port owns the 3rd-level
   `itemsForPort(runId, nodeId, visitId, portId)`.

The output therefore updates from the source at all levels:

```text
sharedFrames$
  └─ nodeFeed$                         Observable<NodeFeedItem[]>
       └─ node.foldedEventsFromPorts    Observable<PortEvent[]>
            └─ port.stream              Observable<PortStreamItem[]>
```

`NodeFeedItem` and `PortEvent` object identity is **not** part of this epic’s
contract. Deterministic content, ordering, and replay are. Angular tracks node
visit rows by `visitId` and port rows by `portId`, not object reference.

### Concurrent swarm streams — append heuristic

The current UI fold has one global active section; that model splits
interleaved Agent A / Agent B output into repeated sections. The new fold must
not use a global “last node” pointer.

For every incoming frame:

1. Resolve `nodeKey = (runId, nodeId)` and find its latest **open** visit.
2. If an open visit exists, append the frame there, even when another node
   emitted a frame more recently.
3. Resolve `portKey = (runId, nodeId, visitId, portId)`.
4. If that port key already exists, append to its existing stream; otherwise
   append one new `PortEvent` to the open node visit.
5. If no open visit exists, create one with deterministic
   `visitId = '${runId}:${nodeId}:${firstSeq}'`.
6. If the appended frame has `meta.visitBoundary === 'close'`, mark that visit
   closed **after** retaining the terminal item. The following frame for the
   same `nodeKey` opens a fresh visit.

This is the required **interleaving/re-entry heuristic**: a re-entry to a
known node during the same run is continuation, not a new feed card. It
detects a swarm by its observable event shape (`A₁ → B₁ → A₂`), not by a
wall-clock threshold. A time window would be nondeterministic under provider
latency, reconnect replay, and test scheduling.

```text
A.draft₁ → B.draft₁ → A.draft₂ → B.tool-request → A.draft₃

nodeFeed = [A#1, B#1]             # never [A#1, B#1, A#1, B#1, A#1]
A.draft.stream = [draft₁, draft₂, draft₃]
B.draft.stream = [draft₁]
B.tool.stream  = [tool-request]
```

The heuristic is deliberately run-scoped. `run-2:A` opens a new node group
after `run-1:A`, even when both use the same persisted graph `nodeId`.

### Cycles and repeated agents

Swarm interleaving and graph cycles are independent. A node may complete one
visit, other swarm nodes may continue streaming, and the first node may run
again in the **same** `runId`. Its terminal metadata, not elapsed time or an
event from another node, determines whether the next frame starts a new card.

```text
A.draft₁ → B.draft₁ → A.response(close) → B.draft₂ → A.draft₂

nodeFeed = [A#1, B#1, A#2]
A#1 = [draft₁, response]
B#1 = [draft₁, draft₂]
A#2 = [draft₂]
```

Without `visitBoundary: 'close'`, `A.draft₂` continues `A#1`. This is
intentional: the fold must not invent completion from a quiet period, from a
different node’s output, or from a familiar port name.

### Operator contracts and subscription mechanics

```typescript
type SharedFrames = Observable<readonly SequencedFrame[]>;
type NodeFeedKey = Pick<SequencedFrame, 'runId' | 'nodeId'>;
type NodeVisitKey = NodeFeedKey & {
	readonly visitId: string;
};

const nodeVisits = (): OperatorFunction<
	readonly SequencedFrame[],
	readonly NodeVisitKey[]
> => /* split one run/node into visits after explicit close frames */;

const itemsForPort = (
	frames$: SharedFrames,
	runId: RunId,
	nodeId: string,
	visitId: string,
	portId: string,
): OperatorFunction<
	readonly SequencedFrame[],
	readonly PortStreamItem[]
> => /* project the supplied shared source for this key */;

const portsForNode = (
	frames$: SharedFrames,
	runId: RunId,
	nodeId: string,
	visitId: string,
): OperatorFunction<
	readonly SequencedFrame[],
	readonly PortEvent[]
> => /* first-seen ports; each retains itemsForPort(frames$, ...) */;

const projectNodeFeed = (
	frames$: SharedFrames,
): OperatorFunction<
	readonly SequencedFrame[],
	readonly NodeFeedItem[]
> => /* first-seen nodes; each retains portsForNode(frames$, ...) */;
```

- The operator input is retained for type-safe pipe composition; keyed operators
  use the supplied `frames$` only to create their nested child projections.
  They do not call `.subscribe()`.
- A nested `async` pipe subscribes only to its level. Because every child uses
  `sharedFrames$`, it immediately receives its replayed current history and
  then later source histories; it does not need a UI-owned `BehaviorSubject`.
- The source array is the ordering authority. `filter` preserves its order;
  do not use `mergeMap`, `combineLatest`, timestamps, or per-port scheduling
  to reconstruct chronology.
- Visit splitting reads `meta.visitBoundary` with a discriminated guard; a
  source kind without that field (for example permission) defaults to
  `'continue'`. Do not cast all feed metadata to a terminal-capable shape.
- A source error remains an Observable error at every derived level. Expected
  runtime errors are `state: 'error'` frames and stay data, not thrown errors.
- Completion is forwarded. It is not a “settle feed” event; terminal visual
  status remains the current UI fold’s responsibility until the follow-up.

**Invariants (encode as tests):**

| #   | Invariant                                                                                                                                                                                            |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I1  | Same `events` array ⇒ same `(runId, nodeId, visitId)` order and per-visit `portId` order.                                                                                                            |
| I2  | Concatenating all `PortStreamItem` in node-major / port-major / seq order recovers the filtered source sequence.                                                                                     |
| I3  | Interleaved HITL: `output-emitted` then `input-received` (`meta.presentation === 'hitl-user'`) keeps `seq` order; meta survives on stream items; no drops.                                           |
| I3b | Steer: `input-received` on `steerControl` with `{ kind: 'pause' }` then `{ kind: 'steer', text }` → same port stream; `steering-pause` then `hitl-user` / `origin: 'steer'`; payload is preserved.   |
| I3c | Tool request then response with the same `interactionId` retains that exact order in one port stream; an explicit failed response has presentation `error` or `tool-response` plus `state: 'error'`. |
| I3d | Permission ask / grant / deny are preserved as a synthetic `permission:<askId>` port stream; every item is server-authoritative.                                                                     |
| I4  | Two nodes alternating frames ⇒ two `NodeFeedItem`s; each port stream only sees its own frames.                                                                                                       |
| I5  | Replacing the array with a prefix then a longer list (replay growth) never reorders already-seen `(nodeId, portId)` pairs; new ports/nodes append.                                                   |
| I6  | Empty list ⇒ empty `NodeFeedItem[]`.                                                                                                                                                                 |
| I7  | One subscription to the outer source serves nested node/port/value projections; child projections do not create independent source subscriptions or retain history after their subscribers leave.    |
| I8  | Replacing source history with `[]` clears every nested list on its next emission; there is no hidden `scan` cache in this feature.                                                                   |
| I9  | Swarm interleave `A₁ → B₁ → A₂ → B₂` in one run produces exactly `[A, B]`; `A₂` / `B₂` append to their prior node and port streams, not new node groups.                                             |
| I10 | A `visitBoundary: 'close'` frame remains the last item of its current visit; the following same-run frame for that node opens exactly one new visit, even while other swarm nodes stream.            |

### Sketch

```typescript
// operators/assign-seq.ts
import type { OperatorFunction } from 'rxjs';
import { map } from 'rxjs/operators';
import type { FeedEventFromSource } from '../types';

export type SequencedFrame = FeedEventFromSource & {
	readonly seq: number;
};

export const assignSeq = (): OperatorFunction<
	readonly FeedEventFromSource[],
	readonly SequencedFrame[]
> => map((events) => events.map((event, seq) => ({ ...event, seq })));

// operators/node-visits.ts — OperatorFunction<SequencedFrame[], NodeVisitKey[]>
// operators/ports-for-node.ts — takes shared SequencedFrame[] source + visit key:
//   Observable<PortEvent[]>; each PortEvent receives itemsForPort(...)
// operators/items-for-port.ts — takes shared SequencedFrame[] source + visit/port key:
//   Observable<PortStreamItem[]>; filter only, preserving source order
// operators/project-node-feed.ts — OperatorFunction<SequencedFrame[], NodeFeedItem[]>
//   Factory closes over sharedFrames$ only to create child projections.
//   Each NodeFeedItem.foldedEventsFromPorts: Observable<PortEvent[]>
//   Each PortEvent.stream: Observable<PortStreamItem[]>
//   Child streams derive from sharedFrames$, never `of(...)` snapshots.

// fold-port-events.ts — composer only
import type { FoldPortEventsToNodeFeed } from './types';
import { assignSeq } from './operators/assign-seq';
import { projectNodeFeed } from './operators/project-node-feed';
import { shareReplay } from 'rxjs/operators';

export const foldPortEventsToNodeFeed: FoldPortEventsToNodeFeed = (events$) => {
	const sharedFrames$ = events$.pipe(
		assignSeq(),
		shareReplay({ bufferSize: 1, refCount: true }),
	);

	return sharedFrames$.pipe(projectNodeFeed(sharedFrames$));
};
```

**Anti-patterns for this epic:**

- One exported `bucketEvents(array)` that does grouping + projection, then
  `map(bucketEvents)` as the whole feature.
- `(events$) => events$.pipe(…)` wrappers instead of `OperatorFunction` factories.
- Mutable maps/closures shared across operator factory calls or across
  emissions (each `map` callback builds fresh structures).
- Emitting a single `PortEvent` / `PortStreamItem` from nested streams (breaks
  nested `@for` + `async`); always emit **list snapshots** at each level.
- `shareReplay` inside every newly constructed node / port object while the
  parent creates a new object for every history emission. Share the source once;
  derive child streams from it.
- `groupBy` on the infinite live source without an explicit completion policy:
  its groups can leak and do not satisfy snapshot replacement / clear semantics.

Refinements allowed during TDD (operator boundaries, `shareReplay` placement,
and type names) as long as I1–I10 / I3b–I3d hold, source sharing remains
singular, and the pipe remains operator-composed.

### TDD cases (minimum)

Prefer one test file per operator; composer tests own cross-cutting invariants.

1. **Empty → empty.**
2. **Single output port, two string chunks** — one node, one port, two stream
   items with increasing `seq`.
3. **HITL interleave** — `output-emitted` (`draft`) → `input-received`
   (`meta.presentation === 'hitl-user'`, `origin: 'hitl-reply'`) →
   `output-emitted` (same draft port); reply port is a second `PortEvent` on
   the same node; `seq` + meta preserved (I2, I3).
4. **Steer pause → steer text** — two `input-received` on `steerControl` with
   pause then steer payloads; one port stream; `meta.payload.kind` matches (I3b).
5. **Multi-node** — A then B then A; node order `[A, B]`; A’s port stream has
   two items with gap in `seq`.
6. **History growth under replay** — emit `[e0]`, then `[e0,e1,e2]`;
   subscriptions already unwrapped at each level see stable key order and
   updated list snapshots; collecting streams matches full history.
7. **`toPortEventFromServer`** — drops symbol `portId` and `done`; tags steer
   from port id + payload (pause / steer / resume); tags HITL only when
   `isHitlReplyPort` says so; defaults ordinary ports to `data`; never reads
   palette.
8. **Presentation matrix** — injected metadata classifies `data`, reasoning,
   draft, shell, result, recovery, and error without a palette import; exact
   presentation reaches the matching `PortStreamItem`.
9. **Tool two-part interaction** — request then response with one
   `interactionId`, including an error response; assert ordering and default
   collapsed classification.
10. **Permission adaptation** — ask, grant, deny for one `askId`; assert
    synthetic port identity and server-authority markers.
11. **Nested `async` lifetime** — subscribe outer → node ports → port stream;
    emit a longer source history and assert the already-subscribed child stream
    emits its updated list. Unsubscribe all consumers; assert `refCount` tears
    down the one shared source subscription.
12. **Authoritative clear** — emit populated history, then `[]`; outer nodes,
    inner ports, and port items each emit `[]` without stale cache.
13. **Two concurrent agents** — interleave
    `A.draft₁ → B.draft₁ → A.draft₂ → B.draft₂`; assert first-level node keys
    are `[run-1:A, run-1:B]`, both already-unwrapped child streams update in
    place, and neither re-entry creates another node group.
14. **Concurrent draft + tool** — while A continues `draft`, B emits
    `tool-request` then `tool-response`; assert A’s draft appends to A, B’s
    two tool items append to B under one `interactionId`, and source `seq`
    remains the cross-node chronology.
15. **Same node in next run** — `run-1:A.draft` followed by
    `run-2:A.draft` creates two node groups, never appending old output into
    the later run.
16. **Cyclic agent amid swarm** — interleave
    `A.draft₁ → B.draft₁ → A.response(close) → B.draft₂ → A.draft₂`; assert
    `[A#1, B#1, A#2]`, with `response` retained in A#1 and A#2 starting only
    at the post-close frame.
17. **Review/HITL terminal ports** — `approve(close)` and `deny(close)` on the
    direction where each node emits its terminal fact split its next same-node
    event into a new visit; unmarked ports never split a visit by name alone.

---

## Blast radius

| Area                                                              | Touch?               | Notes                                                                      |
| ----------------------------------------------------------------- | -------------------- | -------------------------------------------------------------------------- |
| `packages/ui/src/app/features/feed-folding/**`                    | **Yes — create**     | Sole implementation surface; one shared source and nested projections      |
| `packages/ui` vitest discovery                                    | **Yes — if needed**  | Ensure new `tests/` are picked up                                          |
| `@langflower/node-sdk` feed metadata                              | **Yes — extend**     | Add `feed.visitBoundary?: 'close'` to input/output port authoring metadata |
| `@langflower/node-sdk/llm` steer types/guards                     | **Read-only import** | Classify `steerControl` meta                                               |
| Palette / `execution-catalog` / `hitl-projection`                 | **No**               | HITL via injected predicate only                                           |
| `execution-feed-fold.ts` / `feed-section.ts` / `feed-timeline.ts` | **No**               | Stay authoritative for live UI                                             |
| `WorkflowExecutionService` / work-log components                  | **No**               | Follow-up epic                                                             |
| `@langflower/runtime` / `@langflower/shared` protocol             | **No**               | Consume existing event shapes only                                         |
| Docs use-case Status / feed-panel product copy                    | **No**               | Optional one-line pointer in epic index only                               |
| Integration / WS tests                                            | **No**               | Unit-only for this abstraction                                             |

**Follow-up (not this epic):** switch UI feed to `foldPortEventsToNodeFeed`,
map `NodeFeedItem` → today’s `FeedState` / timeline, delete obsolete fold
paths. Track separately (e.g. revive [feed-refactor.md](../feed-refactor.md)
as its own epic when ready).

---

## Acceptance criteria

1. Feature folder `features/feed-folding/` exists with types +
   `toPortEventFromServer` + permission adapter + **custom operators** + thin
   composer, and **no** components.
2. Public composer shares `events$` once, then applies an
   `OperatorFunction` chain implementing
   `Observable<readonly FeedEventFromSource[]> → Observable<readonly NodeFeedItem[]>`
   with **nested list Observables** at port and stream levels (async-pipe
   contract above); invariants I1–I10 / I3b–I3d covered (per-operator tests +
   composer); presentation and source-authority metadata preserved; no palette
   imports.
3. Every taxonomy presentation has an explicit source/metadata contract; tool
   request/response requires a shared `interactionId`, HITL/steer text is
   `hitl-user`, and permission events retain server authority.
4. Interleaved same-run swarm frames append by
   `(runId, nodeId, visitId, portId)` to an open visit; they never create
   duplicate open visits or depend on a time-window heuristic.
5. Explicit `feed.visitBoundary: 'close'` appends the terminal
   response/approve/deny event, then forces the next same-node frame into a
   new visit; metadata must exist for terminal input and output ports.
6. No production importer outside `feed-folding/` (especially not
   `execution-feed-fold` / work-log) — enforced by review; knip/dead-code must
   not force a fake consumer (tests are enough).
7. Existing feed UI behaviour unchanged (no intentional edits under
   `services/execution-feed-fold.ts` or sidebar feed projection).
8. Close-out gate green (below).

## Verify

- Intermediate (optional): focused vitest on
  `packages/ui/src/app/features/feed-folding/**` while iterating;
  `verify --quick` during the loop.
- **Close-out (required):** `npm run test` or full
  `node build/tools/agent-run.mjs verify` — unit **and** integration. Do not
  mark the epic done on `--quick` alone.
