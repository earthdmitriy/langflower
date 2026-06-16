# Epic 19 — Detachable long run

**Status:** landed  
**Depends on:** Session survives client disconnect (landed); executionFeed
snapshot path  
**Blocks:** [detachable-long-run](../../use-cases/detachable-long-run.md) S2–S4
(S1 Landed) → Partial  
**Index:** [README.md](README.md)

## Goal

Operator starts a long run, closes the browser while `langflower start` stays
up, reopens to the correct live or settled UI, and sees a clear CLI settle
line (`work done` / `failed with error` / completed with errors).

## Acceptance criteria

1. [detachable-long-run](../../use-cases/detachable-long-run.md) S1–S4 Expects
   pass. ✅
2. CLI prints one clear settle line mapped to
   `completed` | `failed` | `completed_with_errors`. ✅
3. Use-case Status Draft → Partial. ✅
4. Demo/CI: `tests/integration/ws/detachable-long-run.ws.test.ts`. ✅
5. `verify` green. ✅

## Landed

- Live settle keeps chrome (matches reconnect); feed status derivation
- `onRunSettled` + CLI `Run settled: …` lines
- FOUND_BUGS BUG-2026-07-21
- [detachable-long-run](../../use-cases/detachable-long-run.md) → **Partial**

## Links

- [detachable-long-run](../../use-cases/detachable-long-run.md)
- [workflow-execution](../../features/workflow-execution.md)
- [feed-panel](../../features/feed-panel.md)
