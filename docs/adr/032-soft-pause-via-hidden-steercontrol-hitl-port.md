---
kind: adr
owner: docs
covers: []
status: current
id: ADR-032
supersedes: []
superseded-by: []
package: docs
---

## ADR-032 — Soft Pause via hidden `steerControl` HITL port

**Status:** accepted · **Date:** 2026-07-24

**Context:** Soft Pause must pause one or more active agent turns without
tearing down the run (unlike `interrupt('cancel')`). Architecturally this is
the same class as HITL — **node-internal await** — not a runner interrupt
kind. Multi-tab UI and multi-agent Pause need a shared signal and a composer
shape (textarea + Send; tabs when 2+).

**Alternatives considered:**

- **ExecutionContext runControl / SoftPauseCoordinator** — host side-channel;
  duplicates HITL await semantics; rejected.
- **New `runner.softPause.*` bus family** — unnecessary; `pushIntoInput` already
  broadcasts `input-received` for multi-tab sync; rejected.
- **Extend `interrupt` with `'pause'`** — conflates teardown with await;
  rejected.
- **Hidden `steerControl` + `config.hitl` + `runner.hitl.event` (chosen)** —
  node await; reuses HITL composer; per-node Pause on the last feed section;
  fold from `input-received`.

**Decision:**

1. Every `defineLlmNode` inventory includes input **`steerControl`**:
   `hidden: true` (not author-wired / no canvas port), with
   `config.hitl: { kind: 'textarea', submitLabel: 'Send' }` (and title as
   needed). **Port mode MUST be `single` (default)** — never
   `multi: 'merge' | 'combine'`. `RuntimeRunner.pushIntoInput` accepts only
   single, edge-free inputs ([runtime spec §6.3](../../packages/runtime/spec.md);
   [EXECUTION_ARCHITECTURE](../architecture/EXECUTION_ARCHITECTURE.md) HITL). A merge-mode
   `steerControl` makes Pause a silent no-op (push returns `false`; stream
   continues). Do not copy `subagentResult`'s `multi: 'merge'` here — that
   port is wire-fed, not push-fed.
2. Payload union on that port:
    - `{ kind: 'pause' }` — soft-interrupt this node’s loop; enter await; run
      stays `running`.
    - `{ kind: 'steer', text: string }` — Send: append into loop messages and
      continue.
    - `{ kind: 'resume' }` — Continue (and Enter on an empty draft): retry the
      checkpoint with no new user text. Send stays the typed-correction path.
3. Delivery: existing `runner.hitl.event` →
   `RuntimeRunner.pushIntoInput({ nodeId, portId: 'steerControl', payload })`.
   No new interrupt reason. JSDoc on `runner.hitl.event` must say it is the
   general pushIntoInput transport (not only gates with visible HITL chrome).
4. **UI fold:** payload-aware on `steerControl` — `pause` **opens** awaiting
   for that `nodeId`; `steer` / `resume` **closes**. Do **not** treat
   `{ kind: 'pause' }` as a HITL reply that closes (default HITL fold would).
   Hydrate from `executionFeed.snapshot` like other HITL awaits. Pause is
   **per-node**, not a global run pause: the UI targets the **last feed
   section**'s working agent with `steerControl` (one `runner.hitl.event` per
   click). Other working agents keep running. Primary multi-agent case: A and
   B both working, last feed = A → Pause stops only A; B continues and becomes
   last in feed → a second Pause stops B. Tabs appear when 2+ nodes await
   (sequential Pause and/or Review Gate mix) — not from a single fan-out.
5. Continuation is **only** via `steerControl` Send/resume — not graph
   `feedback` (ADR-016 Soft↔Hard), not `userPrompt`, not cancel.
6. Hard Stop remains `interrupt('cancel')` only
   ([ADR-031](./031-stop-hard-cancel-vs-pause-soft-interrupt-vs-steer.md)).

**Tradeoffs accepted:**

- (+) Same await class as HITL; tabs for two paused agents when the operator
  pauses them sequentially (or mixes with gates).
- (+) Multi-tab sync via existing `input-received` broadcast.
- (+) No bus schema break — docs/JSDoc widen only.
- (−) HITL fold must special-case `steerControl` payloads.
- (−) Bus message name `runner.hitl.event` is historical (rename later optional).

**Consequences:**

- Epics 34/36 implement against this ADR; ADR-031 owns product Stop/Pause
  chrome only.
- [EXECUTION_ARCHITECTURE](../architecture/EXECUTION_ARCHITECTURE.md) documents fold rules
  beside HITL and the **single-mode** `pushIntoInput` constraint.
- [run-interruption](../product/use-cases/run-interruption.md) Runtime rows cite
  `steerControl`.
- Inventory default in `default-llm-ports.ts` must keep `steerControl` single;
  regression covered by runtime push + `defineLlmNode` mode assertions.
- OpenAI, scripted Fake, Sub-Agent, Review, and Critique consume
  `steerControl` through the same reactive loop. Pause aborts/unsubscribes the
  active provider attempt; Steer appends one user message to the last committed
  round checkpoint; Resume retries that checkpoint unchanged.
- Recoverable provider failure suspension reuses the same node-local await.
  Generic runtime/bus reload of an already failed StatefulObservable remains
  [TBD-008](../_work/TBD.md#tbd-008--node-local-reactive-recovery).

---
