# UI 05 — Node copy-paste (server sync)

**Status:** done  
**Depends on:** [00-bridge-and-persistence.md](00-bridge-and-persistence.md)
(paste contract); helpful after [03](03-node-resize-handle.md) for size  
**Index:** [README.md](README.md)  
**Prior stub:** [copy-paste-canvas.md](copy-paste-canvas.md)

## Goal

Ctrl/Cmd+C / Ctrl/Cmd+V duplicate selected nodes and internal edges with
**server-authoritative** persistence so cross-tab clients and reload (session /
Save) see the same graph. Fixes “copy-pasted things dont sync with server”.

## Current behavior

- No `(clipboardPasted)` handler on
  [`flow-canvas`](../../../packages/ui/src/app/features/canvas/components/flow-canvas.component.ts).
- Edge draw already uses strip-optimistic → `addEdge.requested` → broadcast
  `addEdges` (pattern to copy).
- Deletes sync via `(selectionRemoved)` → `remove*.requested`.
- `addNode` / `addEdge` are single-item; no batch paste; `addNode` does not
  document width/height on position today.

## In scope

1. **New bridge inbound** `editor.paste.requested` +
   `EditorPasteRequestedPayload` (see 00) — batch nodes + edges with
   `clientId` remap.
2. **Server** `applyEditorPaste` → materialize nodes (incl.
   `position.width/height`, `label`, params, inputs) → add edges → one
   `markDirty` → emit `editor.addNodes` then `editor.addEdges` + status.
3. **Client algorithm (mandatory for sync):**
    - On `clipboardPasted`, collect local pasted ids.
    - **Delete** those optimistic nodes/edges from the diagram immediately.
    - Send `editor.paste.requested`.
    - Origin tab applies the same deltas as peers (no leftover clientIds).
4. Edges only when both endpoints are in the pasted node set.
5. Position offset so clones are not perfectly stacked (client or server).
6. Wire `wire-editor-handlers` + BRIDGE.md + shared bus types.
7. Unit tests for `applyEditorPaste`; WS/integration: Tab B / snapshot sees
   clones; Save writes them to workflow JSON.
8. Retarget [copy-paste-canvas.md](copy-paste-canvas.md).

## Out of scope

- Autosave to disk (Save remains explicit).
- Cross-workflow / cross-project clipboard.
- Syncing which elements are _selected_ after paste (optional select first
  pasted node via existing `selectNode` — nice-to-have).
- Cut product polish beyond existing delete sync.

## Bridge contract (summary)

| Direction | Message                           | Payload                                                                                                                    |
| --------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| C→S       | `editor.paste.requested`          | nodes[`clientId`, type, position{x,y,w?,h?}, params?, inputs?, label?] + edges[fromClientId, fromPort, toClientId, toPort] |
| S→C       | `editor.addNodes`                 | `WorkflowNodePersisted[]` (server ids)                                                                                     |
| S→C       | `editor.addEdges`                 | `RuntimeEdge[]`                                                                                                            |
| S→C       | `workflow.currentStatus.snapshot` | dirty when applied                                                                                                         |

No new outbound snapshot type. No change to `RuntimeEdge` or workflow file
version — only more nodes/edges in the existing graph document after Save.

## Persistence

| Layer                           | Change                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------- |
| Session graph                   | Yes — paste upserts nodes/edges + `markDirty`                                                     |
| Workflow JSON schema            | **No** new fields — reuse `WorkflowNodePersisted` / edges                                         |
| Disk                            | Only after user Save (same as add-node)                                                           |
| `EditorAddNodeRequestedPayload` | Optional follow-up: allow `position.width/height` for symmetry; paste DTO carries them regardless |

## Cross-tab / reload acceptance

1. Tab A paste → Tab B receives `addNodes`/`addEdges` and shows clones without refresh.
2. Browser reload (server up, unsaved dirty) → clones still in session snapshot.
3. Save → cold start → clones in `.langflower/workflows/*.json`.
4. Locked graph (`runner` running) → paste no-ops (empty deltas), no local orphans.
5. No duplicate server ids; edges reference new node ids only.

## Implementation notes

- Map diagram port string ids ↔ `[portId, slotIndex]` with existing helpers
  (`buildAddEdgeIntentFromDrawEnded` patterns).
- If ng-diagram paste fires with edges to non-copied nodes, drop those edges
  client-side before request.
- Prefer implementing size on paste `position` even if 03 mapper polish lands
  later — otherwise clones lose size until resize epic.
