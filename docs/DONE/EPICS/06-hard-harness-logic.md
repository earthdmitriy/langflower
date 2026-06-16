# Epic 06 — Hard harness logic nodes

**Status:** landed  
**Depends on:** [05-partial-pilots.md](05-partial-pilots.md) (or epic 01 minimum)  
**Index:** [README.md](README.md)

## Goal

Implement real Assert / IF / Switch / Compare / Gate nodes (not NODE.md stubs)
so plan → refine → QA graphs can fail closed without an LLM.

## Landed

1. Catalog nodes under `packages/common-nodes/src/logic/`:
   `common-assert`, `common-if`, `common-gate`, `common-compare`,
   `common-switch` (static `pass` / `fail` / `default` ports).
2. Registered in `catalog.ts`; unit tests + runtime Assert error smoke.
3. STATUS / node-library / plan-refine Missing synced; use-case → **Partial**.

## In scope

- Logic nodes required for hard QA gates
- Router/Merge already exist — reuse, do not duplicate

## Out of scope

- Soft LLM “judge” as substitute for Assert
- Full eval fixture runner (epic 09)
- Full dynamic Switch port regeneration when panel `rules` change (helper
  `buildSwitchDefinitionFromParams` only)

## Acceptance criteria

1. ~~At least Assert + one branch node are runnable from the palette.~~ —
   Assert + IF + Gate + Compare + Switch.
2. ~~plan-refine Missing parts narrowed; Partial when combined with epic 01/03.~~
