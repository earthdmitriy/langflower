# Epic 10 — KB pipeline (ingest / embed / search)

**Status:** landed  
**Depends on:** [01-tool-loop-builtins.md](01-tool-loop-builtins.md) for
agent-curated KB; can start ingest nodes earlier if isolated  
**Index:** [README.md](README.md)

## Goal

Bring KB Ingest / Embed / Search (and later List / Delete) from stubs into
`catalog.ts` so project wiki / docs KB scenarios can run.

## Landed

1. **File store** under `<project>/.langflower/kb/` (`manifest.json` +
   `collections/{id}/chunks.jsonl` + `vectors.bin`) — matches
   [node-library §7.7](../../features/node-library.md); covered by ADR-002 (no
   new ADR). Server impl: `packages/server/src/kb/` via `ExecutionContext.kb`.
2. **Catalog nodes** — `common-kb-ingest`, `common-kb-embed`, `common-kb-search`,
   `common-kb-list`, `common-kb-delete` in
   [`packages/common-nodes/src/kb/`](../../../packages/common-nodes/src/kb/) +
   `catalog.ts`.
3. **Embeddings** — local hashing MVP offline; optional
   `ExecutionContext.createEmbedding` from `langflower.jsonc` `embedding`
   (`LangflowerEmbeddingConfig` + server `bindCreateEmbedding`).
4. **Fixture AC** — `packages/server/src/kb/kb-store.test.ts` + common-nodes
   pipeline wiring tests prove search returns relevant chunks.
5. Use-case Status: [project-kb](../../use-cases/project-kb.md) → **Partial**;
   [kb-contradiction-curation](../../use-cases/kb-contradiction-curation.md)
   lists remaining gaps (dedupe / contradiction nodes).

## In scope

- Core ingest/embed/search + List/Delete
- Project-root KB paths

## Out of scope

- Obsidian-specific vault outside root (epic 11)
- Full MCP knowledge servers
- Contradiction / dedupe nodes (follow-up for kb-contradiction-curation)

## Acceptance criteria

1. Search returns relevant chunks for an ingested fixture corpus. ✅
2. project-kb Status → Partial; contradiction curation lists remaining gaps. ✅
