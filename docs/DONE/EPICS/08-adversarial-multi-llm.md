# Epic 08 — Adversarial multi-LLM wiring

**Status:** landed  
**Depends on:** [01-tool-loop-builtins.md](01-tool-loop-builtins.md);
ADR-016 feedback session; preferably [03-review-node.md](03-review-node.md)  
**Index:** [README.md](README.md)  
**Mechanics:** [MECHANICS-tool-execution.md](MECHANICS-tool-execution.md) — critique via `feedback` edges; Review port-routed

## Goal

Run two real LLM agents in one workflow (proposer + attacker/rebutter) with
durable feedback edges, then accept via Review / HITL.

Critique handoff stays on existing **`feedback` edges** (external text handoff
per ADR-016) — not per-call `toolCall` / `toolResult` ports. Final accept uses
Review’s **port-routed** control tools (epic 03) or HITL Review Gate. Each agent
may still use the **internal** builtin tool loop from epic 01. See
[MECHANICS-tool-execution.md](MECHANICS-tool-execution.md).

## Landed

1. Demo Soft↔Hard style graph with **openai**
   (`demo-project/.langflower/workflows/soft-vs-hard-harness.json`) —
   `maxFeedbackTurns` + Stop; no finish node.
2. Adversarial demos with openai + **`common-review` accept** + Finish —
   `adversarial-agree-then-review.json` (Red-team = `common-review` path
   choice, then final Review) and `adversarial-review-each-round.json`. CI
   Fake + HITL path remains the separate `adversarial-red-team` fixture
   (unchanged).
3. Guardrail param **`maxFeedbackTurns`** on `common-openai-llm` /
   `common-fake-llm` (`0` = unlimited) — caps Soft↔Hard revise storms;
   past the cap: `toolLog` + cycle **error** (not silent `EMPTY`).
4. Pattern docs: use-case + NODE.md + this epic; Review accept swap noted.
5. CI fake path: `tests/integration/ws/execute-adversarial-red-team.ws.test.ts`
    - unit `debate-loop.node.test.ts` (`maxFeedbackTurns` cap).
6. [adversarial-red-team](../../use-cases/adversarial-red-team.md) Status →
   **Partial**.

## In scope

- Workflow + docs + tests for two-agent critique loop via `feedback`
- Guardrails against unbounded Soft↔Hard storms (`maxFeedbackTurns` /
  `maxIterations` / HITL stop)

## Out of scope

- New node types beyond Review/HITL already planned (no Loop / Merge from 06/07)
- Multi-user SSO (out of scope; epic 15 persona layer removed)
- Rewriting critique as external tool-call/result edges

## Acceptance criteria

1. Proposer → attacker → feedback → revise path works with real provider path
   (CI may mock). ✅
2. Use-case Status → Partial when Review/HITL accept is wired. ✅
