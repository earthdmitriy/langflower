---
kind: adr
owner: docs
covers: []
status: current
id: ADR-025
supersedes: []
superseded-by: []
package: docs
---

## ADR-025 — Review Accept: wire artifact vs Work log decision

**Status:** pending (do not implement as product lock yet) · **Date:** 2026-07-22

**Context:** `common-review` finishes with private tools `accept` / `feedback`.
Graph wiring needs **Accept** to forward the reviewed artifact: today
`accept` → port `response` = **passthrough** of input `result` (e.g.
`critique.response → review.result`, `review.response → Finish`). Work log
bubbles use `feed.role: 'result'`, so that same passthrough appears as the
important bubble — identical to the upstream proposer packet. Tool `accept`
already allows optional `notes`; the loop parses them into
`{ kind: 'accept', notes }` and may log `→ accept(…)` on `toolLog`, but
**no result-facing port** emits those notes. Users reading adversarial /
review feeds see “input again,” not Accept vs Feedback as decisions.

**Symptom (not yet a chosen fix):** demo **Adversarial — agree then Review** —
Red-team Review / Review result bubbles repeat Claim/Defense after Agree.

**Alternatives considered (unresolved):**

1. **`response` feed `none` + new `acceptNotes` (or similar) feed `result`**
    - Wire unchanged (passthrough stays on `response`).
    - Bubble = `notes.trim()` or fallback `"Accepted"`.
    - Unwired decision port still emits via runtime empty-subscribe on
      terminal outputs.
    - (−) Extra catalog port; authors must learn wire vs feed split.
    - (−) Empty-notes fallback string is product copy, not model output.

2. **Change `response` wire value to notes / `"Accepted"`**
    - Feed and port align; no new port.
    - (−) Breaks every graph that treats `response` as the accepted
      artifact (adversarial, coding-agent, prompt-refining, …).
    - (−) Needs a second passthrough port anyway → same shape as (1) with
      a rename migration.

3. **UI-only upstream-echo suppression for Review `response`**
    - Hide bubble when text equals an earlier `result` section.
    - (−) Glue in feed-timeline; `accept.notes` still unused.
    - (−) False negatives when Accept notes equal the artifact; false
      positives if two agents legitimately emit identical text.

4. **Protocol `feed.displayValue` (or dual payload) separate from wire**
    - One port carries artifact for edges and decision text for feed.
    - (−) New feed/protocol surface across palette, fold, and docs.
    - (−) Easy to invent one-off display rules per node type.

5. **Structured `response` (e.g. `{ artifact, notes }`)**
    - Both concerns on one port.
    - (−) Breaks `string` wireType and all string-typed edges / Finish.
    - (−) Forces adapters at every consumer — rejected by default under
      [PRINCIPLES](../architecture/PRINCIPLES.md) § No adapters.

6. **Hide Accept in feed; only `feedback` is `result`**
    - Removes duplicate Claim bubbles on Agree.
    - (−) Violates “show both accept and feedback” as decision outputs.
    - (−) Agree path looks like “node went quiet” unless Finish alone
      shows the artifact.

**Decision:** **Not locked.** Park until Accept feed UX vs wire contract is
chosen explicitly. Current shipped behaviour remains: `response` =
passthrough + `feed.role: 'result'`; `accept.notes` parsed but not
result-ported.

**Tradeoffs to settle before accepting:**

| Concern           | Tension                                                                                                                      |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Graph path choice | `response` must keep pulling/forwarding the artifact for demos and Review Gate–like wiring.                                  |
| Work log honesty  | Result bubble should read as Accept/Feedback **output**, not a replay of `result` input.                                     |
| `accept.notes`    | Optional today — either become first-class feed content, stay toolLog-only, or become required.                              |
| Port catalog      | New decision port vs rename/migration vs protocol display override.                                                          |
| Fallback copy     | Who authors `"Accepted"` / `"Agreed"` when notes are empty — product vs model.                                               |
| HITL parity       | Human Review Gate also passthroughs approve as `response` artifact; same feed echo class may need one rule for agent + HITL. |

**Consequences (while pending):**

- Do **not** ship `acceptNotes`, change `response` feed role, or add
  Review-specific echo hacks in UI until this ADR moves to `accepted` /
  `proposed` with a chosen alternative.
- Keep documenting today’s contract in
  [NODE.md](../../packages/common-nodes/src/ai/nodes/review/NODE.md) /
  [LLM_NODES.md](../reference/LLM_NODES.md) (passthrough on accept).
- Revisit when locking adversarial / review Work log UX, or when
  `accept.notes` must be visible as a first-class decision.

**Related:** [feed-panel](../product/features/feed-panel.md) ·
[adversarial-red-team](../product/use-cases/adversarial-red-team.md) ·
[REACTIVE_NODES.md](../reference/REACTIVE_NODES.md) § Review · ADR-022 pending block
(same “parked until tradeoffs settle” pattern).

---
