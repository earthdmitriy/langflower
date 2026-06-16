# Inspector

## Goal

When the operator selects a node on the canvas, the right sidebar shows that
node’s full editable detail — inputs, panel parameters, and cached outputs —
without opening a separate window.

## Core Principles

- **Selection owns the sidebar** — clicking a node swaps the sidebar from the
  [feed](feed-panel.md) work log to the inspector; deselecting returns to the
  feed.
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
  Gap / bar: [settings-panel use case S2](../use-cases/settings-panel.md#s2--edit-project-providers-and-models).

## Feature Details

**Enter:** select a node on the canvas → sidebar shows that node’s inspector.

**Leave:** deselect (or clear selection) → sidebar returns to the feed work
log.

**Contents:** input ports (wired and unwired), inline editors where declared,
panel `uiSchema` fields (including config-backed provider/model dropdowns),
read-only cached outputs from the last run when present. Multiline textareas
can be dragged taller (`resize: vertical`; height is ephemeral, not
persisted). After Settings Save, those dropdown option lists MUST reflect the
new snapshot without requiring the operator to reload the editor.

**While a run is active:** inspector remains available for the selected node;
panel params (e.g. `maxIterations`, `maxFeedbackTurns`) may be edited and
persist for the next run. Run control (Start / Stop / HITL) stays in the feed
composer, not in the inspector body.

## Implementation Details

- Right sidebar mode switching (work log vs node params) and file map:
  [packages/ui/docs/DIAGRAM_CANVAS.md](../../packages/ui/docs/DIAGRAM_CANVAS.md)
  § Right sidebar.
- Inspector panel:
  `packages/ui/src/app/features/sidebar/components/lf-inspector-panel.component.ts`.
- Feed (sibling surface when nothing is selected): [feed-panel.md](feed-panel.md).
