# UI 00 — Bridge contract & persistence (cross-tab / reload)

**Status:** done (reference for 01–06)  
**Index:** [README.md](README.md)

## Sync model (existing)

Editor mutations are **server-authoritative**:

```text
Tab A  →  *.requested  →  applyEditor* (session graph + runtime)
                       →  markDirty()
                       →  bridgeEmit deltas (all tabs)
Tab B  →  editor.addNodes / updateNodes / addEdges / delete*
       →  NgDiagramModelService apply
```

Source of truth while the server process lives: **`LangflowerSession` active
workflow graph**. Disk write happens only on explicit
`workflow.saveCurrent.requested` (existing Save UX). Mutations call
`session.markDirty()` and broadcast `workflow.currentStatus.snapshot`.

| Event                              | Survives?                                                                         |
| ---------------------------------- | --------------------------------------------------------------------------------- |
| Other tab open against same server | Yes — via `editor.*` deltas                                                       |
| Browser reload, server still up    | Yes — reconnect gets `workflow.current.snapshot` / session state with dirty graph |
| Server restart without Save        | **No** — dirty session lost (existing product rule; not introduced by UI epics)   |
| Save then reload / new server      | Yes — JSON under `.langflower/workflows/`                                         |

Do **not** invent autosave in these UI epics unless product asks later.

## Persisted node UI shape (no schema migration for 01–04)

[`WorkflowNodeUiState`](../../../packages/shared/src/types/langflower-workflow.ts):

```ts
{
  position: { x, y, width?, height? },  // size lives ON position
  label?: string,
}
```

[`EditorUpdateNodeRequestedPayload.ui`](../../../packages/shared/src/types/langflower-editor.ts)
uses `{ width?, height?, label? }`; server
[`patchPersistedNodeUi`](../../../packages/server/src/workflow/apply-editor-mutation.ts)
merges width/height into `ui.position` and label onto `ui.label`.

Canvas mapper reads size from `node.ui.position.width/height`
([`nodeSize`](../../../packages/ui/src/app/services/bridge-diagram.service.ts)).

**Persistence change for rename/resize:** none — reuse `editor.updateNode.requested`.

## Sizing contract (03 + 06) — normative

ng-diagram `autoSize` is boolean: both axes or neither. There is **no**
height-only autoSize. Langflower therefore uses two modes:

| Mode             | Condition                 | Diagram                               | Persistence from auto path                                              |
| ---------------- | ------------------------- | ------------------------------------- | ----------------------------------------------------------------------- |
| A — content auto | `ui.position.width` unset | `autoSize: true`                      | **none** (Tab B grows on `addEdges`)                                    |
| B — width locked | `ui.position.width` set   | `autoSize: false`, fixed `size.width` | `updateNode` **`{ ui: { height } }` only** on port **row-count** change |

**Mapper rules** ([`persistedNodeToDiagram`](../../../packages/ui/src/app/services/bridge-diagram.service.ts)):

- `autoSize = (width === undefined)` — not “until first resize of either axis”.
- Never synthesize `width: 180` when only `height` is present (today’s
  `nodeSize` does this — **bug to fix** with 03/06).
- `resizable: true` when epic 03 adornment ships.

**Forbidden:** ResizeObserver on chrome as the height trigger (fires on 01
textarea resize and Preview value ticks). Trigger = resolved port row count
only. Preview `max-height` + scroll must ship before/with mode-A reliance on
`autoSize` so text does not dominate measured height.

**SE drag:** no auto height writes while resize is in progress; on
`nodeResizeEnded` persist both width and height (existing path) → enters mode B.

Details / acceptance: [06](06-height-auto-resize-and-preview-scroll.md),
[03](03-node-resize-handle.md).

## Bridge contract changes by epic

| Epic                | Client → server                                                                                    | Server → clients                                           | Persistence / session                                              |
| ------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------ |
| 01 textareas        | none (inline values already `updateNode` inputs)                                                   | existing `updateNodes`                                     | existing                                                           |
| 02 rename           | existing `editor.updateNode.requested` `{ ui: { label } }`                                         | `editor.updateNodes` (+ `editor.nodeSelected` if selected) | `markDirty` only                                                   |
| 03 resize           | existing `updateNode.requested` `{ ui: { width, height } }` (already wired from `nodeResizeEnded`) | `editor.updateNodes`                                       | `markDirty` only; JSON fields already exist                        |
| 04 selection chrome | none for edge/port highlight (local). Node select stays `selectNode.requested`                     | `editor.nodeSelected` (nodes only; **edges not synced**)   | none                                                               |
| 05 paste            | **new** `editor.paste.requested`                                                                   | `editor.addNodes` + `editor.addEdges` (reuse)              | `markDirty`; may extend add payload fields                         |
| 06 height + preview | Preview: no bridge. Height: `updateNode` `{ ui: { height } }` **only in mode B**                   | `editor.updateNodes`                                       | width never patched by auto path; no height auto-persist in mode A |

## Paste contract (05) — normative

### Why not N× `addNode` + `addEdge`

- Edge endpoints need a stable remap from client temp ids → server ids in one
  transaction.
- Cross-tab must see one coherent graph update (avoid half-pasted edges).
- Matches “strip optimistic → server delta” used for
  [`handleEdgeDrawEnded`](../../../packages/ui/src/app/features/canvas/components/flow-canvas.component.ts).

### New inbound

```ts
// packages/shared — EditorPasteRequestedPayload
{
  readonly nodes: readonly {
    readonly clientId: string; // remap key only; never persisted
    readonly type: string;
    readonly position: { x: number; y: number; width?: number; height?: number };
    readonly params?: Readonly<Record<string, unknown>>;
    readonly inputs?: Readonly<Record<string, unknown>>;
    readonly label?: string;
  }[];
  readonly edges: readonly {
    readonly fromClientId: string;
    readonly fromPort: readonly [string, number];
    readonly toClientId: string;
    readonly toPort: readonly [string, number];
  }[];
}
```

Align `position` with `WorkflowNodeUiState.position` (size optional on position).
Do **not** invent a parallel `ui.width` on the paste DTO.

### New server path

- `applyEditorPaste(session, projectDir, payload, resolveDefinition)` in
  `apply-editor-mutation.ts`
- For each node: same defaults / materialize / `runtime.editor.addNode` as
  `applyEditorAddNode`, but honor `position.width/height` + `label`
- Remap edges → `applyEditorAddEdge` (or internal helper)
- Single `markDirty()` after batch
- Locked graph → return empty deltas (same as other editor applies)

### Wire

- `langflower-bus-config.ts`: `editor.paste.requested`
- `wire-editor-handlers.ts` + [BRIDGE.md](../../../packages/server/src/bridge/BRIDGE.md) row
- Outbound: existing `editor.addNodes` then `editor.addEdges` (order: nodes
  first), plus `workflow.currentStatus.snapshot` when non-empty

### Client paste algorithm (cross-tab safe)

```text
clipboardPasted (local optimistic clones from ng-diagram)
  → delete those local node/edge ids from diagram (strip optimistic)
  → editor.paste.requested
  → (all tabs) editor.addNodes / editor.addEdges
  → origin tab looks like peer tabs; no orphan clientIds
```

Optional later: disable ng-diagram’s built-in paste apply and only paste via
server (same end state).

### `addNode` gap (optional small persistence fix)

Today [`applyEditorAddNode`](../../../packages/server/src/workflow/apply-editor-mutation.ts)
sets `ui.position` from payload `position` (x/y only) and root `label`.
Paste path must accept width/height. Prefer implementing size on the **paste**
composer; optionally extend `EditorAddNodeRequestedPayload.position` with
optional width/height for symmetry (palette drop unchanged).

## Cross-tab expectations (acceptance language)

| Feature                 | Tab A                          | Tab B                           | Reload (server up) | Save + cold start               |
| ----------------------- | ------------------------------ | ------------------------------- | ------------------ | ------------------------------- |
| Rename                  | updateNodes                    | updateNodes                     | session snapshot   | workflow JSON `ui.label`        |
| Resize (SE)             | updateNodes                    | updateNodes                     | session snapshot   | JSON `ui.position.width/height` |
| Height auto (mode B)    | updateNodes height             | updateNodes                     | session snapshot   | JSON height; width unchanged    |
| Height (mode A / fresh) | none                           | local `autoSize` after addEdges | n/a                | n/a until user SE / paste size  |
| Edge/port highlight     | local                          | local (not synced)              | n/a                | n/a                             |
| Paste                   | strip + paste.requested → add* | add* deltas                     | session snapshot   | JSON nodes/edges after Save     |

## Explicit “no change” list

- No new workflow JSON document version.
- No change to `RuntimeEdge` shape.
- No autosave.
- No syncing edge selection across tabs.
- Textarea content already persists as port `inputs` via existing updateNode.
