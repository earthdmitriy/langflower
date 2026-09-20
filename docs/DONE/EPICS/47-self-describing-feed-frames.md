# Epic 47 — Self-describing feed frames

**Status:** landed  
**Depends on:** [37-deterministic-feed-fold](37-deterministic-feed-fold.md)
(one `scan` fold, visit/segment projection);
[43-feed-sanity](43-feed-sanity.md) (unmarked ports hidden, `'none'` role)  
**Index:** [README.md](README.md)  
**Related:** [REACTIVITY](../../architecture/REACTIVITY.md),
[EXECUTION_ARCHITECTURE](../../architecture/EXECUTION_ARCHITECTURE.md),
[feed-folding README](../../../packages/ui/src/app/features/feed-folding/README.md),
[feed-panel feature](../../features/feed-panel.md),
[HOW_TO_WRITE_REACTIVE_NODES](../../HOW_TO_WRITE_REACTIVE_NODES.md)

## Goal

A `runner.port` frame carries **everything the work log needs to place it**.
The UI fold stops consulting the palette / workflow catalog to derive
presentation, which removes the only piece of fold state that exists solely for
re-derivation: the retained raw event log plus the full-rebuild path.

Proof of done: `fold-port-events.ts` imports nothing from
`services/execution-catalog` for **normalization**, `FeedComposerState` has no
`entries` and no `catalog`, and a custom pack node with
`feedVisitBoundary: true` gets its own work-log card without the UI knowing its
type.

This epic is a **coupling and state removal**, not a feature. Visible
behaviour must not change for built-in nodes, with one exception called out
below (input ports that declare a feed role currently never reach the feed —
that is a latent bug this epic fixes).

## Why now (verified facts, not assumptions)

1. **Output frames are already authoritative.** `tapOutputPort` stamps the
   author's port meta into slot 6 of the tuple:
   [`runtime-runner.ts:564-573`](../../../packages/runtime/src/runtime-runner.ts)
   (`output.meta.feed`).
2. **Input frames never are.** All six `'in'` emit sites call `emitPortEvent`
   without `defaultFeed`: `pushIntoInput` (two paths), `tapInputPort`,
   seed wiring, `applyPortDefaults`, and the multi-input group wiring.
3. **So the SDK's input `feed` is dead in production.** `makeInput` accepts
   `feed` ([`io-helpers.ts:116`](../../../packages/node-sdk/src/node-factory/define-reactive-node/io-helpers.ts)),
   UI tests exercise input roles through explicit tuple meta, but no runtime
   path ever stamps it. Today no built-in declares input `feed`, so nothing
   visibly breaks — the capability is simply inert.
4. **The catalog fallback exists only for that gap.** `resolveFeedMeta` in
   [`fold-port-events.ts`](../../../packages/ui/src/app/features/feed-folding/fold-port-events.ts)
   reads the definition when slot 6 is `null`. For outputs it reads **the same
   meta object** the runtime already stamped, so the fallback is redundant;
   for inputs it always resolves to "no role" → omitted.
5. **That fallback is what forces the heavy state.** Because the catalog
   arrives late (palette + custom palette + workflow snapshot) and can change
   (hot-swap, document switch), the composer keeps every raw entry forever and
   re-derives the whole projection on the `catalog` action
   (`rebuildProjection`), plus a reset policy (`catalogSwitchedDocument`).
6. **Three folds duplicate the same derivation.** `resolveOutputFeedRole` is
   called from [`execution-hitl-fold.ts`](../../../packages/ui/src/app/features/composer/execution-hitl-fold.ts)
   and [`canvas-node-hitl-projection.ts`](../../../packages/ui/src/app/features/canvas-node-status-folding/operators/canvas-node-hitl-projection.ts)
   as well, for a value that is already in the frame.
7. **Node-level flags have a precedent path to the runtime.** `stopsRun`,
   `chatEntry`, `emitOncePerActivation` travel definition → instance →
   `RuntimeNode` in
   [`apply-editor-mutation.ts:282-292`](../../../packages/server/src/workflow/apply-editor-mutation.ts).
   `feedVisitBoundary` (added for the palette-driven visit boundary) can use
   the same path instead of a UI catalog lookup.

## Locked decisions

1. **`feed: null` becomes authoritative.** It means "this frame is not in the
   work log", not "ask the catalog". After slice C the UI must not have a
   catalog fallback for role / streaming.
2. **Input frames carry the _target_ port meta.** In `tapInputPort` the
   in-scope `source.meta` is the **producer's** output meta — stamping it would
   attribute the upstream role to the consumer. Resolve from
   `editor.getNode(nodeId).inputs[portId].meta.feed` (or pass the target
   connection meta at the call site). Every `'in'` site must be covered; a
   missed site silently hides a marked frame.
3. **Node-level visit boundary rides the frame.** Extend
   `RuntimeFeedPortMeta` with `closesPreviousVisit?: true` and stamp it on
   **every** frame of a `feedVisitBoundary` node, independent of the port role
   (error frames are shown even when the port has no role, and today's
   `catalogMeta` already applies the boundary on the error branch). The UI keeps
   the existing rule that a boundary only affects frames it actually renders.
    - _Rejected alternative:_ ship a `feedVisitBoundaryNodeIds` set on
      `runner.started` (ordering is guaranteed — `start` fences `runner.started`
      before any `runner.port`). It keeps `RuntimeFeedPortMeta` strictly
      port-scoped but leaves per-run state and a reset policy in the fold, which
      is exactly what this epic removes.
4. **No protocol migration.** Server, runtime, and UI co-ship; the execution
   feed replays from the in-memory `RuntimeRunner.eventLog`, which holds the
   same tuples. There are no persisted feed frames to upgrade.
5. **HITL adapters stay.** `runner.permission.ask` / `runner.askUser.ask` and
   their accepted-reply correlation maps (`asksById`, `askUserById`) are bus
   events, not port frames. They remain in the composer fold.
6. **The fold stays in the UI.** Do not move visit/segment folding to the
   server; this epic only makes its **input** self-describing
   ([ADR-012](../../architecture/ADR.md#adr-012--internal-websocket-bus-rest-for-bulk-escape-hatches)).
7. **Labels stay a presentation concern.** `FeedCatalog.labels` (node card
   titles) and definition-specific HITL copy (`formatHitlUserText`) keep using
   the palette. Only role / streaming / visit-boundary derivation moves.

## In scope

### Slice A — Runtime stamps input frames

No UI change; the existing fallback keeps behaviour identical, so this slice is
independently shippable.

Draft:

```ts
// packages/runtime/src/runtime-runner.ts
private targetInputFeed = (
	nodeId: NodeId,
	portId: string,
): RuntimeFeedPortMeta | undefined => {
	const node = this.editor.getNode(nodeId);
	return node === false
		? undefined
		: node.inputs[portId]?.meta.feed;
};
```

Pass it as `defaultFeed` at every `'in'` call site. Where the connection is
already in hand (seed wiring, `applyPortDefaults`, multi-input group,
`pushIntoInput`) use `connection.meta.feed` directly instead of a second
editor lookup.

Tests (`packages/runtime/src/runtime.test.ts` or a new
`port-feed-meta.test.ts`): a table-driven case per wiring path — edge-driven
input, seed, port default, multi-input (`combine` / `zip` / `merge`),
`pushIntoInput` — asserting slot 6 equals the **target** port's `feed` and is
`null` when undeclared. One negative case: producer declares
`feed: { role: 'draft' }`, consumer declares nothing → the `'in'` frame must be
`null`.

### Slice B — Node-level `feedVisitBoundary` on the frame

- `packages/runtime/src/types.ts`: `RuntimeFeedPortMeta.closesPreviousVisit?: true`;
  `RuntimeNode.feedVisitBoundary?: boolean` (document it next to `chatEntry`).
- `packages/node-sdk`: forward `feedVisitBoundary` from the definition onto
  `ReactiveNodeInstance` (same shape as `stopsRun` / `chatEntry`).
- `packages/server/src/workflow/apply-editor-mutation.ts`: map it into the
  `RuntimeNode` literal.
- `emitPortEvent`: merge node flag into the frame meta.

```ts
const portFeed = defaultFeed;
const feed =
	closesPreviousVisit === true
		? { ...(portFeed ?? {}), closesPreviousVisit: true as const }
		: (portFeed ?? null);
```

Tests: runtime test that a boundary node's frames carry the flag (including an
error frame on a port with no role), and that a non-boundary node's frames do
not.

### Slice C — UI reads the frame, deletes the catalog path

New shared helper (used by all three folds) next to the existing catalog
service:

```ts
// packages/ui/src/app/services/frame-feed-meta.ts
export const frameFeedRole = (
	event: PortTelemetry,
): RuntimeFeedRole | undefined => …;   // slot 6 role, guarded
export const frameIsStreaming = (event: PortTelemetry): boolean => …;
export const frameClosesPreviousVisit = (event: PortTelemetry): boolean => …;
```

Then:

- `fold-port-events.ts`: `resolveFeedMeta` loses the catalog branch;
  `withClosesPreviousVisit` reads the frame; `FeedComposerState` drops
  `entries` and `catalog`; the `catalog` action, `rebuildProjection`, and
  `normalizeEntries` are deleted. `snapshot` still replays through
  `replayFeedProjection` over normalized events (no raw log needed after
  normalize is pure).
- Reset policy: keep "different workflow document clears the feed", but source
  it from the workflow snapshot id only (no palette). `catalogSwitchedDocument`
  moves or shrinks accordingly.
- `execution-hitl-fold.ts` and `canvas-node-hitl-projection.ts`: replace
  `resolveOutputFeedRole` with `frameFeedRole`; delete
  `resolveOutputFeedRole` from `execution-catalog.ts` once unused.
- Keep `definitionForNode` where it serves labels / HITL copy.

Tests: existing feed suites must pass **unchanged** except fixtures that
previously relied on catalog-derived roles, which now put the role in the tuple
(that is the point). Add: input frame with `feed: { role: 'result' }` renders a
result bubble (regression for fact 3); custom pack node with
`closesPreviousVisit` closes the caller visit with an **empty** palette map.

### Slice D — Docs and bug record

- `packages/ui/src/app/features/feed-folding/README.md`: the fold is pure over
  self-describing frames; drop the rebuild/entries narrative.
- [EXECUTION_ARCHITECTURE](../../architecture/EXECUTION_ARCHITECTURE.md): the
  `runner.port` row states that slot 6 is authoritative in both directions.
- [HOW_TO_WRITE_REACTIVE_NODES](../../HOW_TO_WRITE_REACTIVE_NODES.md): input
  `feed` now works (with the caveat that unmarked inputs stay hidden).
- [FOUND_BUGS](../../FOUND_BUGS.md): "SDK accepted input `feed` that no
  runtime path stamped; UI silently omitted it" + the regression test name.
- [EXTENSION_POINT](../../architecture/EXTENSION_POINT.md): `feedVisitBoundary`
  row notes it travels on the frame, so packs need no UI support.

## Out of scope

- Moving visit/segment folding to the server or persisting feed projections.
- Reworking HITL ask/reply correlation.
- Splitting `fold-port-events.ts` into files. Do it **after** the deletions, as
  a separate cosmetic change, if it is still worth it.
- Author-facing `visitBoundary` on ports (explicitly rejected in epic 37; the
  derived `!streaming ⇒ close` rule stays).
- Node label / HITL copy derivation (still palette-driven).

## Acceptance criteria

1. Every `'in'` frame carries the **target** port's `feed` (or `null`), proven
   per wiring path: edge, seed, port default, `combine` / `zip` / `merge`,
   `pushIntoInput`. Producer role never leaks onto a consumer frame.
2. A boundary node's frames carry `closesPreviousVisit: true`, including an
   error frame on a role-less port; non-boundary nodes never carry it.
3. `fold-port-events.ts` contains **no** import from
   `services/execution-catalog` for normalization, and `FeedComposerState` has
   no `entries` / `catalog` field. `rebuildProjection` and `normalizeEntries`
   are deleted, not left unused.
4. `resolveOutputFeedRole` is gone from the codebase; the composer and canvas
   status folds read the role from the frame.
5. An input port declaring `feed: { role: 'result' }` renders in the work log
   (new regression test); unmarked inputs stay hidden.
6. A custom pack node with `feedVisitBoundary: true` opens its own card and
   closes the caller visit with an **empty** palette catalog in the fold test —
   no node type literal and no definition lookup in that path.
7. Snapshot replay equals live append for the same event sequence (existing
   `replayFeedProjection` property holds; add a test if none covers a snapshot
   containing boundary + input-role frames).
8. Work-log behaviour for built-ins is unchanged: existing feed integration
   tests (sub-agent visit split, LLM multi-phase visit, autokick banner,
   HITL bubbles) pass without expectation edits other than fixture meta.
9. `dead-code` clean and `check-exports` clean after the deletions.
10. Close-out gate green (below).

## Implementation notes (non-normative)

Likely touch:

- [`packages/runtime/src/runtime-runner.ts`](../../../packages/runtime/src/runtime-runner.ts)
  — six `'in'` sites + `emitPortEvent` merge
- [`packages/runtime/src/types.ts`](../../../packages/runtime/src/types.ts) —
  `RuntimeFeedPortMeta`, `RuntimeNode.feedVisitBoundary`
- [`packages/node-sdk/src/node-factory/define-reactive-node/define-reactive-node.ts`](../../../packages/node-sdk/src/node-factory/define-reactive-node/define-reactive-node.ts)
  — instance passthrough
- [`packages/server/src/workflow/apply-editor-mutation.ts`](../../../packages/server/src/workflow/apply-editor-mutation.ts)
- [`packages/ui/src/app/features/feed-folding/fold-port-events.ts`](../../../packages/ui/src/app/features/feed-folding/fold-port-events.ts)
  (expect a large net deletion), `types.ts`
- [`packages/ui/src/app/services/execution-catalog.ts`](../../../packages/ui/src/app/services/execution-catalog.ts)
    - new `frame-feed-meta.ts`
- [`packages/ui/src/app/features/composer/execution-hitl-fold.ts`](../../../packages/ui/src/app/features/composer/execution-hitl-fold.ts),
  [`canvas-node-hitl-projection.ts`](../../../packages/ui/src/app/features/canvas-node-status-folding/operators/canvas-node-hitl-projection.ts)

Risks and traps:

- **Slot 6 must never be `undefined`.** JSON arrays drop trailing `undefined`;
  the tuple contract already says "use `null`". Keep `?? null` at the single
  emit point, not at call sites.
- **Hidden ctx port.** Seeds skip telemetry for symbol port ids; keep that
  guard when adding the connection lookup.
- **`'merge'` fan-in** forwards success values only (BUG-2026-07-15c); the
  group meta is synthesized (`dir: 'out'`, `wireType: 'any'`) — take the feed
  from `group.connection.meta`, not from the synthesized combine meta.
- Slice A alone is behaviour-neutral; do not delete the UI fallback before
  slice B lands, or boundary frames lose their flag for one commit.

## Verify

- Intermediate (optional): focused `vitest run` on `packages/runtime`,
  `packages/ui/src/app/features/feed-folding`, and
  `packages/ui/src/app/features/composer`; `verify --quick` while iterating.
- **Close-out (required):** `npm run typecheck` (or
  `node build/tools/agent-run.mjs typecheck`) **and** `npm run test` or full
  `node build/tools/agent-run.mjs verify` — unit **and** integration. Execution
  and WS telemetry change here, so integration coverage is mandatory
  ([TESTING](../../TESTING.md)). Then `node build/tools/agent-run.mjs dead-code`
  → delete findings → `node build/tools/agent-run.mjs check-exports`.

## Links

- [feed-panel feature](../../features/feed-panel.md)
- [37-deterministic-feed-fold](../../DONE/EPICS/37-deterministic-feed-fold.md)
- [43-feed-sanity](../../DONE/EPICS/43-feed-sanity.md)
- [REACTIVITY](../../architecture/REACTIVITY.md) (fold rules)
- [EXTENSION_POINT](../../architecture/EXTENSION_POINT.md) (definition metadata seam)
