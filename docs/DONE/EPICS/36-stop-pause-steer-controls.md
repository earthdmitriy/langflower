# Epic 36 — Stop / Pause / Steer controls (UI + runtime)

**Status:** landed (2026-07-25)  
**Depends on:** [35-composer-shell-layout-contract.md](../../TODO/EPICS/35-composer-shell-layout-contract.md)
(composer shell polish remains queued; Pause/Steer ship without it)  
**Index:** [README.md](README.md)  
**Feeds:** [run-interruption](../../use-cases/run-interruption.md)

## Goal

Ship hard **Stop** (rose cancel), soft **Pause** (amber), and post-Pause HITL
composer (textarea + Send) per
[ADR-031](../../ADR.md#adr-031--stop-hard-cancel-vs-pause-soft-interrupt-vs-steer)
(product chrome) and
[ADR-032](../../ADR.md#adr-032--soft-pause-via-hidden-steercontrol-hitl-port)
(`steerControl` mechanism). Pause must not call `interrupt('cancel')`.

## Landed notes

- Inventory port `steerControl` (`single` + HITL textarea) on every LLM via
  [`default-llm-ports.ts`](../../../packages/node-sdk/src/node-factory/define-llm-node/default-llm-ports.ts)
    - owner payload [`steer-control.ts`](../../../packages/node-sdk/src/node-factory/define-llm-node/steer-control.ts)
- Soft Pause / Steer await in
  [`run-internal-tool-loop.ts`](../../../packages/common-nodes/src/tools/run-internal-tool-loop.ts)
  (`afterSoftPause` composer; AbortError → await steer)
- UI: rose Stop + amber Pause (`pause-button.component.ts`),
  `requestSoftPause` with optimistic HITL open + feed settle
- Feed: steer as standalone bubble + draft₁ → steer → draft₂ ordering;
  consecutive same-`nodeId` hover wrapper
- Docs: ADR-031/032, run-interruption, workflow-execution, hitl-chat, STATUS

## Acceptance criteria

1. **Stop** = rose round icon, footer left while running / after Pause; hard
   cancel via interrupt `'cancel'`; tip `Stop — cancel run`. Retire
   amber-in-primary-slot Stop.
2. **Pause** = amber round icon, footer right while a pausable last-feed agent
   is working; tip `Pause — soft interrupt`. Per-node `pushIntoInput`
   `{ kind: 'pause' }` on that agent's `steerControl` (ADR-032; fan-out to all
   working agents superseded).
3. After Pause: HITL composer unlocks (`steerControl` `config.hitl` —
   textarea + **Send**); tabs when 2+ awaiting. Send → `{ kind: 'steer', text }`.
   Workflow stays alive. Fold: pause opens, steer/resume closes (payload-aware).
4. Running chrome (no awaiting): centered `working . . .` + Stop left + Pause
   right ([run-interruption](../../use-cases/run-interruption.md) S5).
5. Soft Pause MUST NOT invent checkpoint Continue; hard Stop MUST NOT create a
   resume point by itself.
6. [run-interruption](../../use-cases/run-interruption.md) Status / Missing parts
   update when S1–S5 land; STATUS clears Pause docs-ahead.
7. Integration coverage for cancel vs soft-pause vs Send continue; `verify`
   green.

## Verify

- Unit: soft-pause / AbortError resume in tool-loop; HITL/feed optimistic Pause;
  feed timeline draft→steer cycles.
- Manual: palette §8 running / after-Pause Send; two agents → tabs.
- `node build/tools/agent-run.mjs verify --quick` green (full `verify` on PR).
