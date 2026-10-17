---
kind: adr
owner: docs
covers: []
status: current
id: ADR-031
supersedes: []
superseded-by: []
package: docs
---

## ADR-031 — Stop (hard cancel) vs Pause (soft interrupt) vs Steer

**Status:** accepted (docs lock) · **Date:** 2026-07-24

**Context:** The palette mockup and operator mental model need three distinct
run controls: kill the run, soft-interrupt an agent turn, and send mid-turn
feedback. Live UI still exposes a single amber **Stop** that maps to
`runner.interrupt.requested` with reason `'cancel'` only
(`packages/shared/src/langflower-bus-config.ts`). Feature docs and
[run-interruption](../product/use-cases/run-interruption.md) must lock the product
split without claiming soft Pause / Steer as shipped.

**Alternatives considered:**

- **Single Stop (cancel only)** — matches today’s bus; conflates abort with
  course-correction; rejected as product target.
- **UI-only Pause that still calls `'cancel'`** — lies to the operator;
  rejected.
- **Stop / Pause / Steer with typed interrupt reasons** — rejected for soft
  Pause; hard cancel stays `'cancel'` only. Soft Pause mechanism is
  [ADR-032](./032-soft-pause-via-hidden-steercontrol-hitl-port.md) (node
  await), not a new interrupt reason.
- **Reuse Checkpoint Continue for Steer** — rejected; checkpoints are
  author-placed durable boundaries
  ([ADR-018](./018-durable-workflow-checkpoints.md)), not mid-turn feedback.

**Decision:**

1. **Stop** = hard cancel = interrupt reason `'cancel'`. Encoding: **error ·
   rose** round icon, composer footer **left** while running or while a soft
   Pause await is open. Tooltip: `Stop — cancel run`.
2. **Pause** = soft interrupt = workflow stays alive; **one** agent (last feed
   section) enters HITL-class await — per-node, not a global run pause.
   Encoding: **warning · amber** round icon, footer **right** while that agent
   is pausable. Tooltip: `Pause — soft interrupt`. Mechanism:
   [ADR-032](./032-soft-pause-via-hidden-steercontrol-hitl-port.md).
3. **After Pause (Steer):** HITL composer unlocks — textarea + **Send**
   (`steerControl` `config.hitl`); tabs when 2+ awaiting agents/gates. Stop
   still hard-cancels. Not checkpoint Continue; not browser disconnect
   ([detachable-long-run](../product/use-cases/detachable-long-run.md)).
4. Pause/Steer + composer shell shipped (DONE epics 35–36); UI MUST NOT wire
   Pause to cancel.
5. Retire the feed-panel rule that forbade “error-red Stop” and required amber
   Stop in the shared Start/Stop primary slot — that layout is replaced by
   corner Stop/Pause while running.

**Tradeoffs accepted:**

- (+) Clear operator mental model; amber reserved for soft interrupt / warning.
- (+) Hard cancel path stays the existing bus reason — no fake Pause.
- (+) Composer shell layout + Pause/Steer loops landed (DONE 34–36).
- (−) Multi-tab draft/active-tab state stays per-browser-tab; awaiting gates
  sync via bus facts.

**Consequences:**

- Mechanism details live in
  [ADR-032](./032-soft-pause-via-hidden-steercontrol-hitl-port.md) — do not
  invent ExecutionContext runControl or new `runner.softPause.*` messages.
- Update [feed-panel](../product/features/feed-panel.md), [hitl-chat](../product/features/hitl-chat.md),
  [workflow-execution](../product/features/workflow-execution.md),
  [run-interruption](../product/use-cases/run-interruption.md), [STATUS](../product/STATUS.md).
- Epics 34/36 implement against ADR-031 (chrome) + ADR-032 (mechanism).

---
