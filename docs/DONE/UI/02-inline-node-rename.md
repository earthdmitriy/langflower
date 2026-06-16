# UI 02 — Inline node rename

**Status:** done  
**Depends on:** nothing (nice after 01)  
**Bridge / persistence:** [00-bridge-and-persistence.md](00-bridge-and-persistence.md)  
**Index:** [README.md](README.md)

## Goal

Rename a node on the canvas without opening the inspector: double-click (or F2)
on the title → edit → commit.

## Current behavior

[`lf-node.component.ts`](../../../packages/ui/src/app/features/canvas/components/lf-node.component.ts)
renders a read-only truncated label:

```ts
data.ui.label ?? data.type;
```

Bus already supports label patches:

[`EditorUpdateNodeRequestedPayload.ui.label`](../../../packages/shared/src/types/langflower-editor.ts)

## In scope

1. Double-click title (and F2 when node selected) → inline `<input>`.
2. Enter / blur → `editor.updateNode.requested` with `{ nodeId, ui: { label } }`.
3. Escape → cancel, restore previous label.
4. `data-no-drag` on the input so editing does not drag the node.
5. Empty commit: clear custom label (display falls back to `type`); match
   existing server merge semantics for omitted/empty label.
6. Unit test: commit emits bridge request; Escape does not.

## Out of scope

- Renaming from palette catalog / type id.
- Multi-select bulk rename.
- Fancy validation beyond trim.

## Bridge / persistence

- **No new bus keys.** Commit via existing `editor.updateNode.requested`
  `{ nodeId, ui: { label } }`.
- Server: existing `applyEditorUpdateNode` → `markDirty` → broadcast
  `editor.updateNodes` (all tabs). If node selected → also `editor.nodeSelected`.
- **Disk:** unchanged — Save writes `ui.label` into workflow JSON. No schema change.
- **Reload:** browser reload with server up restores label from session snapshot;
  cold start after Save restores from file.

## Acceptance criteria

1. Rename visible on Tab A after server `updateNodes` (not only optimistic local).
2. Tab B shows the new label without refresh.
3. After Save + cold load, label persists in workflow JSON.
4. Keyboard: F2 starts edit when node selected; Escape cancels.
5. Empty label clears custom name; display falls back to `type`.

## Implementation notes

- Primary: `lf-node.component.ts` template + small edit-mode signal.
- Prefer **no long-lived optimistic label**: either wait for `updateNodes` or
  set local label and let broadcast reconcile (same id) — avoid desync if
  server rejects (locked graph).
