# ng-diagram async model timing

Findings about `NgDiagramModelService`'s async dispatch model and the race
condition when reading model state immediately after mutating it.

> **Superseded:** the `buildDynamicPortUpdates` staged per-node pipeline
> described below (as the "fix" for the original problem) has been **deleted**.
> It was itself the source of a later race — see
> [Multi input ports (dynamic slots)](../packages/ui/docs/DIAGRAM_CANVAS.md#multi-input-ports-dynamic-slots)
> and `docs/FOUND_BUGS.md`. Port rows are now derived **reactively** inside
> `LfNodeComponent` from the `edges()` signal (see
> [`edges()` signal vs `getConnectedEdges()`](#edges-signal-vs-getconnectededges--reactive-vs-non-reactive)
> below) — there is no staged/patched node data left, so the async-timing
> problem this doc catalogs no longer applies to ports. The general
> `NgDiagramModelService` timing findings below remain accurate for any other
> code that mutates the model and reads it back.

## The problem

`flow-canvas.component.ts` used to call `refreshNodePorts` after
`modelService.addEdges()` — reading `edges()` from the model right after mutation.
The edge signal had not updated yet because the command goes through an async
middleware pipeline. The old path also rebuilt ports via `resolveNodePorts` with
a forbidden `Edge → persisted` conversion.

**Fixed (historical):** staged per-node pipeline via `buildDynamicPortUpdates`
(see below) — itself since deleted, see the callout above.

## How NgDiagramModelService works

Every mutating method (`addEdges`, `updateNodeData`, `addNodes`, …) delegates
to the `FlowCore` command handler:

```typescript
// NgDiagramModelService (from fesm2022/ng-diagram.mjs)
addEdges(e) {
    this.flowCore.commandHandler.emit("addEdges", { edges: e });
}
updateNodeData(e, t) {
    this.flowCore.commandHandler.emit("updateNode", { id: e, nodeChanges: { data: t } });
}
getNodeById(e) {
    return this.flowCore.getNodeById(e);
}
```

The `emit()` call — from the caller's perspective — appears synchronous (returns
`void`). But internally the `FlowCore` runs the command through
`MiddlewareExecutor` which uses a **semaphore** (async `await`). The model
adapter's `updateNodes()` / `updateEdges()` is only called **after** all
middleware resolves.

## Signal chain

`NgDiagramModelService` holds its own `_nodes` / `_edges` signals. They are NOT
updated by the command handler directly. Instead, they're updated via the
`modelListener` callback registered through `model.onChange(this.modelListener)`:

```typescript
constructor() {
    super();
    effect(() => {
        this.diagramService.isInitialized() &&
        (this.flowCore.model.onChange(this.modelListener),
        untracked(() => this.modelListener({
            nodes: this.flowCore.model.getNodes(),
            edges: this.flowCore.model.getEdges(),
            metadata: this.flowCore.model.getMetadata()
        })))
    });
}
```

The `onChange` callback fires after `setState()` is called on the
`SignalModelAdapter` by the middleware pipeline. This happens **asynchronously**
(microtask / macrotask depending on middleware implementation).

## The race

```
Time    Caller                          Middleware pipeline
──┼──   modelService.addEdges([e]) ──►  emit("addEdges")
 │                                      semaphore.acquire()
 │     modelService.edges() ◄──────     ← STALE (old edges)
 │                                      ... async middleware ...
 │                                      model.updateEdges(allEdges)
 │     modelService.getNodeById(id)     model.onChange → _edges.set()
 │     ← data still has OLD ports
```

Both `modelService.edges()` and `modelService.getNodeById()` read from the
`FlowCore`'s model adapter, which hasn't been updated yet.

## The fix pattern

Use the **mutation payload** and **pre-mutation** per-node connected edges — not
`modelService.edges()` after `addEdges`/`deleteEdges`, and not a parallel
canonical edge list:

```typescript
// DON'T: read edges() after addEdges(), or rebuild via resolveNodePorts
subscribe('editor.addEdges', (edges) => {
	modelService.addEdges(edges.map(persistedEdgeToDiagram));
	const allEdges = modelService.edges(); // STALE!
	refreshNodePorts(nodeIds, allEdges);
});

// DO: staged per-node pipeline (buildDynamicPortUpdates)
subscribe('editor.addEdges', (edges) => {
	applyDynamicPortUpdates(edges, 'add');
});

function applyDynamicPortUpdates(mutationEdges, mode) {
	// 1. Build updates BEFORE mutation — getConnectedEdges per target node
	const updates = buildDynamicPortUpdates(
		mutationEdges,
		(id) => modelService.getNodeById(id),
		(nodeId) => modelService.getConnectedEdges(nodeId),
		mode,
	);
	// 2. Mutate edges
	if (mode === 'add')
		modelService.addEdges(mutationEdges.map(persistedEdgeToDiagram));
	else modelService.deleteEdges(mutationEdges.map((e) => e.id));
	// 3. Patch node data (no persistedNodeToDiagram rebuild)
	for (const { id, data } of updates) modelService.updateNodeData(id, data);
}
```

`buildDynamicPortUpdates` in `bridge-diagram.service.ts` projects per-node edge
sets from `connectedEdgesAfterAdd` / `connectedEdgesAfterRemove`, narrows affected
multi-input / bypass bases, and returns only nodes that need `updateNodeData`.
Only **target** nodes of the mutation are considered (multi-input and bypass ports
grow/shrink on the wire target).

## Test timing

`fixture.whenStable()` does NOT flush the `MiddlewareExecutor` semaphore.
Use `await new Promise(r => setTimeout(r, 50))` to yield control and let the
pipeline settle:

```typescript
it('test', async () => {
	host.addEdgeAndRefreshPorts(edge, paletteMap);
	await new Promise((r) => setTimeout(r, 50));
	fixture.detectChanges();
	const node = host.modelService
		.getModel()
		.getNodes()
		.find((n) => n.id === 'n1');
	expect(node.data.inputPorts).toHaveLength(2);
});
```

`getModel().getNodes()` reads from the `SignalModelAdapter` after the middleware
pipeline has called `updateNodes()`.

## Conversion functions — one direction only

`persistedNodeToDiagram` and `persistedEdgeToDiagram` in
`packages/ui/src/app/services/bridge-diagram.service.ts` convert server-originated
persisted data into ng-diagram model objects.

**These functions must ONLY be called when the input comes directly from a server
push (snapshot or delta).** There is no round-trip conversion back to persisted
format. Shuffling between `WorkflowNodePersisted` ↔ `WorkflowDiagramNodeData` or
`RuntimeEdge` ↔ ng-diagram `Edge` is forbidden — use separate code
paths for each direction.

## `graphInput` is a frozen init-time snapshot — do not read after mount

A distinct trap from the async-timing issues above (that one is about _when_
a mutation becomes visible; this one is about a value that is **never**
refreshed at all):

`FlowCanvasComponent.graphInput` (`input.required<WorkflowPersistedGraph>()`)
is bound **once**, from the first `workflow.current.snapshot` push, and used
**only** inside the `modelAdapter` computed to seed `initializeModel`. It is
**not** kept in sync with incremental `editor.addEdges` / `editor.deleteEdges`
/ `editor.updateNodes` deltas — reading `this.graphInput()` anywhere else
returns however the workflow looked at canvas mount, forever.

This caused a real bug: `editor.updateNodes` used to rebuild a node's ports via
`persistedNodeToDiagram(node, palette, this.graphInput().edges)`, discarding
any port growth a prior `editor.addEdges` had applied, because
`graphInput().edges` never included the new edge. See
`docs/FOUND_BUGS.md` and
[Multi input ports (dynamic slots)](../packages/ui/docs/DIAGRAM_CANVAS.md#multi-input-ports-dynamic-slots).

**Rule:** after diagram init, the live source of truth is always
`NgDiagramModelService` (`.nodes()` / `.edges()`), which every mutation
(`addEdges`, `updateNodes`, …) actually updates — never `graphInput()`.

## Two mutation paths (sync vs async)

There are **two** ways to mutate model state, with different timing guarantees:

| Method                                   | Mechanism                                                      | Sync?         | FlowCore lookup updated?    |
| ---------------------------------------- | -------------------------------------------------------------- | ------------- | --------------------------- |
| `modelService.getModel().updateEdges(v)` | Calls `SignalModelAdapter.updateEdges()` directly (signal set) | ✅ Yes        | ❌ No (`modelLookup` stale) |
| `modelService.addEdges(edges)`           | `commandHandler.emit("addEdges")` → middleware pipeline        | ❌ No (async) | ✅ Yes                      |
| `modelService.getModel().updateNodes(v)` | Direct signal update                                           | ✅ Yes        | ❌ No                       |
| `modelService.addNodes(nodes)`           | `commandHandler.emit("addNodes")` → middleware                 | ❌ No         | ✅ Yes                      |

`NgDiagramModelService` methods (`addEdges`, `deleteEdges`, `addNodes`, …) all
delegate to `this.flowCore.commandHandler.emit()` which runs an async middleware
pipeline. In contrast, `SignalModelAdapter.updateEdges()` / `updateNodes()` are
plain signal writes — synchronous.

Production code should **always** use the `modelService.*` command-based API,
not direct `model.updateEdges()`. The test host mirrors this.

## `getConnectedEdges()` — read before mutation

`getConnectedEdges(nodeId)` is correct **before** `addEdges`/`deleteEdges` when
projecting the post-mutation edge set per node via `connectedEdgesAfterAdd` /
`connectedEdgesAfterRemove`. Do not read it after mutation expecting the new edges.

After `SignalModelAdapter.updateEdges()` updates the edges signal synchronously,
`FlowCore`'s internal `modelLookup` cache may still be stale. The per-node
projection avoids relying on global `edges()` or post-mutation lookups.

## `edges()` signal vs `getConnectedEdges()` — reactive vs non-reactive

These look interchangeable but are **not**:

| API                                               | Backing                                                                                                                                           | Reactive (usable in `computed()`)?                                                                                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NgDiagramModelService.edges`                     | `Signal<Edge[]>`, updated via `model.onChange` (see [Signal chain](#signal-chain))                                                                | ✅ Yes — reading it inside a `computed()` makes that `computed()` recompute whenever edges change, regardless of the async middleware timing documented above |
| `NgDiagramModelService.getConnectedEdges(nodeId)` | Reads a plain internal `Map` cache on `FlowCore`/`modelLookup`, not signal-backed (verified in `node_modules/ng-diagram/fesm2022/ng-diagram.mjs`) | ❌ No — calling it from inside a `computed()` will **not** trigger recomputation when edges change; it is a point-in-time read only                           |

**Rule:** any reactive/live port or state derivation that must stay in sync
with edge add/remove (e.g. `LfNodeComponent.connectedEdges` in
`lf-node.component.ts`) must filter the `edges()` **signal**, never call
`getConnectedEdges()`. Reserve `getConnectedEdges()` for one-shot,
pre-mutation reads (see above) outside of `computed()`.

## `NgDiagramComponent` model-input destroy cycle

`NgDiagramComponent` has an `effect()` on its `model` input that **destroys and
recreates `FlowCore`** when the input reference changes. This is triggered by:

- `fixture.detectChanges()` when the model signal is bound via `model()`
- `fixture.whenStable()` which flushes effects

When `FlowCore` is destroyed, `SignalModelAdapter.destroy()` resets nodes/edges
signals to `[]`. This means any signal mutation followed by Angular change
detection can wipe the model state.

**Rule:** after any model mutation in tests, use
`await new Promise(r => setTimeout(r, 0))` to drain microtasks instead of
`fixture.whenStable()` / `detectChanges()`. This avoids triggering the destroy
cycle.

## `modelService.getNodeById<LfNodeData>(id)`

Use the generic type parameter on `getNodeById` to avoid `as` casts on the
returned `data`. Note `LfNodeData` no longer carries resolved port rows —
those are derived live in `LfNodeComponent` (see above), not stored on `data`:

```typescript
const ngNode = this.modelService.getNodeById<LfNodeData>(nodeId);
// ngNode.data.portsConfig is the static palette port metadata only;
// ngNode.data has no `ports` / `lookups` fields to read.
```

## Test timing cheat sheet

| Situation                                         | Wait strategy                      | Why                                                          |
| ------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------ |
| After `modelService.addEdges()` / `deleteEdges()` | `setTimeout(0)`                    | Command handler middleware is async                          |
| After `model.updateEdges()` (direct signal)       | None (sync)                        | Signal is updated immediately                                |
| To check signal values (`edges()`, `nodes()`)     | `setTimeout(0)`                    | `modelListener` runs in `effect()` (microtask)               |
| To avoid FlowCore destroy                         | `setTimeout(0)` (not `whenStable`) | `whenStable` tickles `NgDiagramComponent` model-input effect |

## Key files

| File                                                                      | Role                                                                                          |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `packages/ui/src/app/diagram/resolve-diagram-node-ports.ts`               | `resolveNodePorts` — pure port-row math over live `Edge[]`                                    |
| `packages/ui/src/app/features/canvas/components/lf-node.component.ts`     | Reactive `connectedEdges` / `inputPortRows` / `bypassPortRows` `computed()`s                  |
| `packages/ui/src/app/services/bridge-diagram.service.ts`                  | `persistedNodeToDiagram` / `persistedEdgeToDiagram` — one-way server → diagram mapping only   |
| `packages/ui/src/app/features/canvas/components/flow-canvas.component.ts` | Thin `editor.*` delta → `NgDiagramModelService` pass-through; `graphInput` init-only snapshot |
| `packages/ui/src/app/features/canvas/tests/dynamic-port-update.test.ts`   | Regression tests for multi-input / bypass grow/shrink, incl. the `graphInput` staleness race  |
| `node_modules/ng-diagram/fesm2022/ng-diagram.mjs`                         | `NgDiagramModelService`, `SignalModelAdapter`, `FlowCore`                                     |
