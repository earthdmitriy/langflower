# Workflow execution

## Goal

Let a user run a workflow and immediately see what is happening — which
nodes are working, what values are flowing through which ports, and whether
each node succeeded or failed — without waiting for the whole run to finish.

## Core Principles

- **Live, not polled** — execution progress is pushed to the browser the
  moment it happens; the UI never has to ask "is it done yet?".
- **One node's failure doesn't fail everyone else** — each node's execution
  is isolated; a failed node stops only its own downstream path, and the run
  still reports what did succeed.
- **Partial runs re-use good work** — re-running from a specific node reuses
  already-computed upstream values instead of recomputing the whole graph.
- **Streaming values are visible as they arrive** — nodes that stream output
  (e.g. an agent's reasoning or draft answer) show incremental chunks, not
  just a final value at the end.
- **Only one run active at a time, graph-wide** — this holds even across
  independent clusters in the same workflow: starting a run of one cluster
  is blocked while another cluster's run (including a chat conversation) is
  still active. The user must stop the active run before starting a
  different one.
- **How a run starts follows the graph's shape** — a plain Run runs every
  cluster that doesn't require a chat message to begin; a cluster built
  around a Chat Input node only starts when the user sends that first
  message; a canvas selection narrows Run into a node-scoped restart.

## Feature Details

**Starting a run:** the control the user acts on depends on what the
workflow contains and what, if anything, is selected on the canvas:

1. **Nothing selected, plain Run** — runs every cluster in the workflow that
   does **not** begin with a Chat Input node. This is "run everything that
   doesn't need a first message from me."
2. **A cluster begins with a Chat Input node** — that cluster does not start
   from the plain Run action at all. It only starts when the user presses
   **Start** in that cluster's own composer (see
   [feed-panel.md](feed-panel.md) § Composer layout).
3. **A node is selected on the canvas** — Run narrows to **Run from node**:
   only that node and everything downstream of it re-executes, instead of
   every eligible cluster (see **Partial re-runs** below).
4. **Multiple clusters each have a Chat Input node** — each is an
   independent entry point; the user picks which one to start (e.g. by
   selecting a node inside it) rather than one ambiguous action starting all
   of them at once.

Whichever of the above kicks it off, only **one run is active at a time for
the whole workflow** — including chat conversations. Starting anything else
while a run (or an open chat conversation) is active is blocked until the
user stops the active run first; there is no running two clusters, or a
cluster and a chat, concurrently.

Once a run is underway, nodes light up as "pending" the moment they start,
and settle as either value or error as results arrive — there is no
single "loading" spinner for the whole graph.

**What the user sees while a run is active:**

- Each node shows a pending/value/error state on the canvas.
- Nodes that stream (agent reasoning, draft responses, crawled text, …) show
  their output growing incrementally rather than appearing all at once. See
  [feed-panel.md](feed-panel.md) for how this is presented in the sidebar.
- Values passing through a "preview" port are visible on the node itself in
  real time, not just in the side panel.

**Partial re-runs:** the user can re-run starting from a specific node
instead of the whole graph. Upstream results already computed stay as they
are; only the selected node and everything downstream re-executes. Cancelling
a partial run discards any partial output from that re-run so the next
attempt does not reuse stale values.

**Errors:** if a node fails, it is marked failed and the run continues for
every other branch that does not depend on it. A workflow can finish
"completed with errors" rather than an all-or-nothing failure. Some nodes can
be configured to retry automatically before being marked failed.

**Stopping vs pausing vs steering:** three distinct operator intents — product
scenarios in [run-interruption](../use-cases/run-interruption.md); layout in
[feed-panel.md](feed-panel.md) § Composer layout; product chrome
[ADR-031](../ADR.md#adr-031--stop-hard-cancel-vs-pause-soft-interrupt-vs-steer);
mechanism [ADR-032](../ADR.md#adr-032--soft-pause-via-hidden-steercontrol-hitl-port).

| Control         | Meaning                                                                                                             | Encoding                                                             | Today                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **Stop**        | Hard cancel — run ends                                                                                              | Rose stop icon, composer footer **left** while running / after Pause | **Shipped** via `runner.interrupt.requested` `'cancel'` (DONE epic 36) |
| **Pause**       | Soft interrupt — **one** agent (last feed section) enters HITL-class await on `steerControl`; siblings keep working | Amber pause icon, footer **right** while that agent is pausable      | **Shipped** — ADR-032 per-node; DONE epic 36                           |
| **After Pause** | HITL composer: textarea + **Send** (`steerControl`); tabs if 2+                                                     | Same HITL shell as gates                                             | **Shipped** (DONE epics 35–36)                                         |

For chat-style workflows waiting on human input (see
[hitl-chat.md](hitl-chat.md)), **hard Stop** is how the conversation ends —
it does not auto-complete just because things went quiet. Soft Pause is **not**
that end condition.

**Continue after hard Stop / restart:** durable resume at **explicit** Checkpoint
nodes (or `createCheckpoint` on output meta). On load, **Continue from…**
lists labeled checkpoints; the operator picks one, Discards, or Runs fresh.
Hard Stop without crossing a boundary does not create a resume point. Soft
Pause / Steer MUST NOT invent auto-checkpoints. Fingerprint mismatch → clear
error + Discard. See
[resumable-checkpoint-jobs](../use-cases/resumable-checkpoint-jobs.md) and
[ADR-018](../ADR.md#adr-018--durable-workflow-checkpoints).

Browser disconnect / reopen while the process stays up is
[detachable-long-run](../use-cases/detachable-long-run.md) — **not** Pause.

## Implementation Details

- End-to-end run lifecycle (start intent → runtime → WebSocket telemetry →
  UI projection), package responsibilities, and the WS event catalog:
  [docs/EXECUTION_ARCHITECTURE.md](../EXECUTION_ARCHITECTURE.md).
- Reactive node activity model, pending/value/error state derivation, and
  per-port state machine: [docs/REACTIVE_NODES.md](../REACTIVE_NODES.md).
- Partial-run planning (`buildWorkflowRunPlan`, selective downstream reuse):
  `packages/shared/src/execution/partial-run-plan.ts`, summarized in
  [EXECUTION_ARCHITECTURE.md](../EXECUTION_ARCHITECTURE.md) § Partial runs.
- Run-control resolution (plain Run vs Run-from-node vs chat composer,
  cluster selection when several clusters have their own Chat Input node)
  belongs beside the run action in `packages/ui/src/app/features/editor/`;
  the single-active-run rule is enforced session-wide by
  `WorkflowExecutorService` (server), see
  [EXECUTION_ARCHITECTURE.md](../EXECUTION_ARCHITECTURE.md) § Run lifecycle
  ("One active run").
- UI execution state projection:
  `packages/ui/src/app/services/workflow-execution.service.ts`.
- WebSocket protocol (namespaces, snapshot vs event-sourcing model):
  [docs/ARCHITECTURE.md](../ARCHITECTURE.md) § WebSocket Protocol.
- Runtime engine internals (v2 `Runtime`, StatefulObservable graph):
  `packages/runtime/spec.md`, `packages/runtime/ADR.md`.
- Durable checkpoints + resume (Epic 14):
  [EXECUTION_ARCHITECTURE.md](../EXECUTION_ARCHITECTURE.md) § Durable
  checkpoints; `packages/server/src/checkpoint/`;
  `RuntimeRunner.resume` in `@langflower/runtime`.
- Hard Stop: `runner.interrupt.requested` / `'cancel'` only.
- Soft Pause: [ADR-032](../ADR.md#adr-032--soft-pause-via-hidden-steercontrol-hitl-port)
  — `runner.hitl.event` → `pushIntoInput` on `steerControl` (`pause` / `steer`).
