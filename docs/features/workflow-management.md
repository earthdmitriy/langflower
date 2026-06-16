# Workflow management

## Goal

Let a user build up a library of named workflows inside a project — create,
save, load, rename, and delete them — and keep multiple browser tabs on the
same project consistent with each other.

## Core Principles

- **The server owns the truth, tabs only reflect it** — dirty/pristine state
  and the active workflow graph live on the server; a browser tab is a view,
  not a second copy of record.
- **Every tab sees the same state, regardless of who caused the change** — a
  save, rename, or delete from one tab is reflected identically in every
  other open tab on the same project, without that tab needing to know it
  wasn't the one that acted.
- **Catalog and save/load/rename/delete replace as a full snapshot; canvas
  edits event-source on top of one** — the workflow catalog and the active
  document's identity/dirty state always arrive as a complete, current
  snapshot, never a per-field patch. The graph's topology works differently:
  a tab receives one snapshot when a workflow loads, then every canvas edit
  (add/move/connect/delete) is applied as an incremental event on top of it
  — not by re-sending the whole graph after each change.
- **A workflow is a complete, self-contained graph** — nodes, their
  positions, parameters, and edges are saved together as one document; there
  is no partial-save of just nodes or just edges.

## Feature Details

From the toolbar, a user can:

- **Load** a previously saved workflow into the editor.
- **Save** the current in-editor graph to disk under its current name.
- **Rename** the active workflow — updates display name, id, and the
  `{id}.json` file immediately (partial save). Unsaved nodes/edges edits stay
  dirty until the next full save.
- **Copy** a workflow — write `{id}-copy.json` (deduped) and open the copy,
  leaving the original file untouched. This is how a user turns a sample or an
  existing workflow into a starting point for their own, without risking the
  source.
- **Delete** a saved workflow from the catalog.
- **Create new** — start an empty graph (dirty) to build a fresh workflow;
  nothing is written to disk until Save.

The toolbar/catalog shows every saved workflow's metadata (not the full
graph) so browsing the list stays fast even as a project accumulates many
workflows.

**Sample workflows:** today, when a project is bootstrapped (see
[getting-started.md](getting-started.md)), Langflower seeds example workflows
into the **project** catalog. Target split (Draft): first-run keeps only the
**minimum** seed; additional packaged samples are imported from the separate
**Sample workflows** skeleton catalog — see [skeleton](skeleton.md) — not
auto-dumped into the project. Topbar **Copy** remains in-project
`{id}-copy` of a saved workflow; it is not the skeleton catalog import path.
Until skeleton lands, users still copy a seeded sample and tune the copy
rather than edit the original in place.

**Unsaved changes:** editing the canvas (adding/moving/connecting nodes,
editing inline values) marks the current workflow dirty. The editor tracks
this so a user always knows whether their latest edits are persisted.

**Multiple tabs / windows:** if the same project is open in two browser tabs,
both stay in sync. Saving, renaming, loading, or deleting in one tab updates
the catalog and active-document state visible in the other as a full
replacement, without either tab needing to guess whether a change came from
itself or from elsewhere. Canvas edits (adding/moving/connecting/deleting
nodes) also mirror live across tabs, but as a stream of incremental changes
on top of the already-loaded graph, not a full re-send per edit. Reconnecting
(e.g. after a page refresh) restores the current graph as one snapshot,
rather than replaying every past edit that led to it.

**Reopening a project:** the last workflow that was open is remembered and
automatically reloaded the next time the project is opened.

## Implementation Details

- Full WebSocket intent/snapshot contract for workflow load/save/rename/
  delete, and why command-reply events are deliberately avoided in favor of
  broadcast snapshots: [packages/ui/AGENTS.md](../../packages/ui/AGENTS.md)
  § Workflow Topbar, and [docs/ARCHITECTURE.md](../ARCHITECTURE.md) §
  Workflow management / § State sync.
- Canvas edit → server graph mutation path:
  `packages/server/src/workflow/apply-editor-mutation.ts`.
- Workflow file CRUD on disk: `packages/server/src/workflow/workflow.service.ts`
  (files under `<project>/.langflower/workflows/`). `save()` accepts an
  optional `previousWorkflowId`: passing it deletes the old file after writing
  the new one (rename-in-place); omitting it writes a new file and leaves the
  original untouched (copy). Identity is the filename stem (`workflowId` on
  bridge payloads), not a field inside `metadata`. Rename uses a partial save
  that rewrites identity from the on-disk graph so dirty session edits are not
  committed early.
- Sample workflow seeded on project bootstrap:
  `packages/server/src/bootstrap/project-bootstrap.service.ts`
  (`.langflower/workflows/starter.json` from
  `packages/server/skeleton/`).
- Active/"remembered" workflow persisted in project config
  (`currentWorkflowId`): [project-configuration.md](project-configuration.md),
  [docs/CONFIG.md](../CONFIG.md) § Active workflow.
- Workflow JSON storage format (nodes, edges, `data.params`/`data.inputs`):
  [spec.md](../../spec.md) §5.
- Workflow topbar UI: `packages/ui/src/app/features/topbar/`.
