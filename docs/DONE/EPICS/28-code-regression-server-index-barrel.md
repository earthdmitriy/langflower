# Epic 28 — Code regression: remove server package-root barrel

**Status:** landed (2026-07-21)  
**Depends on:** nothing  
**Source:** [docs/code-regression/server-core.md](../../code-regression/server-core.md) finding Critical #1  
**Index:** [README.md](README.md)

## Goal

Delete `packages/server/src/index.ts` (forbidden barrel). Point
`package.json` `exports` at concrete modules and update importers
(`@langflower/server` root consumers) so createServer / bootstrapProject /
createServerContext resolve without an `index.ts` aggregator.

## In scope

- Delete `packages/server/src/index.ts`
- Update `packages/server/package.json` exports (`main`/`types`/`exports`)
- Update CLI, integration helpers, vitest alias, knip/build as needed
- Mark finding addressed in server-core.md / SUMMARY

## Out of scope

- Other server-core findings (resolveDefinition dual, routerChannels, dual-write)
- Thin-server domain moves unrelated to the barrel
- Use-case Status flips

## Acceptance criteria

1. No `packages/server/src/index.ts`.
2. Public consumers import via concrete export subpaths (or a single
   non-`index` entry file that is not a re-export barrel — prefer concrete
   subpaths matching PRINCIPLES).
3. `node build/tools/agent-run.mjs verify` green; dead-code / check-exports clean.
4. Finding Critical #1 marked addressed in
   [server-core.md](../../code-regression/server-core.md).
