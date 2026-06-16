# Epic 21 — Coding-agent full demo

**Status:** landed  
**Depends on:** Nodes authorable; epics 17–20 landed  
**Blocks:** [coding-agent](../../use-cases/coding-agent.md) S1–S7 topology
(Partial; real-LLM Implementable bar open)  
**Index:** [README.md](README.md)

## Goal

Ship a dedicated `coding-agent.json` demo + Fake CI + documented real-LLM path
for the full multi-loop Value. Keep `basic-coder` as smoke-only.

## Acceptance criteria

1. `coding-agent.json` + CI Fake + real-LLM path documented. ✅
2. Missing-parts full-pipeline demo/CI closed. ✅ (real-LLM Expects remain)
3. Use-case stays **Partial** (honest — not Implementable without live LLM). ✅
4. `basic-coder` smoke-only. ✅
5. `verify` green. ✅

## Landed

- Demo: `demo-project/.langflower/workflows/coding-agent.json`
- CI: `tests/integration/ws/execute-coding-agent.ws.test.ts`
- Docs honesty: PRODUCT / use-cases README / coding-agent.md

## Links

- [coding-agent](../../use-cases/coding-agent.md)
- [PRODUCT.md](../../PRODUCT.md)
