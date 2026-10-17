---
kind: adr
owner: docs
covers: []
status: current
id: ADR-041
supersedes: []
superseded-by: []
package: docs
---

## ADR-041 — A differing session is a mark, not a graph copy

**Status:** accepted · **Date:** 2026-10-16

**Context:** While a session is bound, canvas edits autosave into that
session’s snapshot. The workflow file stays as it was.
`differsFromWorkflow` is that comparison (`isSameWorkflowDocument`,
viewport ignored). The editor used to offer two actions under the tab:
replace the session graph with the saved workflow, and write the session
graph over the workflow file. An operator cannot see which nodes, wires,
or parameters would change, or what the open conversation would lose.

**Alternatives considered:**

- **Keep both actions and explain them in the tooltip** — the explanation
  still asks the operator to predict a replacement they cannot inspect.
- **A review dialog that lists the graph delta before either write** —
  deferred. The comparison is real, and a later reviewed action can use
  the existing bus intents. The editor has no such surface now.
- **No signal at all** — rejected. The open session can silently stop
  matching the saved workflow.

**Decision:** The editor does not offer “Load workflow into session” or
“Save session graph as workflow”. A session tab shows a red dot to the
left of its label when that session’s graph differs from the saved
workflow. Hovering the tab says so. A closed tab is compared from its
file. The open tab uses the canvas, so an edit shows before the session
file is flushed. The bus intents
`workflowSession.replaceSnapshotFromWorkflow.requested` and
`workflowSession.writeSnapshotToWorkflow.requested` stay for a later
reviewed action. The editor does not send them.

**Tradeoffs accepted:**

- (+) The tab states one fact: this session’s graph is not the saved
  workflow.
- (−) There is no editor control that copies one graph onto the other.
- (−) A closed tab’s dot waits for the next session snapshot, so it
  trails an edit that is still only on the open canvas.
- (+) A viewport-only change still does not count.

**Consequences:**

- Session tab chrome lives in `workflow-session-tabs`. The comparison
  stays in `sessionDiffersFromWorkflow`.
- Revisit when a graph review can show the delta before a copy.

---
