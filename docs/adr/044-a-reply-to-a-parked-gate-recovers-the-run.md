---
kind: adr
owner: docs
covers: []
status: current
id: ADR-044
supersedes: []
superseded-by: []
package: docs
---

# ADR: A reply to a parked gate recovers the run

| Field      | Value                                               |
| ---------- | --------------------------------------------------- |
| **Status** | accepted                                            |
| **Date**   | 2026-10-25                                          |
| **Scope**  | `packages/runtime`, `packages/common-nodes`, server |

## Context

A restored session shows the Review Gate its last run was waiting on, and
offers Send feedback and Approve. The run died with the process, so the
reply cold-started a cluster that never produced the gate's `result`: no
activity, the runner stuck in "running", and the work log replaced by the
new run's few frames. Routing the reply to the Chat Input (a new run) was
tried and rejected: it is a new session, not a continuation.

## Decision

The reply continues the **same run**, and the nodes restore themselves
through the ordinary node-state hook (`persist$` and `restore`). The SDK
gains nothing: no new hook argument, no new state contract.

- **A gate restores its own wait.** Review Gate and Chat Loop save
  `{ result }` while they wait and `{ result: null }` once answered. On
  `restore` they keep the value and re-open the wait inside the node. The
  restored value joins the stream the gate already waits on (not the input:
  a stream derived from an input stays inactive until the input has a
  value). No frame is emitted for it, so the work log shows nothing twice. A
  stale wait is harmless in a new run: a fresh `result` replaces it and
  nothing can reply to it without a frame.
- **An agent decides from the run id it saved.** OpenAI and Fake save
  `{ history, runId }`. A restored agent whose saved `runId` is the run it is
  now in has already answered its opening turn: it keeps its transcript and
  waits for the next turn input, like Review and Critique. A different or
  missing `runId` is a new run, and the prompt is appended as before.
- **The server only resumes the run.** On an idle HITL reply,
  `planParkedRecovery` reads the restored work log the way the composer does:
  a node whose latest input was on a non-HITL port, with no HITL reply after
  it, is waiting. It seeds the runner's event log from the restored log and
  calls `runner.resume` with the stored run id and no completed nodes, so the
  UI keeps the log and no second run marker is written. Each chat entry is
  seeded with its last message from the log. `silent` seeds deliver a value
  without a `runner.port` frame, so there is no second user bubble. A chat
  entry cold-starts as before.

## Consequences

- Send feedback and Approve work on a restored gate. The agent sees its
  stored transcript plus the reply, makes one model call, and the gate waits
  again.
- Only gates and agent transcripts restore. A custom node's own memory and an
  unfinished tool call do not.
- A session saved before the agent kept a run id has none: its agent replays
  the opening turn once on the first recovery. Later saves carry it.
- A crash inside the 1 s head-flush window loses the gate's saved wait. A
  gate that saved nothing still re-opens from nothing, so the reply is lost;
  the log still shows it waiting.
- Continue from… also restores the agent as resumed when the point's run is
  the resumed run, so the agent no longer replays its opening turn there.

## Not chosen

- **A restore flag on the hook (`parked`).** A second signal beside the
  state, in the SDK and the runtime, for something the state and the run id
  already say.
- **The server reading node state** (`awaiting`) and re-injecting it with
  runner seeds. A second mechanism next to `restore`, and the server
  parsing node-private shapes.
- **Route the reply to the single Chat Input.** A new run: the log is
  replaced and the gate's loop is lost.
- **Replay the agent's last response into the gate.** Duplicates the answer
  in the work log.
