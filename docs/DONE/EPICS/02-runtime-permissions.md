# Epic 02 — Runtime permissions ladder

**Status:** landed  
**Depends on:** [01-tool-loop-builtins.md](01-tool-loop-builtins.md)  
**Index:** [README.md](README.md)  
**Mechanics:** [MECHANICS-tool-execution.md](MECHANICS-tool-execution.md) — C7 feed HITL inside **internal** loop

## Goal

Separate **runtime** ask / deny / escalate from author-time allowlists
(`enabledToolIds`). Allowlist = which tools may be bound; permissions = whether
a call is allowed **now** (HITL gate + session policy).

Gated invoke stays **inside** the internal tool loop from epic 01. HITL is
feed `permission.ask` (Allow/Deny on an _action_), not external tool-call /
tool-result edges on the canvas. Criterion **C7** in
[MECHANICS-tool-execution.md](MECHANICS-tool-execution.md).

## Landed

1. Permission policy model — `@langflower/tools/permission` +
   `packages/server/src/harness/permission.ts`; `langflower.jsonc` `permission` /
   `harness.denyPaths` parsed into config.
2. Gated invoke inside `createProjectHarness.invoke` — deny → tool error; ask →
   `runner.permission.ask` / `runner.permission.reply` Promise wait (no canvas
   edges).
3. Run-scoped grants after Allow once (same toolId + detail).
4. Docs: `LLM_NODES.md` allowlist vs permissions; use-case Missing parts updated.
5. Unit tests: policy resolver + ask→allow/deny harness path.

## In scope

- Runtime gate + feed/HITL surface inside the internal tool loop
- Staged budgets sufficient for
  [permission-escalation-ops](../../use-cases/permission-escalation-ops.md)

## Out of scope

- Multi-user identity / SSO (out of scope; epic 15 persona layer removed)
- Changing which tools exist (epic 01)
- Per-call canvas edges for permission-gated tools
- Stage / role approval gates on the graph (Ask User / Review — epics 03 / 15)

## Acceptance criteria

1. Gated tool does not execute until allow (or fails closed on deny). ✅
2. Feed shows a clear permission ask; composer can answer. ✅
3. Author-time allowlist alone is not treated as a security boundary in docs. ✅
4. Use-case Missing parts updated for permission-escalation-ops / coding-agent
   where this was the gap. ✅
