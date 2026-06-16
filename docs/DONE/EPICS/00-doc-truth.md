# Epic 00 — Doc truth (STATUS / catalog / links)

**Status:** done (2026-07-19)  
**Depends on:** nothing  
**Index:** [README.md](README.md)

## Goal

Make docs trustworthy: what `catalog.ts` registers and what use-cases call
`Blocked` must match STATUS / node-library language. Stop claiming agent /
harness / KB nodes are “done” when they are stubs or absent from the runtime
catalog.

## Next steps

1. Audit [packages/common-nodes/src/catalog.ts](../../../packages/common-nodes/src/catalog.ts)
   vs [docs/STATUS.md](../../STATUS.md) and
   [docs/features/node-library.md](../../features/node-library.md).
2. Mark stub / planned / done accurately; point “agent done” claims at text-only
   LLM + presets, not tool-loop.
3. Fix broken AGENTS.md / NAVIGATION links to missing
   `IMPLEMENTATION_PLAN.md` / `IMPLEMENTATION_PHASES.md` → this EPICS index +
   [../LLM-NODES/llm-nodes-README.md](../LLM-NODES/llm-nodes-README.md).
4. Keep [docs/use-cases/README.md](../../use-cases/README.md) as the product
   readiness source of truth (Implementable / Partial / Blocked).

## In scope

- Doc-only edits (no runtime behavior change)
- Short note in node-library that catalog Status ≠ use-case Status

## Out of scope

- Implementing missing nodes
- Flipping any use-case out of Blocked

## Acceptance criteria

1. STATUS / node-library no longer list unregistered agent/harness/KB/logic
   nodes as `done`.
2. AGENTS.md links resolve to existing docs.
3. EPICS README is discoverable from AGENTS or NAVIGATION.

## Landed

- Rewrote [STATUS.md](../../STATUS.md) common-nodes section from `catalog.ts`
- Added Runtime catalog truth + corrected §2.1 / §7 statuses in
  [node-library.md](../../features/node-library.md)
- Fixed broken `IMPLEMENTATION_PLAN` / `IMPLEMENTATION_PHASES` links → EPICS /
  EXECUTION_ARCHITECTURE / llm-nodes-README
- Updated `packages/common-nodes/src/README.md`
