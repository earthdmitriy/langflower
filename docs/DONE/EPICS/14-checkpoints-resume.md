# Epic 14 — Durable checkpoints + resume

**Status:** infra landed; **product completed by** [20-explicit-checkpoints](20-explicit-checkpoints.md)  
**Depends on:** execution architecture; **can start without** agent tools  
**Index:** [README.md](README.md)

## Goal

Long-running jobs survive interrupt/restart at **author-chosen** boundaries;
operator **picks** a checkpoint after Stop/restart. Blocks
[resumable-checkpoint-jobs](../../use-cases/resumable-checkpoint-jobs.md).

## Landed (infrastructure — this epic)

1. **Checkpoint format + storage** — `.langflower/runs/<workflowId>/<runId>/checkpoint.json`
   ([ADR-018](../../ADR.md#adr-018--durable-workflow-checkpoints)).
2. **Runtime `resume`** — skip completed nodes; replay JSON-safe output
   snapshots (`packages/runtime/src/runtime-runner.ts`).
3. **Server / WS** — store, resume/discard channels.
4. **Auto persist disabled** — no auto-everywhere checkpoints (rejected).

## Product completion (epic 20)

1. Explicit **checkpoint node** + `createCheckpoint` port meta. ✅
2. **Checkpoint picker** (labeled; required `runId`). ✅
3. Demo + `execute-checkpoint-resume.ws.test.ts` green (incl. STALE). ✅
4. ADR-018 amendment D accepted. ✅
5. Use-case → **Partial** (see epic 20).

## Out of scope

- Distributed multi-machine orchestrators
- Time-travel debugger
- Durable HITL / Memory across resume (still open)
- Auto checkpoint on every node / Stop (rejected)

## Acceptance criteria

1. Explicit-boundary resume path documented + demo. ✅ (epic 20)
2. Use-case Status → Partial/Implementable. ✅ Partial (epic 20)
