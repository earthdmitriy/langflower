# Epic 25 — KB contradiction curation

**Status:** landed  
**Depends on:** DONE/10 KB I/O  
**Blocks:** [kb-contradiction-curation](../../use-cases/kb-contradiction-curation.md)
Blocked → Partial  
**Index:** [README.md](README.md)

## Goal

First-class dedupe / contradiction packets, contradiction-shaped HITL merge,
and gated apply/discard on a dedicated curation demo.

## Acceptance criteria

1. Dedupe + contradict → structured packets. ✅
2. Contradiction-shaped HITL merge packet. ✅
3. Gated apply; discard leaves KB unchanged. ✅
4. Demo + Fake CI. ✅
5. Docs honesty; UC → Partial. ✅
6. `verify` green. ✅

## Landed

- `common-kb-dedupe` / `common-kb-contradict` / `common-kb-apply-curation`
- `packages/tools/src/kb/kb-curation.ts`
- Demo `kb-contradiction-curation.json` + WS Fake CI

## Links

- [kb-contradiction-curation](../../use-cases/kb-contradiction-curation.md)
- [DONE/10](10-kb-pipeline.md)
