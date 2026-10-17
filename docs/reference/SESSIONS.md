---
kind: reference
owner: docs
covers:
    - 'packages/server/src/workflow-sessions/**'
status: current
---

# Workflow sessions

How a workflow keeps one durable conversation across Stop and a process
restart. The decision is
[ADR-040](../adr/040-workflow-sessions-own-points.md).
Operator chrome lives in
[workflow-execution](../product/features/workflow-execution.md). Continue-from-a-boundary
lives in
[resumable-checkpoint-jobs](../product/use-cases/resumable-checkpoint-jobs.md).
Terms: [GLOSSARY § Workflow session](../product/GLOSSARY.md#workflow-session).

A **workflow session** is that conversation. `LangflowerSession` is the
process-side owner of the editor and the runtime (`session.*`,
`packages/server/src/session/`). The two names are different records.

---

## Ownership

The workflow is the parent. A session is one conversation of that workflow.

The graph is the record you name, open, and reuse. Session tabs, the
per-day ordinal, and `.langflower/sessions/<workflowId>/` all hang off
that file. Deleting the open session returns to the workflow file.
Renaming the workflow moves the session directory and rewrites
`workflowId` inside each record.

The snapshot inside a session is that conversation’s copy of the graph.
While the tab is open the canvas shows the copy and autosave writes
there, so a later edit of the workflow file cannot unload the
conversation. The workflow file stays the home: Save, rename, and delete
stay refused until the session is left.

A session is created from a workflow, stays on that workflow, and is
listed with that workflow. Revisit a session-as-root store if a session
must outlive deletion of its workflow, move to another graph, or be
opened from a project-wide list.

`LangflowerSession` is the in-process owner of the editor and one
runtime. It is a third name, not a third saved record, and not the
storage parent.

---

## Files

One session is two files under the project:

```text
.langflower/sessions/<workflowId>/<label>.json
.langflower/sessions/<workflowId>/<label>.feed.jsonl
```

`<label>` is the tab name, `YYYY-MM-DD #N`, from the server-local calendar
day plus an ordinal. `sessionId` is a UUID stored inside the JSON. The
filename is the label.

The JSON record is `schemaVersion: 1`
([`WorkflowSessionFile`](../../packages/shared/src/types/workflow-session.ts)).
It holds the graph snapshot, head `nodeStates`, `headOffset`, and immutable
points. Any other `schemaVersion`, and a version-1 object with incomplete
fields, is **corrupt**: listed, deletable, not selectable, and ignored when
the next ordinal is chosen. Deleting any listed session does not require it
to be bound. Only deleting the bound session leaves it and returns to the
workflow file. The tab asks for confirmation first. Leftover
`.langflower/runs/**/checkpoint.json` files are not read, migrated, or
deleted.

The feed file is the folded work log. Selecting a session emits the latest
run on `executionFeed.snapshot` (`null` clears the panel). `headOffset`
caps that read. Writers store `null`, which reads through the end of the
file.

---

## Binding

`LangflowerSession.binding` is `{ kind: 'workflow' }` or
`{ kind: 'workflowSession', sessionId }`. While a workflow session is
bound, the canvas is that session’s `workflowSnapshot`. The workflow file
stays as it was.

| Action                              | What is stored                                                                                                                                                                                                                                                                                                        |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create a tab                        | Copy of the **saved** workflow file. A dirty graph is refused (`DIRTY_WORKFLOW`).                                                                                                                                                                                                                                     |
| Run with no tab                     | `ensureSessionForRun` copies the graph **on screen**. The workflow file is not written. The editor is not rematerialized.                                                                                                                                                                                             |
| Edit while bound                    | Autosave into the session snapshot (trailing debounce 1000 ms, plus a flush on detach). A tab shows a red dot when its graph differs from the saved workflow (`differsFromWorkflow`, viewport ignored). The open tab uses the canvas. Hover states the difference. The editor does not copy one graph onto the other. |
| Save / rename / delete the workflow | Refused with `SESSION_BOUND`. Load, create, and copy leave the session first.                                                                                                                                                                                                                                         |

Two creates, or two ensures, for the same workflow take
`exclusiveDirectory` for the ordinal and the first write, so two tabs
cannot share one `YYYY-MM-DD #N.json`. Later writes of one session take a
separate lock keyed by `workflowId` and `sessionId`.

---

## Head and points

The **head** is what the next Run continues: `nodeStates` in the JSON, plus
the closed frames of the latest run in the feed file.

A **point** is one immutable checkpoint inside that same session. It is
written only when an author-placed checkpoint boundary is crossed
(`resolveCheckpointBoundary` / `appendWorkflowSessionPoint`) and a session
is bound. The point stores completed node ids, JSON-safe output snapshots,
`nodeStates` at the boundary, and the feed byte range of that run
(`runOffset`, `feedOffset`). Later runs do not rewrite it. Stop with no
boundary adds no point. With no session bound, nothing is written under
`.langflower/sessions` or `.langflower/runs`.

`stale` is computed when listing points: the point’s
`workflowFingerprint` differs from the current snapshot. It is not stored.
A non-JSON output before the boundary sets `unsupported`
(`<nodeId>.<portId>`). Continue stays disabled for that point.

**Reset session** (`resetWorkflowSessionConversation`) clears `nodeStates`,
truncates the feed to 0, and drops every point. The tab and its graph
snapshot stay.

A normal Run on a bound session continues the head. **Continue from…**
rewinds to the chosen point.

---

## When the head reaches disk

`nodeState$` updates in-memory `headNodeStates` only
(`applyWorkflowSessionNodeState`). A value that is not JSON is logged
(`UNSUPPORTED_VALUE`) and left out of the head. Disk waits for the flush.

`createWorkflowSessionHeadFlush` is one trailing debounce of 1000 ms, the
same window as graph autosave:

| Event                                                                                     | Write                                                                                                      |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Port frame whose feed is not streaming (`feed.streaming !== true`; a missing feed counts) | `schedule` — reset the debounce, then append closed feed frames and rewrite `nodeStates` when they changed |
| Open streaming tail (`reasoning`, `progress`, `draft`, `shell`)                           | Stays in memory until the series closes                                                                    |
| `runner.done`                                                                             | No flush. A finished run has nothing to continue                                                           |
| Stop (`runner.interrupt`, then `flushNow`)                                                | Write immediately. The pending debounce is dropped                                                         |
| Bridge detach                                                                             | `flushNow`, then wait for in-flight point writes, then autosave                                            |
| Process crash inside the open debounce                                                    | That write is lost                                                                                         |

The session JSON is rewritten only when head `nodeStates` changed. Graph
edits go through autosave, not through this flush. Closed feed frames are
appended on the same flush, after a `{ kind: 'run', runId }` marker for
that run.

---

## Resume

`runner.resume.requested` `{ pointId }` is Continue. `decidePointResume`
refuses before the runner starts. `BUSY` wins over a missing session, so
an active run is never resumed.

| Code                | Meaning                                            |
| ------------------- | -------------------------------------------------- |
| `BUSY`              | A run is already active                            |
| `NO_SESSION`        | No workflow session is bound                       |
| `CORRUPT`           | The session file failed validation                 |
| `NOT_FOUND`         | `pointId` is not on the bound session              |
| `POINT_STALE`       | Topology changed since the point was written       |
| `UNSUPPORTED_VALUE` | A non-JSON output was captured before the boundary |

On success the server seeds the runner log with the point’s feed slice,
emits that slice on `executionFeed.snapshot`, hydrates progress from the
point, and calls `runner.resume` with the point’s `runId`, completed
nodes, and output snapshots. The session head becomes that point’s
`nodeStates`. Points written after that feed offset are dropped. A
non-resume start clears the in-memory log.

---

## Node state is the author’s job

The session stores and restores only JSON a node emitted itself. A node
that keeps internal state — a chat transcript, a counter, a buffer — must
implement `NodeStateHook` on the bind result
([`node-state.ts`](../../packages/node-sdk/src/node-state.ts)):

- `persist$` emits the **full** JSON snapshot after each committed unit of
  work (`NodeStateJson`: null, boolean, number, string, array, or a plain
  object of the same).
- `restore` runs **before wiring**. `null` starts fresh. `{ ok: false }`
  does not throw and does not abort the run; that node starts fresh.

Without the hook the closure dies with the process. Stop, the next Run,
and a point do not continue that node. In-memory closures still survive
`done` until the graph is rematerialized; that memory is not the session
file. Instance lifetime:
[REACTIVE_NODES § Instance lifetime](REACTIVE_NODES.md). How to return the
hook from `bind`:
[HOW_TO_WRITE_REACTIVE_NODES](../guides/how-to-write-reactive-nodes.md).

OpenAI, Fake, Review, and Critique persist `{ history }` when a turn
completes. Repeat persists `{ nextIndex, done, count }` after each slot
that has already left the node, and the next Run continues the remainder.
Sub-Agent has no hook: its result is a tool call on the parent agent's
transcript.
`Reset session on input` is an Inspector parameter on those four nodes
(default off). It drops that node’s stored transcript on the next run when
a new turn input arrives. It is not the session Reset button.

`@langflower/runtime` keeps a structural twin of the hook and does not
import `@langflower/node-sdk`
([ADR-027](../adr/027-author-sdk-owns-port-types-no-production-runtime-dep.md)).

---

## Where the code lives

| Piece                                                                                                     | Owns                                                                |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| [`workflow-session.ts`](../../packages/shared/src/types/workflow-session.ts)                              | Persisted file, point, bus payloads                                 |
| [`workflow-sessions/`](../../packages/server/src/workflow-sessions)                                       | Store, actions, autosave, head flush, point append, resume decision |
| [`wire-workflow-session-handlers.ts`](../../packages/server/src/bridge/wire-workflow-session-handlers.ts) | `workflowSession.*` intents (create, select, reset, discard point)  |
| [`wire-runner-handlers.ts`](../../packages/server/src/bridge/wire-runner-handlers.ts)                     | Ensure-on-Run, `nodeState$` → head, Stop flush, Continue            |
| [`attach-langflower-bridge.ts`](../../packages/server/src/bridge/attach-langflower-bridge.ts)             | Debounce schedule, detach flush, in-flight point writes             |
| [`node-state.ts`](../../packages/node-sdk/src/node-state.ts)                                              | `NodeStateHook` / `NodeStateJson`                                   |
