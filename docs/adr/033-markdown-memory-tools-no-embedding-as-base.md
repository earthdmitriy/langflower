---
kind: adr
owner: docs
covers: []
status: current
id: ADR-033
supersedes: []
superseded-by: []
package: docs
---

## ADR-033 — Markdown memory tools; no embedding as base

**Status:** accepted · **Date:** 2026-07-27

**Context:** Project “knowledge” was previously a file vector store
(`.langflower/kb/` + embed/search/curation) plus run-scoped key/value memory.
Agents need durable project facts, but the managed corpus is expected to change
**frequently** (daily logs, section rewrites, new feature notes). Embedding
indexes go stale under that churn and pull embedding providers / dimensions /
re-index pipelines into the base product.

**Alternatives considered:**

- **Keep vector KB as base** — strong semantic recall, but requires embedding
  config, re-embed on every meaningful edit, and curation of stale chunks;
  mismatches a frequently rewritten managed folder.
- **Hybrid (markdown files + always-on embeddings)** — richer retrieval, but
  base path still depends on embedding quality and index freshness.
- **Markdown heading tools only (chosen)** — tree / section read / grep /
  append / section update / create under `.langflower/memory/`; deterministic
  backend parsing; no embed pipeline in the default product.

**Decision:**

1. Agent memory is a **managed Markdown folder** (`.langflower/memory/`) exposed
   as wired tools (`get_memory_tree`, `read_memory_section`,
   `search_memory_grep`, `append_memory_log`, `update_memory_section`,
   `create_memory_file`, `update_plan`, `read_plan`) via a **single** pack
   node `common-memory-tools` — not per-tool alias canvas nodes. `update_plan`
   writes reserved `history/plan.md` (`## Plan`) and the pack emits that
   markdown on a `plan` output (`feed.role: 'result'`) so the operator sees
   the current plan in the work log (there is no separate Plan mode).
2. The same folder is **also reachable with common harness file tools**
   (`read` / `write` / `edit` / `create` / `delete` / `glob` / `grep`) using
   paths under `.langflower/memory/`. Do not ship secondary graph nodes that
   only alias those file ops for memory.
3. **Vector KB / managed embed store is not base functionality** — no
   `.langflower/kb/`, no `common-kb-*` on the shipped palette, no hashing
   embedder as product base. **Allowed (epic 42 amend):** Settings default
   embedding identity (`embedding: "providerId/modelId"`), SDK `EmbedHandle`
   wire (`embed-handle`), and catalog Embeddings nodes (`common-embed-*`)
   that call OpenAI-compatible `POST /v1/embeddings` via server-bound
   credentials. Pack-owned vector indexes stay in custom packs — not a host
   product corpus. Do **not** use `ToolHandle` / agent inventory for batch
   float vectors.
4. Design for **frequent edits** in the managed folder: section-level replace
   and append-only logs, atomic writes, heading-addressed updates (not line
   numbers / opaque chunk ids). Cross-file wiki links are plain Markdown only
   in v1 (richer vault linking deferred — see TBD Obsidian).
5. **Wired ToolHandles skip `permission.ask`:** authoring a `tools`
   edge is consent. OpenCode-style `permission` + HITL ask applies to harness
   **builtins** only.

**Tradeoffs accepted:**

- Semantic “fuzzy” recall without exact keywords needs agent grepping /
  reading sections, or a future optional feature — not a core promise.
- Agents must navigate structure (`get_memory_tree`) instead of a single
  similarity query.
- Former vector KB / contradiction-curation demos and Obsidian-as-KB helpers
  leave the active surface (Obsidian → TBD).

**Consequences:**

- Skeleton samples `kb-create` / `kb-navigate` use `common-memory-tools`.
- Update [STATUS](../product/STATUS.md), [node-library](../product/features/node-library.md),
  [CONFIG](../reference/CONFIG.md) (Embeddings § documents Settings default + catalog nodes;
  not vector KB as base), helper skill.

---
