# Epic 27 — Code regression: remove Delay console.log

**Status:** landed (2026-07-21)  
**Depends on:** nothing  
**Source:** [docs/code-regression/common-nodes-domain.md](../../code-regression/common-nodes-domain.md) finding Important #4  
**Index:** [README.md](README.md)

## Goal

Remove the debug `tap((x) => console.log(x))` from the Delay reactive node so
shipped runs do not pollute server logs.

## In scope

- Delete the `tap` / `console.log` in `packages/common-nodes/src/flow/delay/node.ts`
- Drop unused RxJS `tap` import if it becomes unused

## Out of scope

- Switch ports, HTML/tools unify, other code-regression findings
- New telemetry / activity plumbing
- Use-case Status flips

## Acceptance criteria

1. Delay `bind` path has no `console.log` / debug `tap` on the delayed stream.
2. Existing delay tests (if any) still pass; `verify` green.
3. Finding marked addressed in
   [common-nodes-domain.md](../../code-regression/common-nodes-domain.md).
