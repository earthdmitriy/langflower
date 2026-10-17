---
kind: adr
owner: docs
covers: []
status: current
id: ADR-040
supersedes: []
superseded-by: []
package: docs
---

## ADR-040 — Workflow sessions own points

**Status:** accepted · **Date:** 2026-10-14

**Context:** Agent transcripts lived in the closure of `createLlmSessionCycle$`
and died with the process. ADR-018 checkpoints skipped completed graph stages
but kept a separate file per run, with no transcript, a picker that was not
scoped to a conversation, and a requirement that the saved workflow file was
unchanged. Operators need one durable conversation they can continue after
Stop or a restart, and a way to drop a poisoned transcript on a new input,
without giving up author-placed resume boundaries.

**Alternatives considered:**

- **Keep `.langflower/runs/**/checkpoint.json` and add a second session
  store** — two histories, and Continue would still not know which
  conversation a checkpoint belonged to.
- **Read and migrate old checkpoint files** — rejected. The bus is internal
  and co-versioned; leftover files are ignored.
- **A pull `exportState()` on the node** — rejected. Agent history is a
  closure inside a `concatMap` loader. “After a completed turn” is a fact,
  not a getter the runner can poll.
- **Fold the work log in a second accumulator beside `eventLog`** — rejected.
  One log, one reducer. Live sockets still receive every raw frame.
- **Session as the root entity** (sessions stored and opened on their own,
  the workflow only a template) — rejected. The authored graph is the
  product object. Several conversations of one graph are why the tabs
  exist.

**Decision:**

1. A **workflow session** is the durable conversation for one workflow.
   The workflow is the parent: sessions are stored, listed, and numbered
   under that workflow. The snapshot is the conversation’s copy of the
   graph; deleting the bound session returns to the workflow file. A
   session is created from a workflow and stays on that workflow.
   Files live at `.langflower/sessions/<workflowId>/<label>.json`
   (`schemaVersion: 1`), named like the tab. The record owns the graph
   snapshot, head `nodeStates`, and immutable **points** (feed byte
   offsets). The latest-run feed is `<label>.feed.jsonl`. This is not
   `LangflowerSession` (the process-side editor/runtime owner, bus
   `session.*`, `packages/server/src/session/`).
2. **Binding.** `LangflowerSession.binding` is `{ kind: 'workflow' }` or
   `{ kind: 'workflowSession', sessionId }`. While a workflow session is
   bound, `activeWorkflow` is that session’s snapshot. Edits autosave to the
   session file (trailing debounce 1000 ms, plus a forced flush). The
   workflow file stays pristine; `differsFromWorkflow`
   (`isSameWorkflowDocument`, viewport ignored) is the open tab’s red
   dot ([ADR-041](./041-a-differing-session-is-a-mark-not-a-graph-copy.md)).
   Topbar Save is disabled.
   `workflow.saveCurrent` / `renameCurrent` / `delete` while bound are refused
   (`SESSION_BOUND`). Load, create, and copy leave the session first.
3. **Points replace checkpoint files.** A point is written only when an
   explicit ADR-018 boundary is crossed (`resolveCheckpointBoundary`) and a
   workflow session is bound. Stop with no boundary adds no point. Points are
   never rewritten and have no `status` field. `stale` is computed when the
   point’s `workflowFingerprint` differs from the current snapshot. A non-JSON
   output before the boundary sets `unsupported` and Continue stays disabled.
   With no session bound, nothing is written under `.langflower/sessions` or
   `.langflower/runs`.
4. **Resume** is `runner.resume.requested` `{ pointId }`. Refusal codes are
   `CORRUPT`, `UNSUPPORTED_VALUE`, `POINT_STALE`, `NOT_FOUND`, `BUSY`, and
   `NO_SESSION`. A normal Run on a bound session continues the head
   `nodeStates`. Continue rewinds to the chosen point (progress, node states,
   and that point’s folded feed, keeping the point’s `runId`).
5. **Node state hook** is owned by `@langflower/node-sdk` (`NodeStateJson`,
   `NodeStateHook`: `persist$` plus `restore`). `@langflower/runtime` keeps a
   structural twin and does not import node-sdk
   ([ADR-027](./027-author-sdk-owns-port-types-no-production-runtime-dep.md)).
   The runner calls `restore` on every hooked node before wiring (`null`
   starts fresh; `{ ok: false }` starts that node fresh and does not abort
   the run) and merges `persist$` into `nodeState$` for the active scope.
   OpenAI, Fake, Review, and Critique persist `{ history }` when a turn
   completes. Repeat persists `{ nextIndex, done, count }` after each slot
   that has already left the node. Sub-Agent has no hook: its result is a
   tool call on the parent agent's transcript. `Reset session on input`
   is a panel parameter on those four nodes (default off, next-run seed,
   no button).
6. **Feed.** `foldFeedLogEvent` folds the retained log only. A streaming
   series is one tail frame (`value` is the concatenation) while the
   process is alive. Live `events$` frames stay raw. Closed feed frames are
   appended to `<label>.feed.jsonl` on a 1000 ms trailing debounce after a port
   frame whose feed is not streaming (`feed.streaming !== true`; a missing
   feed counts). The session record is rewritten only when node state or the
   graph changed. Streaming frames do not schedule a write. Hard Stop and
   bridge detach flush immediately and drop a pending debounce. Detach also
   waits for any in-flight point write. `runner.done` does not flush:
   finish means the work is done and there is nothing to continue. An abrupt
   process crash inside the open debounce drops that write. Selecting a
   session emits the latest run from the feed log on
   `executionFeed.snapshot` (`null` clears).
   The log is
   cleared when a non-resume run starts. The diagnostic JSONL writer uses
   the same step and writes a `runner.port` series only when it closes; a
   kill mid-stream drops that open series.
7. **No backward compatibility** with
   `.langflower/runs/**/checkpoint.json`. Those files are not read, migrated,
   or swept.

**Tradeoffs accepted:**

- (+) One conversation owns graph snapshot, transcript, last-run feed, and
  resume points. A later edit of the workflow file cannot unload the session.
- (+) Conversations of one graph stay together: a new tab for a poisoned
  transcript, and Run continues that tab’s head.
- (−) An open tab is the working canvas, so the session can feel like the
  document. The workflow file remains the home.
- (+) Author-visible boundaries stay; Continue is not implied by every node
  or by Stop.
- (−) No migration. Old checkpoint files are inert.
- (−) The work log after select is the last run only. Earlier runs survive
  as agent transcript, not as feed rows.
- (−) The log fold does not merge a wired streaming port, because an `in`
  frame follows every `out` chunk. Feed-only ports (`reasoning`, `draft`)
  are the ones that shrink.
- (−) `feedbackTurns` is not persisted (it is a per-run budget). A context
  change still resets the in-memory session the way ADR-016 already did.
- (−) Langflower MCP exposes `workflowSession.*` beside `runner.resume`.
  `editor.*` stays denied. A refusal races `workflowSession.action.failed`
  against the session snapshot.

**Consequences:**

- Server store, actions, and autosave live in
  `packages/server/src/workflow-sessions/`. `checkpoint/` keeps the boundary
  resolver and `RunProgressAccumulator` only.
- Bootstrap order (`emit-bootstrap.ts`): `executionFeed.snapshot`, then
  `toolConfig.snapshot`, then `workflow.list` / `workflow.current`, then
  `workflowSession.list` / `workflowSession.current`, then `session.ready`.
- UI: session tabs on the workflow topbar; Continue lists the active
  session’s points.
- Revisit if a point must carry HITL or Memory.
- Revisit a session-as-root store if a session must outlive its workflow,
  move to another graph, or be opened from a project-wide list.

---
