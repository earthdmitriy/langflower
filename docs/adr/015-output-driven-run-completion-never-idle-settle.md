---
kind: adr
owner: docs
covers: []
status: current
id: ADR-015
supersedes: []
superseded-by: []
package: docs
---

## ADR-015 — Output-driven run completion, never idle settle

**Status:** accepted · **Date:** 2026-06-18 · **Updated:** 2026-07-22

**Context:** Reactive ports may pause, stream repeatedly, or wait indefinitely
for human feedback. “Nothing emitted recently” is not a stable completion
signal. Earlier idle/settle heuristics raced with streaming output and feedback
turns.

**Alternatives considered:**

- **Idle/settle heuristics** — timers, pass counts, or pending-state guesses;
  rejected because they cannot distinguish waiting from completion.
- **Special-case interactive graph classification** — keeps selected HITL
  topologies alive but makes completion depend on catalog types and graph-shape
  recognition.
- **Explicit output-driven lifecycle (chosen)** — completion is a graph/runtime
  fact, not inferred inactivity.

**Decision:**

1. `RuntimeRunner` wires a run scope and leaves it `running`; port inactivity
   does not complete the run.
2. The first watched output from a node with `stopsRun: true` emits runner
   `done` and returns status to `idle`. Starting an empty graph also completes
   immediately.
3. `RuntimeRunner.completeRun()` is an explicit fallback for an active run that
   cannot reach its finish output (for example after an upstream failure).
   `RuntimeRunner.interrupt('cancel')` is the explicit external stop: it tears
   down an active run and sets status to `stopped`; when no run is active it is
   a runtime no-op.
4. There is no feedback-loop classifier or separate HITL completion engine.
   Interactive graphs normally omit a finish path and remain running between
   turns. One-shot graphs include an explicit `common-finish` sink.
5. Runtime events carry `runId`; UI folds scope lifecycle facts to the current
   run.

**Tradeoffs accepted:**

- (+) Completion is deterministic and independent of stream timing.
- (+) The same lifecycle applies to one-shot, streaming, and HITL graphs.
- (+) No catalog-specific graph classifier in the runtime.
- (−) A graph without a demanded `stopsRun` output remains locked until Stop.
- (−) Authors must make intended completion visible in graph topology.

**Consequences:**

- Runtime contract: `packages/runtime/src/runtime-runner.ts` and `types.ts`.
- Finish node: `packages/common-nodes/src/output/finish/node.ts`.
- Bridge lifecycle: `packages/server/src/bridge/wire-runner-handlers.ts` and
  `forward-runner-event.ts`.
- UI projection: `packages/ui/src/app/services/execution-run-gate-fold.ts`.
- See [EXECUTION_ARCHITECTURE](../architecture/EXECUTION_ARCHITECTURE.md).

**Revisit trigger:** A future first-class conversation-complete signal may map
to a `stopsRun` output; it must not restore idle heuristics.

---
