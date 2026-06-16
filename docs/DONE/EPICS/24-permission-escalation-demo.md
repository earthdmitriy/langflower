# Epic 24 — Permission escalation demo

**Status:** landed  
**Depends on:** DONE/02 `permission.ask` + role budgets (01–04)  
**Blocks:** [permission-escalation-ops](../../use-cases/permission-escalation-ops.md)
Blocked → Partial  
**Index:** [README.md](README.md)

## Goal

Prove staged explore → write → bash ops with per-action asks on a dedicated
demo + CI. Do not invent mid-run permission tiers; do not count `basic-coder`
as this Value.

## Acceptance criteria

1. Missing parts for demo/CI + stage visibility closed. ✅
2. Dedicated demo; smoke elsewhere unrelated. ✅
3. Use-case Status → Partial. ✅
4. No mid-run tier invent. ✅
5. `verify` green. ✅

## Landed

- `permission-escalation-ops.json` — Explore → Write HITL → Write → Bash HITL
  → Bash → Finish
- Fake CI: `execute-permission-escalation-ops.ws.test.ts`
- UC honesty Partial (real-LLM Implementable open)

## Links

- [permission-escalation-ops](../../use-cases/permission-escalation-ops.md)
- [DONE/02](02-runtime-permissions.md)
- [DONE/04](04-role-tool-profiles.md)
