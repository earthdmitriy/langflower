---
kind: feature
owner: docs
covers: []
status: current
---

# Inspector

## Goal

When the operator selects a node on the canvas, the right sidebar shows that
node’s full editable detail — inputs, panel parameters, and cached outputs —
without opening a separate window.

## Core Principles

- **Selection owns the sidebar** — clicking a node swaps the sidebar from the
  [feed](feed-panel.md) work log to the inspector; deselecting (canvas click
  or inspector **Close**) returns to the feed.
- **Full port surface** — every input port (including hidden ones), editable
  inline fields, panel-level parameters, and cached outputs (read-only) are
  available here.
- **Not the run timeline** — live conversation and technical telemetry stay in
  the feed; the inspector is for authoring and inspecting one node’s config /
  last values.
- **Config-backed options stay live** — selects that source providers/models
  from project config (e.g. LLM `providerId` / model) MUST update when
  `langflower.config.snapshot` arrives after a
  [settings-panel](settings-panel.md) Save — not only on first connect.
  See [settings-panel use case S2](../use-cases/settings-panel.md#s2--edit-project-providers-and-models).

## Feature Details

**Enter:** select a node on the canvas → sidebar shows that node’s inspector.

**Leave:** deselect on the canvas, or click **Close** in the inspector
header → sidebar returns to the feed work log.

**Contents:** markdown **description** under the title (same copy as the
palette hover popover), input ports (wired and unwired), inline editors
where declared, panel `uiSchema` fields (including config-backed
provider/model dropdowns), read-only cached outputs from the last run when
present. Multiline textareas can be dragged taller (`resize: vertical`;
height is ephemeral, not persisted). Multiline and markdown fields, both
panel parameters and unwired input ports, show an **Expand** control that
opens a tall editor (max width 700px). Typing there emits the same
`editor.updateNode.requested` payload as the small field (`params` for panel
fields, `inputs` for ports). A wired input is read-only here, same as on the
canvas: the control is disabled, Expand is hidden, and the panel does not
emit `editor.updateNode.requested` for that port. After Settings Save, those dropdown
option lists MUST reflect the new snapshot without requiring the operator
to reload the editor.

**While a run is active:** inspector remains available for the selected node
but is **read-only** — inline inputs, panel params, and tool-permission
toggles do not emit `editor.updateNode.requested`. Stop the run to edit.
Run control (Start / Stop / HITL) stays in the feed composer, not in the
inspector body. The server may still accept `params` patches from other
clients; this UI does not send them.

## Implementation Details

- Right sidebar mode switching (work log vs node params) and file map:
  [packages/ui/docs/DIAGRAM_CANVAS.md](../../../packages/ui/docs/DIAGRAM_CANVAS.md)
  § Right sidebar.
- Inspector panel:
  `packages/ui/src/app/features/sidebar/components/lf-inspector-panel.component.ts`.
- Feed (sibling surface when nothing is selected): [feed-panel.md](feed-panel.md).
