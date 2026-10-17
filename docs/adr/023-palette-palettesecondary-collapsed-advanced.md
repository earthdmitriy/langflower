---
kind: adr
owner: docs
covers: []
status: current
id: ADR-023
supersedes: []
superseded-by: []
package: docs
---

## ADR-023 — Palette `paletteSecondary` → collapsed **Advanced**

**Status:** accepted · **Date:** 2026-07-21

**Context:** The shipped common-node catalog (~45 types) made the left palette
noisy: dual-surface domains (KB / Crawl / Memory) list both **tool registration
packs** (`*-tools` → LLM `tools`) and **graph I/O** nodes that call the same
capabilities on canvas ports. Authors almost always want packs for agent
workflows (MECHANICS C5 (`docs/_archive/DONE/EPICS/MECHANICS-tool-execution.md`) — avoid
canvas noise for high-rate tool calls). Less-common Flow nodes (`Loop`,
`Checkpoint`) and KB curation / Obsidian helpers added more vertical bulk.
All Level-2 categories used to expand on first `palette.snapshot`, so nothing
fit on screen.

**Alternatives considered:**

1. **Nested “Graph I/O” (or similar) under each domain category** — e.g. Crawl
   Tools visible, then a second collapse inside Crawl for Fetch/Crawl/….  
   **Rejected:** third UI level next to the pack; registration and secondary
   share one category header; label “Graph I/O” is too domain-specific for
   Flow/curation later.
2. **Collapse whole primary categories** (Crawl / Memory / KB by default) —  
   **Rejected:** hides packs and other primary nodes the user still needs
   first; does not encode dual-surface priority.
3. **Hide secondary from the palette** (search / “show advanced” only) —  
   **Rejected:** breaks discoverability and demo graphs that still use graph
   I/O (crawl-research, kb-contradiction, checkpoints).
4. **Delete graph I/O / dual-surface nodes** (packs only) —  
   **Rejected:** hard-harness and UC paths need port-typed contracts (MECHANICS
   C3); catalog already ships both surfaces.
5. **Rename node `category` metadata to `Advanced`** for secondary types —  
   **Rejected:** loses domain affinity in NODE.md / STATUS / docs; UI can
   regroup without rewriting author metadata.
6. **Flat Advanced list** (no domain subgroups inside Advanced) —  
   **Deferred then rejected for v1 UX:** too mixed when opening Advanced;
   authors asked for the same category split as primary **inside** Advanced.
7. **Per-domain sibling categories** (`Crawl · Advanced`, …) —  
   **Deferred:** workable, but one shared **Advanced** Level-2 is simpler and
   uses a general name; revisit if Advanced grows too large to scan.
8. **Full port-preview cards in the palette list** —  
   **Rejected for density:** popover/`lf-palette-node-preview` stay for detail;
   list rows stay displayName + chrome border.

**Decision:**

- Add optional `paletteSecondary?: true` on
  `defineReactiveNode` / `ReactiveNodeDefinition` (flows into
  `PaletteNodeDefinition` via `toPaletteDefinition`).
- UI projection
  ([`palette-projection.ts`](../../packages/ui/src/app/features/palette/types/palette-projection.ts)):
  non-secondary nodes stay under their `category`; secondary nodes collect
  into one Level-2 group **Advanced** (seed **collapsed**), subdivided by
  original `category` (subcats expanded by default once Advanced opens).
- Filter expands Advanced (and matching subcats) like other groups.
- Product marking (updated for palette clarity):
    - **Primary Tools:** MCP stdio/http, `common-memory-tools`,
      `common-crawl-tools`.
    - **Primary Flow:** Router only; other Flow nodes → Advanced.
    - **Logic:** entire category → Advanced (`paletteSecondary`).
    - **Crawl graph I/O** → Advanced (packs live under Tools).
- Chrome: compact category headers; bordered node rows (canvas-like); nested
  `pl-*` indent; collapse chevron on the **right**.

**Tradeoffs accepted:**

- (+) Packs and everyday Flow stay scannable; Advanced is one deliberate open.
- (+) Flag on the node (not a hardcoded UI allowlist) scales to future
  secondary types / orphans.
- (+) Domain `category` preserved for docs and Advanced sub-grouping.
- (−) Authors must know Advanced exists (filter still finds types by name).
- (−) One Advanced bucket mixes domains until opened (mitigated by subcats).
- (−) Marking which nodes are secondary is a product judgment; wrong marks
  hide useful nodes or re-noise primary.

**Consequences:**

- Docs: [node-library.md](../product/features/node-library.md) §9; UI
  [`AGENTS.md`](../../packages/ui/AGENTS.md) palette table.
- Implementation: `packages/node-sdk` flag;
  `packages/common-nodes` marks; `packages/ui` projection + sidebar.
- **Revisit if:** Advanced subcats still overflow; then consider per-domain
  Advanced siblings or persisted expand state. Revisit marking when harness
  palette FS/shell nodes ship (dual-surface again).

---
