---
kind: adr
owner: docs
covers: []
status: current
id: ADR-008
supersedes: []
superseded-by: []
package: docs
---

## ADR-008 — Persisted workflow ↔ ngDiagram boundary

**Status:** accepted · **Date:** 2026-06-16 · **Updated:** 2026-07-22

**Context:** The server session owns the persisted Langflower workflow shape;
ngDiagram owns an imperative interactive model whose node/edge representation
differs at real vendor boundaries (notably tuple ports versus prefixed handle
ids). Mirroring the domain graph in a client store created extra writers and
resynchronization paths.

**Alternatives considered:**

- **Persist ngDiagram model JSON directly** — couples storage to a vendor
  schema and forces migrations when the canvas library changes.
- **Client WorkflowStore plus bidirectional mapper** — duplicates authoritative
  bridge state and makes every canvas edit a two-store synchronization problem.
- **Use only the persisted shape inside ngDiagram** — conflicts with the host
  APIs that require vendor node/edge objects.

**Decision:**

- `LangflowerBridgeClient` is the UI domain source of truth.
- `workflow.current.snapshot` initializes the canvas; subsequent `editor.*`
  facts update the live `NgDiagramModelService`.
- `bridge-diagram.service.ts` contains one-way persisted-shape → ngDiagram
  conversions only where the vendor shape genuinely differs.
- Feature components derive presentation such as resolved port rows from the
  live diagram signals. There is no client `WorkflowStore`, reverse graph
  mapper, or cached domain mirror.
- User edits return as typed bridge intents; the server session updates the
  authoritative workflow document and broadcasts facts/snapshots.

**Tradeoffs accepted:**

- (+) Persistence remains independent of ngDiagram.
- (+) Domain state has one bridge/session owner; canvas-local state stays with
  the canvas.
- (+) Derived presentation cannot drift through a second synchronization
  pipeline.
- (−) The imperative host boundary still needs small, tested conversions and
  lifecycle subscriptions.

**Consequences:**

- Never write raw ngDiagram JSON to workflows.
- Do not add a reverse mapper or WorkflowStore-like bridge cache.
- Keep persisted → vendor conversions pure; keep model mutation at the
  ngDiagram host edge.

**Addendum (2026-07-11) — the predicted mapper risk materialized twice; both
fixed by removing the extra type/adapter instead of patching it:**

1. **Mirrored edge type.** `WorkflowEdgePersisted` duplicated `RuntimeEdge`
   (same edge data, different field names/shape:
   `source`/`sourceHandle` string vs `fromNodeId`/`fromPort` tuple), requiring
   an encode/decode adapter (string handle splitting) at every boundary that
   touched edges. Per [PRINCIPLES.md § No adapters, no glue
   code](../architecture/PRINCIPLES.md#no-adapters-no-glue-code), the fix was **not** a better
   adapter — it was deleting `WorkflowEdgePersisted` and using `RuntimeEdge`
   directly everywhere (runtime, server, UI), leaving only the genuinely
   necessary `RuntimeEdge → ng-diagram Edge` conversion
   (`persistedEdgeToDiagram`), which is a real shape change (tuple ports →
   prefixed string port ids), not a mirrored duplicate.
2. **Cached, adapter-synced derived port data.** `LfNodeData` cached resolved
   multi-input/bypass port rows (`ports`, `lookups`) as if they were part of
   persisted node data. Keeping that cache in sync with live edge add/remove
   required a second adapter — `buildDynamicPortUpdates` in
   `bridge-diagram.service.ts` (~300 lines) — patching `data.ports` in place
   on every `editor.addEdges`/`editor.deleteEdges` delta. That adapter read
   from the **live** diagram edges, while an unrelated code path
   (`editor.updateNodes` → `persistedNodeToDiagram`) rebuilt the same cached
   field from a **different, frozen** source (`graphInput().edges`, an
   init-only snapshot — see `docs/architecture/ui/NG_DIAGRAM.md`). Two divergent sources
   feeding one cached field meant any node-level update silently reverted the
   adapter's work — [`BUG-2026-07-11`](../bugs/README.md) introduced the adapter,
   [`BUG-2026-07-11c`](../bugs/README.md) is the adapter's own staleness bug.
   Fixed by deleting the cache and the adapter: `LfNodeComponent` now derives
   `inputPortRows`/`bypassPortRows` as `computed()`s reading directly from the
   single live `NgDiagramModelService.edges()` signal — nothing on node `data`
   to keep in sync.

**Design flaw signal (generalizes beyond this ADR):** an adapter that exists
to keep a **cached/mirrored copy** of derived data in sync with a live source
is the same smell as a mirrored type — it adds a second place that can drift
from the source of truth. Prefer deriving directly from the live source
(here: an Angular `computed()` over `NgDiagramModelService.edges()`) over
caching the derived result and writing an adapter to keep the cache fresh.
Treat any new "resync ports/data after mutation X" pipeline as a design smell
requiring its own ADR justification, per PRINCIPLES.md.

---
