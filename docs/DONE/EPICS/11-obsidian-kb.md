# Epic 11 — Obsidian KB

**Status:** landed  
**Depends on:** [10-kb-pipeline.md](10-kb-pipeline.md); ADR-014 outside-root
policy  
**Index:** [README.md](README.md)

## Goal

Generate and maintain a personal Obsidian vault (wikilinks, MOC, curation)
including vault paths **outside** the Langflower project root when allowed.

## Landed

1. **Outside-root vault access** — `harness.allowedRoots` in `langflower.jsonc`
   (ADR-014 extension). Path fence in `@langflower/tools` resolves absolute
   vault paths under allowlisted roots; deny patterns still apply. Wired via
   server `createPermissionAwareHarness`.
2. **Obsidian helpers** — catalog nodes in
   [`packages/common-nodes/src/obsidian/`](../../../packages/common-nodes/src/obsidian/):
    - `common-obsidian-frontmatter` — parse / patch YAML frontmatter
    - `common-obsidian-wikilink-rewrite` — extract + rename `[[wikilinks]]`
    - `common-obsidian-build-moc` — compose Map of Content notes
3. **Demo** — `demo-project/.langflower/workflows/obsidian-kb.json`
4. Use-case Status: [obsidian-kb](../../use-cases/obsidian-kb.md) → **Partial**
   with Remaining gaps (agent curation / HITL merge / Memory / Obsidian API).

## In scope

- Vault IO + link/MOC helpers + docs
- Memory only if needed for multi-pass curation

## Out of scope

- Replacing project-kb
- Electron/Obsidian plugin distribution
- Obsidian API / deep vault host integration (optional later)

## Acceptance criteria

1. User can point at an allowed vault and produce linked notes via a workflow. ✅
   (`harness.allowedRoots` + helpers demo / pipeline tests)
2. obsidian-kb Status → Partial or Implementable with clear Remaining gaps. ✅
