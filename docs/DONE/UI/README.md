# UI / canvas UX — completed plans

Shipped canvas UX work (formerly under `docs/TODO/UI/`). One concern = one
file. Completed epics: [DONE/EPICS](../EPICS/README.md).

**Product readiness** (use-cases Blocked / tool-loop) is unrelated — these
items improve the editor for graphs that already run (text LLM, HITL, flow).

## Sync / persistence (read first)

Cross-tab, reload, and **sizing modes (width lock vs auto)**:
**[00-bridge-and-persistence.md](00-bridge-and-persistence.md)**.

Short version: mutations → server session + `markDirty` + broadcast deltas;
disk only on Save. Rename/resize reuse `editor.updateNode.requested`. Paste
uses `editor.paste.requested` (server-authoritative). Sizing: mode A
(`autoSize` until width set) vs mode B (width locked, height-only sync on
port row-count). Multiline fill: [ADR-017](../../ADR.md#adr-017--canvas-multiline-node-flex-fill-not-textarea-self-resize).

## Order (historical)

```text
00 bridge-and-persistence      ← contract (incl. sizing)
01 resizable-prompt-textareas  ← ADR-017 flex fill (no textarea grip)
02 inline-node-rename
06B preview scroll             ← before height sync / with mode A
03 mapper + SE resize handle   ┐
06A height sync (mode B)       ├─ shared mapper; 06A after mapper
04 selection-edge-port-highlight
05 node-copy-paste             ← needs 00 paste; size from 03/06
```

## Index

| #   | File                                                                                       | Status | Goal                                         |
| --- | ------------------------------------------------------------------------------------------ | ------ | -------------------------------------------- |
| 00  | [00-bridge-and-persistence.md](00-bridge-and-persistence.md)                               | done   | Bridge + session/disk + sizing contract      |
| 01  | [01-resizable-prompt-textareas.md](01-resizable-prompt-textareas.md)                       | done   | Multiline prompts: floor + node flex fill    |
| 02  | [02-inline-node-rename.md](02-inline-node-rename.md)                                       | done   | Double-click / F2 rename on canvas           |
| 03  | [03-node-resize-handle.md](03-node-resize-handle.md)                                       | done   | Always-visible SE resize; width locks mode B |
| 04  | [04-selection-edge-port-highlight.md](04-selection-edge-port-highlight.md)                 | done   | Selected edge + endpoint port chrome         |
| 05  | [05-node-copy-paste.md](05-node-copy-paste.md)                                             | done   | Copy/paste nodes with server sync            |
| 06  | [06-height-auto-resize-and-preview-scroll.md](06-height-auto-resize-and-preview-scroll.md) | done   | Preview scroll; height-only sync in mode B   |

## Related

- Stub note: [copy-paste-canvas.md](copy-paste-canvas.md) → see 05
- Canvas pitfalls: [packages/ui/docs/DIAGRAM_CANVAS.md](../../../packages/ui/docs/DIAGRAM_CANVAS.md)
- Parent index: [../README.md](../README.md)
