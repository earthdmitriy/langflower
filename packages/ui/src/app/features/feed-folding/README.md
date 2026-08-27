# Feed folding

`feed-folding` turns the raw execution channels exposed by
`LangflowerBridgeService` into nested, replayable RxJS streams for the work log:

```text
raw/cached bridge streams
  → composer scan (append-only FeedProjection)
  → NodeFeedItem[]
    10|      → node.foldedEventsFromPorts: PortEvent[]  (chronological segments)
          → port.stream: PortStreamItem[]
```

There is no flat `FeedSection` or timeline projection. The work log unwraps with
nested `async` pipes only.

## Hard rule — never re-fold history on a new event

**On each live bridge frame, fold that one event into the existing
`FeedProjection`. Never recompute the entire fold from the full history.**

Streaming tokens arrive as a high-frequency event stream. Re-walking all prior
frames (or re-running visit assignment / port collapse per subscriber) is an
antipattern and will dominate the JS main thread.

| Allowed                                                                                | Forbidden                                                                  |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `appendFeedFrame(projection, oneEvent)`                                                | `history.map` / `reduce` over all frames on every token                    |
| `foldPortStream(portItems, oneFrame)` on that segment only                             | `replayPortStream(allMatchingFrames)` on every emit                        |
| Nested streams **select** from shared `projection$`                                    | Per-port / per-visit rematerialize of full history (`visitFrames` fan-out) |
| Snapshot / clear / catalog change → rebuild **once** by replaying the same append fold | Treating every history array emission as “rebuild projection from scratch” |

Full rebuild is allowed **only** when the authoritative history is replaced or
reclassified:

1. `executionFeed.snapshot` (replace + replay once),
2. clear (`null` snapshot),
3. catalog change (re-normalize retained raw entries + replay once).
   A **document switch** (different `workflowId` **and** node-id set) clears
   entries first — rename (new id, same nodes) does not.

Those are rare relative to live tokens. Live `output-emitted` / `input-received`
/ permission facts must stay O(1) in history length.

```text
✅ empty → append(e0) → append(e1) → … → FeedProjection
   (snapshot = clear, then the same append loop once)

❌ each token: visitFrames(all) × ports × replayPortStream(matching)
❌ each token: buildFeedProjection(entireHistoryArray)
```

Canonical implementation:

- [`operators/feed-projection.ts`](operators/feed-projection.ts) —
  `appendFeedFrame` / `replayFeedProjection`
- [`fold-port-events.ts`](fold-port-events.ts) — composer `scan` over bridge +
  catalog actions
- [`operators/feed-folding-operators.ts`](operators/feed-folding-operators.ts) —
  nested selectors only (no history remap)

## Border cases (read this)

These are easy to get wrong. Do not “simplify” them away.

### 1. Non-streaming loop / Concat

```text
❌ One Concat card forever — every later loop emission appends to the first card
✅ Concat → Agent → Concat  ⇒  visits [Concat, Agent, Concat]
```

Only when Concat ports **opt in** with a feed role (unmarked Concat is omitted).
`feed.streaming` absent ⇒ frame closes the visit. While-last reopen keeps
consecutive Concat emits on one card **only while that visit is still last**.

### 2. Unmarked setup does not open a visit

```text
❌ Helper.userPrompt (unmarked) opens a card before reasoning
✅ Unmarked userPrompt / tools are omitted; the visit opens on the first
   visible port (reasoning / draft / result)

❌ Orchestrator unmarked tools/userPrompt open a card; after Explorer,
   Orchestrator.reasoning appends into that early card
✅ Orchestrator.draft → Explorer.draft → Orchestrator.reasoning
   ⇒  [Orchestrator, Explorer, Orchestrator]  // stream at bottom
```

Streaming continues an open visit, or **while-last reopens** the last visit
when it is the same node. Streaming after **other** nodes intervene opens a
**new** visit. Unmarked plumbing cannot create or keep a visit.

### 3. Concurrent streaming agents

```text
❌ A.draft → B.draft → A.draft  ⇒  three cards / new A visit
✅ A.draft → B.draft → A.draft  ⇒  visits [A, B]; A’s second draft stays on A
```

`feed.streaming: true` ⇒ while-open while that node’s visit is open; otherwise
while-last reopen only when the timeline tail is the same node.

### 4. No author `visitBoundary`

```text
❌ Custom-node authors must mark visitBoundary: 'close' on every terminal port
✅ Authors only set feed.streaming: true on stream ports
   (!streaming ⇒ derived internal meta.visitBoundary: 'close')
```

### 5. LLM multi-phase timeline inside one visit

```text
❌ Unique port slots [reasoning, draft, toolLog]
   — later reasoning merges into the first reasoning row (above tools)
✅ Port segments: reasoning → draft → tools → reasoning
   — same portId may appear twice; growing-merge is per segment only
```

Continue the last segment only while `portId` matches; otherwise open a new
`segmentId`. Work log tracks `port.segmentId`.

### 6. Streaming chrome on superseded segments

```text
❌ Open visit ⇒ every past reasoning/draft row keeps streaming…
❌ Draft bubble tied to visit.isClosed — collapses when visit closes / next node appears
✅ streaming… only on last segment of an open visit; earlier reasoning settles to details
✅ Draft always a markdown bubble; only streaming… is last-segment + open-visit
```

Reasoning live peek requires `!visit.isClosed &&` segment `$last`. Visit header
`working…` follows visit open + run status, and is hidden while a recovery
row is in the stream.

### 7. Result hides only the last draft

```text
❌ Result lands ⇒ hide every draft (erases tool↔draft history)
✅ Result lands ⇒ hide only the last draft segment; earlier drafts stay
```

`NodeFeedItem.hasResult` + `lastDraftSegmentId` drive the work-log gate so the
final answer is not duplicated as draft + result.

### 8. Recovery stays in timeline order

```text
❌ Lift latest recovery under the node-visit header (or footer-pin it)
   — banner appears before the reasoning/draft block that tripped it
❌ Snapshot pinnedRecovery on the outer nodeFeed$ map
   — idle stays “current” while a later dead-loop row is in the stream
✅ Recovery is a normal port segment after reasoning or draft
   (dead-loop channel is either; do not special-case one)
✅ NodeFeedItem.pinnedRecovery is the visit tail only when that tail is
   recovery (distinctUntilChanged by seq): hide working…; tick the timer
   on that stream row only. Any later reasoning/draft/result ⇒ headline-only
```

Recovery frames are **not** growing-merged (`foldPortStream` appends a new
item each). Idle autokick, then a non-streaming `result` input (visit close),
then dead-loop + reasoning/draft (while-last reopen) is **one visit** with two
notices in segment order. A frozen latest-seq would still attach the timer to
the idle row. Do not treat two notices as one attempt that changed reason.

### 9. Sub-Agent tool call closes the caller visit

```text
❌ Parent.draft → Parent.toolLog(→ slug) → Writer.draft → Parent.draft
   ⇒ one Parent visit still open; later Parent chunks append off-screen
✅ Parent.draft → Parent.toolLog(→ slug) → Writer.draft [close prev] → Parent.draft
   ⇒ visits [Parent, Writer, Parent]  // continuation at the bottom
```

`toolLog` stays `feed.streaming: true` for ordinary tools (same visit). The
first frame from a `common-sub-agent` node stamps `closesPreviousVisit` and
closes the previous visit (the caller), so the specialist is its own card.
Parent continuation after that is a new visit at the bottom. Ordinary
`→ echo({})` and `←` result lines stay on the open caller visit until a
Sub-Agent node emits.

## Append-only projection

The composer maintains one authoritative `FeedProjection` via `scan`:

```ts
type PortSegmentKey = {
  readonly segmentId: string;
  readonly portId: string;
};

type FeedProjection = {
  readonly visits: readonly /* first-seen */[];
  readonly openVisits: ReadonlyMap</* runId:nodeId */, /* open visit */>;
  readonly portsByVisit: ReadonlyMap</* visitId */, readonly PortSegmentKey[]>;
  readonly itemsByPort: ReadonlyMap</* segmentId */, readonly PortStreamItem[]>;
  readonly nextSeq: number;
};
```

| Action                       | Cost      | Behavior                                                                                                                          |
| ---------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Live port / permission frame | O(1)      | Normalize that frame; `seq = nextSeq++`; visit open/close; segment open/continue; `foldPortStream` into that segment’s items only |
| `executionFeed.snapshot`     | O(N) once | Replace raw history; replay through `appendFeedFrame`                                                                             |
| Clear (`null` snapshot)      | O(1)      | Empty projection (keep catalog if known)                                                                                          |
| Catalog change               | O(N) once | Re-normalize retained raw history; rebuild by replaying appends                                                                   |

Nested `NodeFeedItem` / `PortEvent` / `port.stream` observables are **selectors**
over shared `projection$` (`shareReplay({ bufferSize: 1, refCount: true })`).
They must not hold a private scan of the full event list. Recovery live tail:
**§8**.

### Port-item fold (also event-sourced)

Within a **segment** bucket, [`foldPortStream`](operators/fold-port-stream.ts)
updates items one frame at a time:

- Growing roles (`reasoning` / `draft` / `tool` / `shell`) merge consecutive
  string chunks into one `PortStreamItem` (stable first `seq`).
- `tool-request` / `tool-response` merge only when they share `interactionId`.
- `result`, user, permission, recovery, steering, error → new item each.

Settled one-line peeks use CSS ellipsis. Live reasoning peeks use a 2-line
bottom-aligned `overflow: hidden` pane.

## Input and output

`foldPortEventsToNodeFeed` accepts `FeedBridgeSources` (cached snapshots + live
runner/permission streams) and returns `Observable<readonly NodeFeedItem[]>`.

```ts
const nodeFeed$ = foldPortEventsToNodeFeed({
	executionFeedSnapshot$,
	outputEmitted$,
	inputReceived$,
	permissionAsk$,
	permissionAccepted$,
	workflowSnapshot$,
	paletteSnapshot$,
	customPaletteSnapshot$,
});
```

Rules:

- `executionFeed.snapshot` replaces history and rebuilds once;
- `null` clears projection;
- live facts append into the projection;
- `seq` is assigned only at append time (`nextSeq`);
- visits stay in first-seen order; port **segments** stay chronological;
- frames are never sorted, deduplicated, or timestamped locally.

`ExecutionFeedService` injects the bridge, calls the composer, and exposes
`nodeFeed$` only.

## Visits, nodes, and ports

A visit key is `${runId}:${nodeId}:${firstSeq}`. Authors do **not** set
`visitBoundary`. Normalize derives close from `feed.streaming`:

| Author `feed.streaming`                          | Visit policy                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `true` (reasoning / progress / draft / tool / …) | Continue open visit for `(runId, nodeId)` even if not last (`A.draft → B.draft → A.draft` ⇒ `[A, B]`). If no open visit, **while-last reopen** when the last visit is the same node (e.g. `userPrompt` then `reasoning`); otherwise open a new visit and keep it open. First `common-sub-agent` frame closes the previous visit (§9). |
| absent / false                                   | Stamp internal `meta.visitBoundary: 'close'`. Same continue/reopen rules, then mark the visit closed.                                                                                                                                                                                                                                 |

`result` is **not** a growing presentation: each emit is a new conversation
row (bubble). Multi-emit progress logs must use `role: 'progress'` **and**
`streaming: true` so chunks append on one visit (same layout as reasoning;
work-log caption **PROGRESS**).

Inside a visit, content is a list of **port segments** (`segmentId` + `portId`).
Items are keyed by `segmentId`. The same `portId` may appear as multiple
segments when the port re-enters after another port (LLM multi-phase timeline).

## Raw event classification

Classification runs when appending (or during a one-shot snapshot/catalog
replay). Author roles use exported `RuntimeFeedRole` from `@langflower/runtime`
(`none | reasoning | progress | draft | tool | shell | result | recovery`):

- **`feed.role: 'none'`** or **no role** (event or palette) → **none** —
  nothing in the feed;
- drop pending frames with `value: undefined` or `value: null`
  (wire loading noise; JSON/WS serializes loading as `null`);
- drop `done`, non-port events, and symbol ports;
- tag `steerControl` pause / steer / resume;
- tag HITL reply inputs via palette;
- derive visit close from `feed.streaming !== true` (event or palette);
- first `common-sub-agent` frame closes the previous visit (different node);
- keep runtime errors as `presentation: 'error'` (always close).

Permission asks/decisions come from control-plane channels and project as
synthetic `permission:<askId>` ports (`authority: 'server'`).

## Files

| File                                     | Role                                           |
| ---------------------------------------- | ---------------------------------------------- |
| `types.ts`                               | Source / nested-output contracts               |
| `operators/feed-projection.ts`           | Append-only visit/segment/item projection      |
| `operators/fold-port-stream.ts`          | Per-frame port item fold                       |
| `operators/feed-folding-operators.ts`    | Selectors over `projection$`                   |
| `fold-port-events.ts`                    | Composer scan (history + catalog + projection) |
| `execution-feed.service.ts`              | Angular entry                                  |
| `tests/feed-projection.test.ts`          | Incremental append vs snapshot parity          |
| `tests/fold-port-stream.test.ts`         | Port-item collapse                             |
| `tests/execution-feed.service-*.test.ts` | Mock-bridge scenarios                          |

Product UI behavior: [`docs/features/feed-panel.md`](../../../../../../docs/features/feed-panel.md).
Execution wiring: [`docs/EXECUTION_ARCHITECTURE.md`](../../../../../../docs/EXECUTION_ARCHITECTURE.md)
§ UI execution projections.
