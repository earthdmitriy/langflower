---
kind: adr
owner: docs
covers: []
status: current
id: ADR-029
supersedes: []
superseded-by: []
package: docs
---

## ADR-029 — Workflow identity is the filename stem

**Status:** accepted · **Date:** 2026-07-23

**Context:** Catalog rows used `metadata.id` from inside each workflow JSON.
Copy-pasting a file (e.g. `fake-llm.json` → `fake-llm-copy.json`) kept the
same embedded id, so the UI listed two workflows that both resolved to one
path — or competed as duplicates. The filesystem already keys files as
`{id}.json`.

**Alternatives considered:**

- **Keep embedded `metadata.id` as source of truth** — rejects: copy-paste and
  external edits desync id from filename; list/load collide.
- **Require unique id inside JSON and reject duplicates on list** — still
  invites silent wrong-file loads when filename ≠ id.
- **Filename stem is identity; omit `id` on disk (chosen)** — one source of
  truth; bridge/session carry `workflowId` (= stem), never inside `metadata`.

**Decision:**

1. On-disk workflow JSON is `{ metadata, graph }` only — no identity field.
2. Bridge/session payloads use sibling `workflowId` (filename stem). Catalog
   rows use `workflowId`; save rename uses `previousWorkflowId`.
3. `WorkflowMetadata` has no `id`. Legacy `metadata.id` on disk is ignored on
   parse (not copied). Display `name` remains a separate user-facing field.
4. No hydrate/toDisk mappers — load/list attach `workflowId` from the stem in
   one object literal; save writes `{ metadata, graph }` to `{workflowId}.json`.

**Tradeoffs accepted:** (+) Copy-paste of files works; catalog cannot collide
on a stale embedded id; no glue adapters mirroring filename into metadata.
(−) Renaming the file outside Langflower changes the workflow id (and
`currentWorkflowId` / checkpoint paths keyed by that id). (−) Legacy files
with embedded `id` are ignored for identity (filename wins).

**Consequences:**

- `WorkflowLoadedPayload` / `WorkflowListEntry` / `WorkflowSavePayload` carry
  `workflowId`; bootstrap example written without id.
- Revisit if we need a stable UUID distinct from the human-editable filename.

**Addendum (2026-07-23):** First pass hydrated identity into `metadata.id`
via `hydrateWorkflowDocument` / `toDiskWorkflowDocument`. That was glue —
identity now lives only as the bridge field `workflowId` (= filename stem);
those adapters are removed.

---
