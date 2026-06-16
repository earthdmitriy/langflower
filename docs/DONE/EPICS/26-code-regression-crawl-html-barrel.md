# Epic 26 — Code regression: remove crawl/html barrel

**Status:** landed (2026-07-21)  
**Depends on:** nothing  
**Source:** [docs/code-regression/common-nodes-domain.md](../../code-regression/common-nodes-domain.md) finding Critical #1  
**Index:** [README.md](README.md)

## Goal

Delete the forbidden `index.ts` barrel under `packages/common-nodes/src/crawl/html/`
and retarget package exports / vitest / knip to a concrete non-`index` entry (or
per-file exports) so principles “no barrels” hold for this public surface.

## In scope

- Remove `packages/common-nodes/src/crawl/html/index.ts`
- Update `packages/common-nodes/package.json` `exports["./crawl/html"]`,
  `vitest.config.mjs` alias, `knip.json` entry, and any importers
- Prefer a single non-`index` entry module only if consumers need a combined
  surface; otherwise point at concrete modules

## Out of scope

- Unifying HTML/BFS with `@langflower/tools` (Important #3 — later epic)
- Switch static vs dynamic ports (Critical #2 — later epic)
- Delay `console.log` / other findings in the same chunk report
- Use-case Status flips

## Acceptance criteria

1. No `packages/common-nodes/src/crawl/html/index.ts` (or any new `index.ts`
   barrel in that folder).
2. `package.json` `./crawl/html` (if kept) and vitest/knip point at concrete
   non-`index` module(s); imports still resolve.
3. `node build/tools/agent-run.mjs verify` green; dead-code / check-exports clean
   for touched surface.
4. Code-regression finding can be marked addressed in
   [common-nodes-domain.md](../../code-regression/common-nodes-domain.md) or
   SUMMARY note (orchestrator may update).
