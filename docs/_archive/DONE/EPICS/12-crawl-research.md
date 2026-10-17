# Epic 12 — Crawl / web research nodes

**Status:** landed  
**Depends on:** stubs under crawl/; Merge already shipped; epic 01 for
agent-driven research  
**Index:** [README.md](README.md)

## Goal

Promote crawl nodes from stubs into the runtime catalog and wire E2E research
fan-out → merge graphs.

## Done

1. Inventory `packages/common-nodes/src/crawl/` helpers vs NODE.md — helpers
   kept; Fetch URL / Extract Links / Save Page / Crawl implemented.
2. Registered in `catalog.ts`; offline unit tests + merge-path fixture.
3. SSRF guards + optional `harness.allowedHosts`; crawl storage under
   `.langflower/crawl/{runId}/`. Demo: `crawl-research.json`.
4. Dynamic N researchers still via Loop (epic 07) — optional follow-up.

## In scope

- Crawl/fetch/extract in catalog + safety notes
- Merge with existing Merge node

## Out of scope

- Full browser automation / CAPTCHA
- MCP web tools as primary path (epic 16 optional)

## Acceptance criteria

1. At least one crawl path is runnable and mergeable. ✅
   (`crawl/merge-path.node.test.ts`, demo `crawl-research.json`)
2. research-fanout / article-writing Missing parts updated. ✅
