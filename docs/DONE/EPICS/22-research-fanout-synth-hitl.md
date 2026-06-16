# Epic 22 — Research fan-out synth + conflict HITL

**Status:** landed  
**Depends on:** Loop map-collect demo (DONE/07); feed 17 landed  
**Blocks:** [research-fanout-merge](../../use-cases/research-fanout-merge.md)
(Partial; S4 deferred; S5 related-only; real-LLM open)  
**Index:** [README.md](README.md)

## Goal

Extend research-fanout past Preview `results` JSON: synthesis + conflict
Review/HITL before Finish.

## Acceptance criteria

1. Demo past Preview: synth + conflict Review. ✅
2. Fake CI topology + HITL approve path. ✅
3. S4 selective re-run — deferred in Missing parts. ✅
4. S5 crawl — related-only (`crawl-research`). ✅
5. Use-case stays Partial (honest). ✅
6. `verify` green. ✅

## Landed

- `research-fanout.json`: Loop → Explorer → Preview → Synthesizer →
  `common-review` → Finish
- CI: Fake synth + HITL Review Gate stand-in
- `execute-research-fanout.ws.test.ts` updated

## Links

- [research-fanout-merge](../../use-cases/research-fanout-merge.md)
