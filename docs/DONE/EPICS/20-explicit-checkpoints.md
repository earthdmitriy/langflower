# Epic 20 — Explicit checkpoints

**Status:** landed  
**Depends on:** DONE/14 store + `RuntimeRunner.resume` + WS resume/discard  
**Blocks:** [resumable-checkpoint-jobs](../../use-cases/resumable-checkpoint-jobs.md)
Draft → Partial  
**Index:** [README.md](README.md)

## Goal

Complete the product bar for durable resume: author-visible checkpoint
boundaries, operator checkpoint picker, demo/CI — continuing
[DONE/14](14-checkpoints-resume.md) without re-enabling auto-everywhere
checkpoints.

## Acceptance criteria

1. Explicit-boundary resume path (node / `createCheckpoint`) + demo. ✅
2. Picker lists labeled checkpoints; Continue from chosen; fingerprint
   mismatch → STALE + Discard. ✅ (+ unit/integration regression)
3. `execute-checkpoint-resume.ws.test.ts` un-skipped and green. ✅
4. ADR-018 amendment D accepted; DONE/14 note updated. ✅
5. Use-case Draft → Partial. ✅
6. `verify` green. ✅

## Landed

- `common-checkpoint` + `createCheckpoint` / `checkpointLabel` on output meta
- Boundary-only disk persist; Stop without boundary = no-op
- Labeled Continue picker; required `runId` on resume
- Demo `checkpoint-resume` + integration tests (happy + stale)

## Links

- [resumable-checkpoint-jobs](../../use-cases/resumable-checkpoint-jobs.md)
- [14-checkpoints-resume](14-checkpoints-resume.md)
- [ADR-018](../../ADR.md#adr-018--durable-workflow-checkpoints)
