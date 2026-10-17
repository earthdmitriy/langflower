# Specification: Workflow sessions (epic 49)

**Status:** landed  
**Index:** [README.md](README.md)  
**Supersedes:** the run-directory store of
[ADR-018](../../../adr/018-durable-workflow-checkpoints.md)
(`.langflower/runs/**/checkpoint.json`). The ADR-018 rule that checkpoints are
**explicit author boundaries** stays.  
**Related:** [resumable-checkpoint-jobs](../../../product/use-cases/resumable-checkpoint-jobs.md),
[workflow-execution](../../../product/features/workflow-execution.md),
[LLM_RECOVERY](../../../reference/LLM_RECOVERY.md),
[HOW_TO_WRITE_REACTIVE_NODES](../../../guides/how-to-write-reactive-nodes.md)

## 1. Executive Summary & Intent

- **Problem Statement:** Agent conversation history lives only in the
  closure state of `createLlmSessionCycle$` and dies with the run. An operator
  cannot continue a conversation after Stop or a restart, and cannot drop a
  poisoned reviewer transcript on a new input. Durable checkpoints (ADR-018)
  solve a different problem — skip completed graph stages — and live in a
  parallel store: one file per run, no agent history, a picker not scoped to
  any conversation, and it requires the saved workflow file to be unchanged.
- **User Prompt Source:** Add a **Sessions** epic. Persist workflow sessions
  so they can be continued. Invent a node-level serialize / deserialize
  mechanism; agent nodes use it. Add a node setting `reset session on input`
  (new input starts a clean session; expected to help review agents against a
  poisoned session). UI: session tabs on top, to the right of the workflow
  name, horizontal scroll, label = date + ordinal. Store under
  `.langflower/sessions` (the prompt said `.lanflower`; the project directory
  is `.langflower`) and keep a **snapshot of the workflow inside the session**
  so a later workflow edit cannot make the session unloadable. Unify
  checkpoints as points inside a session; no backward compatibility with old
  checkpoint files. On session load the client receives a **feed snapshot**;
  consecutive events on one streaming port are folded on the server to shrink
  storage.
- **External Context:** None. Jira / Confluence MCP are not connected; Figma
  MCP is available but no design file exists.
- **Locked decisions** (made with the user during discovery and the roast):
    1. Checkpoints are **points inside a session**. Old files are ignored.
    2. The active tab keeps its state until the operator creates another
       session. A Run in that tab continues it.
    3. Opening a session shows its **snapshot** on the canvas; the workflow file
       is untouched until an explicit **Save session graph as workflow**.
    4. The node hook is JSON-only; only the four LLM agent nodes implement it.
       Sub-Agent does not.
    5. `Reset session on input` is a node parameter on **OpenAI, Fake, Review
       and Critique**; default off; **no reset button**.
    6. Tab label is `YYYY-MM-DD #N` per workflow per server-local day; tabs
       cannot be renamed.
    7. The restored work log is the **last run of the session only**. Earlier
       runs survive only as agent transcript.
    8. A Run in a session with a stored transcript **appends the new
       `userPrompt` as the next user message** (OpenAI / Fake).
- **Terminology:** In the UI this is a **Session**. In code, bus channels and
  folders it is a **workflow session** (`workflowSession.*`,
  `packages/server/src/workflow-sessions/`). The name `session` is already
  taken by `LangflowerSession` (the process-side editor/runtime owner), the
  `session.*` bus namespace, and `packages/server/src/session/`. Do not reuse
  those. Add a GLOSSARY entry that separates the two.

## 2. Codebase Guardrails & Local Alignment

- **Designated Base Folder:** `packages/server/src/workflow-sessions/` (store,
  actions, autosave). Cross-package seams: `@langflower/node-sdk` (hook type),
  `@langflower/runtime` (hook plumbing, folded log), `@langflower/common-nodes`
  (agent hook), `@langflower/shared` (persisted + bus types),
  `@langflower/ui` (tab strip, Continue).
- **Target Directories:** as listed in § 3.A.
- **Architectural Patterns & Boilerplates Enforced:**
    - Intents → server facts → full-slice snapshots. No command-reply state.
      Refusals are a broadcast fact (`workflowSession.action.failed`), like
      `runner.resume.failed`; no UI state depends on it.
    - Facts → one pure `scan` per concern → named edge effect. Node state leaves
      the node as a **fact stream**, never a pull getter; the feed log is
      folded by a **pure reducer**, not by a second accumulator.
    - `Result` for expected failures; no throws for corrupt files.
    - Persisted types in `@langflower/shared`; node-author contracts in
      `@langflower/node-sdk`; runtime contracts in `@langflower/runtime`.
      No mirrored types.
    - `common-nodes` must not import `@langflower/shared`; JSON validation of a
      node state therefore happens on the server, not in the node.
    - Server stays thin: filesystem + bus wiring. No agent history logic there.
    - `withLatestFrom` forbidden. No `index.ts` barrels. No `any`.
    - UI: standalone OnPush, `lf-hover-tip`, native buttons, Tailwind,
      `var(--lf-*)`, `.lf-btn`, `.lf-scroll`. No Angular Material.
- **Pattern & Boilerplate Reference Baseline:**
    - `packages/server/src/checkpoint/workflow-checkpoint-store.ts`: copy
      `schemaVersion` guard, `isRecord`, `ENOENT` handling, corrupt-result style.
      Do **not** copy one-file-per-run layout.
    - `packages/server/src/checkpoint/run-checkpoint-session.ts`: keep the
      `observe` accumulation of `completedNodeIds` / `outputSnapshots` and the
      serialized `persistChain` (Windows rename races). Drop its store.
    - `packages/server/src/checkpoint/resolve-checkpoint-boundary.ts`: unchanged
      boundary + label resolution.
    - `packages/common-nodes/src/ai/features/llm-session/llm-session-shell.ts`
      `createLlmSessionCycle$` (closure `state`, `state.preparation !== prep`
      reset, `primeTurn0`): the hook attaches here once for all four nodes.
    - `packages/common-nodes/src/ai/features/llm-session/run-session-machine.ts`:
      `runTurnFromState` turn-0 vs feedback branches decide reset and restore.
    - `packages/ui/src/app/features/feed-folding/operators/fold-port-stream.ts`
      (`appendGrowingValue`, growing presentations) and
      `fold-port-events.ts` (`run-started` wipe, `snapshot` replay): the
      server-side fold must replay identically through these. Do not import
      them into the server.
    - `packages/server/src/session/langflower-session.ts`
      (`activeWorkflow`, `currentStatus`, `markDirty`, `buildExecutionFeed`):
      where the binding lives.
    - `packages/ui/.../topbar/components/workflow-topbar.component.ts` and
      `.../composer/components/continue-button.component.ts`: host + picker.
- **Third-Party Dependencies & Packages:** none.
- **Frontend Presentation Strategy:** Angular standalone primitives already in
  the topbar/composer; Tailwind + theme tokens only; scroller uses
  `.lf-scroll`. Check dark + light.
- **Shared Utilities & Hooks to reuse:** `resolveCheckpointBoundary`,
  `buildWorkflowFingerprint`, `toCheckpointJsonValue`,
  `WorkflowLoadedPayload`, `ExecutionFeedSnapshotPayload`, runner `resume`
  overlay, `bridgeEmit` / `clientEmit`.
- **i18n:** none (English literals). **ENV:** none, no new config key.

## 3. Deep System Mechanics & System Analysis

### A. Blast Radius & Impact Assessment

- **Affected modules:** node instance contract; LLM session cycle; runtime
  runner (hook, log); editor binding and autosave; checkpoint accumulation;
  workflow rename / delete; bootstrap order; Continue picker; MCP policy.
- **New Files:**
    - `packages/node-sdk/src/node-state.ts`: `NodeStateJson` (JSON union —
      **the owner** of the type) and `NodeStateHook`.
    - `packages/runtime/src/feed-log-fold.ts` + `.test.ts`: pure
      `appendFeedLogEvent(log, event)`.
    - `packages/shared/src/types/workflow-session.ts`: session file, point,
      summaries, bus payloads, failure codes.
    - `packages/shared/src/workflow/is-same-workflow-document.ts` + `.test.ts`:
      deep equality of a workflow document ignoring `graph.viewport`.
    - `packages/server/src/workflow-sessions/workflow-session-store.ts` + test:
      list / read / atomic write / delete / ordinal, per-session write chain,
      path-segment guard.
    - `.../workflow-session-actions.ts` + test: create, select, leave, delete,
      replace-snapshot, write-snapshot-to-workflow, discard-point (one composer
      per action listing its steps in order).
    - `.../workflow-session-autosave.ts` + test: trailing debounce + forced
      flush.
    - `packages/server/src/bridge/wire-workflow-session-handlers.ts`.
    - `packages/ui/src/app/features/topbar/components/workflow-session-tabs.component.ts`
      and `.../types/workflow-session-tabs-projection.ts` + test.
    - `tests/integration/ws/workflow-sessions.ws.test.ts` (replaces
      `execute-checkpoint-resume.ws.test.ts`).
    - ADR-040 (next free number): workflow sessions, node state hook, folded
      log; marks ADR-018 store superseded.
- **Changed Files:**
    - `packages/node-sdk/.../define-reactive-node/define-reactive-node.ts`:
      optional `state: NodeStateHook` on the `bind()` result, copied onto the
      live instance. Probe `bind()` stays side-effect free.
    - `packages/runtime/src/types.ts`, `runtime-runner.ts`: `RuntimeNode.state?`;
      `nodeState$` (merged `persist$` of hooked nodes for the active run,
      server-internal, not a bus event); start / startNode / resume accept
      optional `nodeStates` and call `restore(state ?? null)` on **every**
      hooked node before wiring; `seedEventLog(events)` (idle only);
      `emitRunnerEvent` folds the **log** (not the live subject) with
      `appendFeedLogEvent`; log is cleared at run start (§ 3.D).
    - `packages/common-nodes/src/ai/features/llm-session/llm-session-shell.ts`,
      `run-session-machine.ts`, `path-choice/bind-path-choice-session.ts`:
      hook + reset + restore.
    - `packages/common-nodes/src/ai/features/ui-schema/llm-panel-ui-schema.ts`:
      export `llmResetSessionOnInputUiField` **separately** — `llmPanelUiSchema`
      is shared by Sub-Agent, which must not get it.
    - `openai-llm`, `fake-llm`, `review`, `critique` `node.ts`: add the field.
    - `packages/server/src/session/langflower-session.ts`: `binding`,
      snapshot document, `buildExecutionFeed` unchanged in shape.
    - `packages/server/src/workflow/apply-editor-mutation.ts`,
      `rename-active-workflow.ts`, and the workflow delete path: binding-aware
      behaviour (§ 3.D).
    - `packages/server/src/checkpoint/run-checkpoint-session.ts`: rename to
      `run-progress-accumulator.ts` / `RunProgressAccumulator`; remove the
      store; produce point progress.
    - `packages/server/src/bridge/wire-runner-handlers.ts`,
      `wire-workflow-handlers.ts`, `wire-project-bootstrap-handlers.ts`,
      `emit-bootstrap.ts`, `attach-langflower-bridge.ts`.
    - `packages/shared/src/langflower-bus-config.ts`, `types/langflower-bootstrap.ts`
      comments, `checkpoint/json-value.ts` (use `NodeStateJson`).
    - `packages/ui/.../services/langflower-bridge.service.ts` (cached keys),
      `workflow-topbar.component.ts`, `continue-button.component.ts`.
    - `packages/langflower-mcp/src/mcp-exposure-policy.ts`,
      `intent-wait-map.ts`, regenerate `generated/bridge-tool-meta.ts`.
    - Docs: GLOSSARY, ADR, `use-cases/resumable-checkpoint-jobs.md`,
      `features/workflow-execution.md`, `features/feed-panel.md`,
      `HOW_TO_WRITE_REACTIVE_NODES.md`, `LANGFLOWER_MCP.md`, `LLM_NODES.md`,
      `packages/ui/AGENTS.md` (reconnect order), `packages/shared/AGENTS.md`,
      `packages/server/AGENTS.md` (layout), FOUND_BUGS, langflower-helper KB
      (`packages/server/skeleton/skills/langflower-helper/` and, when synced,
      `demo-project/.langflower/skills/langflower-helper/`), demo
      `checkpoint-resume` workflow.
- **Deleted Files:**
    - `packages/server/src/checkpoint/workflow-checkpoint-store.ts` + test,
      `list-resumable-checkpoints.ts`: replaced by the session store.
    - From `packages/shared/src/types/workflow-checkpoint.ts`: `WorkflowCheckpoint`,
      summary / snapshot / discard payloads. Keep the port-snapshot shape by
      moving it into `workflow-session.ts`; delete the file when empty.
    - `tests/integration/ws/execute-checkpoint-resume.ws.test.ts`.
    - **Not** deleted: `common-checkpoint` node, `resolve-checkpoint-boundary.ts`,
      `buildWorkflowFingerprint`, `toCheckpointJsonValue`.
- **Backward Compatibility Plan:** No reader, no migration, no sweep of
  `.langflower/runs/**/checkpoint.json`. The bus is internal and co-versioned:
  channels change in one commit with server, UI, MCP and tests.

### B. API, Data Contracts & DAL Strategy

- **Source of truth:** code-first types in
  `packages/shared/src/types/workflow-session.ts`; hook types in
  `packages/node-sdk/src/node-state.ts`.
- **DAL pattern:** one JSON file per session; whole-file write via temp file +
  rename inside a per-session promise chain; validate on read, corrupt result
  instead of throw.
- **Bus** (all new names use `workflowSession.*`):
    - Snapshots: `workflowSession.list.snapshot`
      `{ workflowId, sessions: { sessionId, label, updatedAt, corrupt? }[] }`;
      `workflowSession.current.snapshot`
      `{ workflowId, sessionId | null, differsFromWorkflow, points: PointSummary[] }`.
    - Intents (each carries `sessionId`; the server refuses it when it is not
      the active session, so a second browser tab cannot act on a stale tab):
      `workflowSession.create.requested`, `.select.requested` (`null` = leave),
      `.delete.requested`, `.replaceSnapshotFromWorkflow.requested`,
      `.writeSnapshotToWorkflow.requested`, `.discardPoint.requested { pointId }`.
    - Fact: `workflowSession.action.failed { code, message }` with codes
      `RUN_ACTIVE`, `DIRTY_WORKFLOW`, `SESSION_BOUND`, `NOT_FOUND`, `CORRUPT`,
      `WRITE_FAILED`.
    - Resume: `runner.resume.requested { pointId }`; `runner.resume.failed`
      codes `CORRUPT`, `UNSUPPORTED_VALUE`, `POINT_STALE`, `NOT_FOUND`, `BUSY`,
      `NO_SESSION` (drop `STALE_WORKFLOW`).
    - Feed: the **existing** `executionFeed.snapshot` (no new channel).
    - Removed: `runner.checkpoints.snapshot`, `runner.checkpointed`,
      `runner.checkpoint.discard.requested`.
    - Bootstrap: `workflowSession.list.snapshot` and `.current.snapshot` take the
      slot of `runner.checkpoints.snapshot` and must follow
      `workflow.current.snapshot` consumers' needs (the UI folds need the
      workflow id first); update the order in `emit-bootstrap.ts`, shared and
      UI AGENTS docs together.
- **Session file** (`schemaVersion: 1`, path
  `.langflower/sessions/<workflowId>/<sessionId>.json`):
  `sessionId` (server UUID = filename), `workflowId`, `label`, `localDay`,
  `ordinal`, `createdAt`, `updatedAt`, `workflowSnapshot`
  (`WorkflowLoadedPayload`), `nodeStates` (`nodeId → NodeStateJson`, the head),
  `lastRunFeed` (`ExecutionFeedSnapshotPayload | null`, folded), `points[]`.
- **Point** (immutable once written): `pointId`, `runId`,
  `label?` (as `resolveCheckpointBoundary`), `createdAt`,
  `workflowFingerprint`, `completedNodeIds`, `outputSnapshots`, `nodeStates`,
  `feed` (folded `ExecutionFeedSnapshotPayload`), `unsupported?`
  (`"<nodeId>.<portId>"` when a non-JSON output was seen before the boundary;
  Continue is disabled and says why — same fail-closed result as today's
  `failed` checkpoint). There is **no `status`** field; it cannot be kept
  correct across several runs per session.
- **Node state hook** (`@langflower/node-sdk`):
    ```ts
    type NodeStateHook = {
    	/** Fact: full JSON-safe state after each committed unit of work. */
    	readonly persist$: Observable<NodeStateJson>;
    	/** Called by the runner before wiring; `null` = start fresh. */
    	readonly restore: (
    		state: NodeStateJson | null,
    	) =>
    		| { readonly ok: true }
    		| { readonly ok: false; readonly message: string };
    };
    ```
    A pull `exportState()` is rejected: the agent state is a closure variable
    inside a `concatMap` loader, and "after each completed turn" has no trigger
    without a fact.
- **Agent state:** `{ history: ChatCompletionMessage[] }` and nothing else.
  `feedbackTurns` is **not** persisted — it is a per-run budget
  (`maxFeedbackTurns`, default 50); persisting it would trip the cap for every
  long session. `turn0Done` is not persisted — restore decides it per mode.
  A type-level test asserts `ChatCompletionMessage` is assignable to
  `NodeStateJson`; the server validates with `toCheckpointJsonValue` before
  writing and fails closed.
- **Agent semantics (one mechanism in `createLlmSessionCycle$`):**
    - `persist$` emits `{ history }` when a turn's stream **completes** and after
      a reset. It does not emit on error or Stop mid-turn: partial streamed text
      is never committed to history (FOUND_BUGS rule).
    - **Restore** stores a pending transcript that the **first state creation**
      consumes (the `state === undefined` branch). A later context change
      (`state.preparation !== prep`) resets to a fresh session exactly as today;
      this epic does not change that rule and tests it.
        - `primeTurn0` nodes (OpenAI, Fake): `history = [...stored,
{ role: 'user', content: context.prompt }]`, `turn0Done: false`,
          `feedbackTurns: 0`. The priming tick then runs a turn on the continued
          transcript. (Without this the node would sit idle: stored `turn0Done`
          makes the priming tick skip, and the prelude already contains the old
          prompt.) The stored system message stays frozen.
        - Path-choice nodes (Review, Critique; `primeTurn0: false`):
          `history = stored`, `turn0Done: true`, `feedbackTurns: 0`. The next
          `result` is a revision turn.
    - **Reset on input** (`resetSessionOnInput`, read from `ec.params`): when
      true and a **non-blank turn input** arrives (OpenAI / Fake: `feedback`;
      Review / Critique: their turn input), before `runTurnFromState` the state
      is replaced by `fresh(prep)` with `turn0Done: primeTurn0`.
        - OpenAI / Fake: history = prepared prelude (system + original prompt),
          then the normal feedback path appends the arriving text as the user
          message. Result: a clean session whose first message is that input.
        - Review / Critique: history = prelude; turn 0 consumes the arriving
          input via `buildUserContent(task, result)`.
        - With the flag on, a restored transcript is discarded when the first
          turn input arrives. That is intended.
        - Works with **no active session** (plain per-node behaviour).
        - It is a panel param, so it is a **next-run seed** (`ec.params`); toggling
          it during a run has no effect until the next start.
- **Wrapper strategy:** reuse `resume` overlay, boundary resolver, fingerprint,
  JSON guard. Amend: runner start / resume accept `nodeStates`. Replace the
  checkpoint store with the session store. New: hook, folded log, session
  handlers.
- **Reverse-compatibility risk:** old checkpoint files ignored (accepted);
  bus consumers break at compile time and are all in-repo; custom nodes with
  `createCheckpoint: true` keep working (point written on the active session,
  nothing written with no session); a custom node without `state` loses
  nothing and persists nothing.

### C. Security, Identity & Compliance

- Localhost-only, no new roles. Session files can contain prompts, tool
  output and transcripts; they stay under `.langflower/sessions/`. No
  encryption (TBD-010).
- **Path safety.** There is **no** existing workflow-id path guard
  (`WorkflowService.workflowPath` joins `${workflowId}.json` unchecked).
  The session store must validate `workflowId`, `sessionId`, `pointId`
  itself (non-empty, no separators, no `..`, no drive letters) and refuse
  otherwise. `sessionId` / `pointId` are server UUIDs; clients never choose a
  filename. Log the unchecked workflow path as a separate FOUND_BUGS
  candidate; do not widen this epic to fix it.

### D. Dataflow Architecture & Evolution

- **Binding.** `LangflowerSession` gains
  `binding: { kind: 'workflow' } | { kind: 'workflowSession', sessionId }`.
  While bound, `activeWorkflow` **is** the session snapshot document and all
  existing editor mutations apply to it unchanged.
    - `markDirty()` while bound schedules **autosave** (trailing debounce
      1000 ms; forced flush on run start, Stop, run done, select, leave,
      delete, shutdown). `currentStatus` stays `pristine`; the banner
      (`differsFromWorkflow`) replaces dirty chrome. Viewport pan/zoom and node
      drags are edits, so the debounce is required — never one write per delta.
    - Topbar **Save** is disabled with tip "Session graph autosaves".
      `workflow.saveCurrent.requested`, `workflow.renameCurrent.requested` and
      `workflow.delete.requested` while bound are refused (`SESSION_BOUND`).
      `workflow.load / create / copy` while bound first **leave** (flush, unbind)
      and then run as today.
    - `differsFromWorkflow` = `!isSameWorkflowDocument(snapshot, savedDocument)`.
      `buildWorkflowFingerprint` is topology-only (ignores params, inputs,
      positions) and must **not** drive the banner. The server keeps the saved
      document it loaded at bind time and refreshes it after any workflow-file
      write; external on-disk edits are not watched (recomputed on select).
- **Navigation.** The strip is: fixed **Workflow** home item (sticky, not
  scrolling — the workflow name button already starts rename, so it cannot be
  the "leave session" control), scrollable session tabs, fixed **+ New
  session** on the right. Select / create / delete / leave are refused while
  the graph is executing. HITL and steering are not an executing run: the
  client stops the parked run, then the switch proceeds. The server still
  refuses while `runnerStatus` is `running`.
- **Create.** Refused when the workflow is dirty (`DIRTY_WORKFLOW`). Copies
  the **saved** workflow file, never another session. Ordinal =
  `max(ordinal of that workflow + localDay) + 1`; deleting the highest
  ordinal lets it be reused (no persisted counter). Binds the new session.
- **Run (normal).** Server calls start with `nodeStates = session.nodeStates`;
  the runner calls `restore` on every hooked node (`null` when absent). A node
  whose `restore` fails starts fresh; the server logs the node id and keeps the
  run going. The runtime log is **cleared at run start** (today only Clear and
  a document switch clear it, so after two runs a reconnect replays run 1's
  frames under run 2's id — confirm with a failing test, then add to
  FOUND_BUGS). `nodeState$` is folded into the head map. The head and
  `lastRunFeed` are written on a 1000 ms trailing debounce after a
  non-streaming port frame (`feed.streaming !== true`; a missing feed
  counts). Hard Stop flushes immediately. `runner.done` does not flush:
  finish means the work is done and there is nothing to continue.
- **Point.** On a boundary (`resolveCheckpointBoundary`) the server appends a
  point from `RunProgressAccumulator` progress + the head `nodeStates` + the
  current folded log, and flushes immediately. Stop with no boundary adds no
  point. Points are never rewritten.
- **Continue.** Lists the active session's points. Refuses
  `POINT_STALE` when the point's `workflowFingerprint` differs from the
  current snapshot's (the snapshot is editable, so this is real). Otherwise:
  `runner.seedEventLog(point.feed.events)`, emit `executionFeed.snapshot` =
  `point.feed` (its `runId` is the original run's id — `resume` keeps it, so
  the UI `run-started` handler sees the same id and does not wipe), restore
  `point.nodeStates`, call `resume` with the point's `completedNodeIds` /
  `outputSnapshots`. Head `nodeStates` and `lastRunFeed` become the point's.
  Later points of the session stay listed.
- **Load workflow into session** replaces `workflowSnapshot` from the saved
  file; points whose fingerprint no longer matches become `stale`. **Save
  session graph as workflow** is the only action that writes the workflow file.
- **Workflow rename / delete vs sessions** (sessions are keyed by `workflowId`,
  which rename changes): rename is one composer — move
  `.langflower/sessions/<old>/` to `<new>/`, rewrite `workflowId` in each
  session file, then rename the workflow; on failure move the directory back.
  Delete removes the workflow **and** its sessions directory; the confirm copy
  states how many sessions go with it. Copy does not copy sessions.
- **Feed.**
    - Live sockets still receive every raw frame (`eventsSubject` unchanged).
    - The runtime **log** (`eventLog`) is folded incrementally by
      `appendFeedLogEvent(log, event)`. One log, one reducer: no second
      accumulator beside `eventLog`. `buildExecutionFeed()` is the single
      snapshot builder and keeps its shape.
    - Merge the incoming frame into the **tail** of the log only when **all**
      hold: both are port telemetry (not `done`); same `portDir`, `nodeId`,
      `portId`, `portIdx`, `edgeIds`; both `feed` objects are deep-equal with
      `streaming === true` and role in `reasoning | progress | draft | shell`;
      both responses are `{ value: string }`. The tail value becomes
      `previous + next` (equals `appendGrowingValue`). Anything else is stored
      as its own frame — in particular `tool`, `result`, `recovery`, `pending`,
      `error`, `inactive`, non-string values, and any frame of another lane
      between two chunks (so draft → tool → draft keeps its three segments).
    - **Known limit:** the tail rule is conservative. A **wired** streaming
      port interleaves an `in` frame per edge after every `out` chunk
      (`tapOutputPort` then `tapInputPort`), so it never merges. Feed-only
      ports (`reasoning`, `draftResponse` — normally unwired) are the target.
      Merging across `in` frames would also change `NodePreviewValuesService`
      ("last value wins") and is out of scope.
    - `lastRunFeed` = the folded snapshot of the **most recent run** of the
      session, written on the 1000 ms debounce after a non-streaming port
      frame. `runner.done` does not write it. Selecting a session emits it as
      `executionFeed.snapshot` (`null` clears, and a repeated `null` must still
      clear). The UI replaces its projection and then appends only new live
      frames; it never replays the raw log on top.
    - Equivalence is a hard requirement: for any frame sequence,
      `replayFeedProjection(fold(raw))` yields the same rows and the same chrome
      (node status, HITL awaiting) as `replayFeedProjection(raw)`, ignoring
      `seq`.
    - `Reset session on input` never clears the feed. **Clear** clears the
      runtime log and `lastRunFeed` and does not touch point feeds.
- **State authority:** the session file is authoritative for snapshot, head
  states, last-run feed and points; the live run holds the head in memory
  and reconnect during a run uses the in-memory log. The saved workflow file
  is authoritative for the non-session canvas.
- **Schema evolution:** `schemaVersion: 1` is new; unsupported versions are
  corrupt (listed, not selectable, deletable). No backfill.

### E. Validations & Boundary Conditions

- Hand-written guards (style of `parseCheckpoint`); no Zod.
- A non-JSON node state, or a non-JSON `unsupported` output, fails closed:
  the previous session file stays intact and the failure is logged.
- Empty states: no sessions → strip shows Workflow + New; Continue hidden.
  Session with zero points → Run still continues the head; Continue hidden.
  Empty point label → current stage-count title. Corrupt session → visible,
  not selectable, deletable. `lastRunFeed: null` → select emits `null`.
- Extremes: labels use the **server-local** date; the strip scrolls
  horizontally and never wraps; no new history cap (compaction settings
  apply); the folded log lives inside the session JSON, no side file.

### F. Concurrency & State Collisions

- One promise chain per session file: autosave, head flush, point append,
  delete share it. Run / resume are refused with `BUSY` while a run is active.
  Browser tabs share one server session and render the same list / current
  snapshots; stale-tab intents are refused by the `sessionId` check.

### G. Error Handling & Resiliency

- Failure → behaviour: missing file → `NOT_FOUND`; corrupt → listed corrupt,
  select / resume refused; write failure → `WRITE_FAILED`, in-memory head kept
  until the next successful flush; non-JSON state → previous file kept; bad
  node `restore` → that node starts fresh; resume during a run → `BUSY`;
  mismatched fingerprint → `POINT_STALE` (Discard stays available).
- Logging: existing server log at error level with `sessionId`, node id and
  code; never log transcripts.

## 4. Verification & Definition of Done (DoD)

### A. Testing Strategy Matrix

- [x] **Unit:** session store (ordinal incl. reuse of the highest, path guard,
      corrupt file, atomic write, write chain); `appendFeedLogEvent` (merges
      adjacent same-lane growing strings; never merges across tool / result /
      other port / `pending` / `error` / non-string / differing `feed`; wired lane
      stays unmerged; folding twice is a no-op); **equivalence** test against
      `replayFeedProjection` and chrome folds; agent cycle: `persist$` on
      completed turn only, restore (both modes), later context change resets,
      `feedbackTurns` not carried, reset-on-input (both modes, flag off no-op),
      `ChatCompletionMessage` assignable to `NodeStateJson`;
      `isSameWorkflowDocument` ignores viewport only; point immutability;
      fingerprint staleness; autosave debounce + forced flush; rename composer
      rollback.
- [x] **Integration (WebSocket):** create session → agent turn → restart
      server → select → `executionFeed.snapshot` carries the folded feed → next
      Run continues the transcript (OpenAI / Fake append the new prompt;
      Review continues revisions); checkpoint appends a point; Continue restores
      progress, state and that point's feed without a UI wipe; no session →
      nothing under `.langflower/sessions` or `.langflower/runs`; select / create
      / delete refused during a run; `workflow.saveCurrent` refused while bound;
      Load-into-session leaves the workflow file untouched, Save-as-workflow
      writes it; rename moves sessions; delete cascades; two consecutive runs →
      reconnect shows only the second run's frames (regression for the log-clear).
      Providers mocked.
- [ ] **E2E:** not in this epic.
- [x] **Manual:** tab strip, scroll, banner, snapshot actions, real
      `langflower start`.

### B. Manual Verification Script

#### Test Case 1: Continue after restart

- **Prerequisites:** saved workflow with an OpenAI-or-Fake agent and Chat
  Input; server running; clean workflow.
- **Steps:** 1. Run with no session tab. A tab labeled `YYYY-MM-DD #1`
  (server local day) opens from the graph on screen, and the workflow file's
  timestamp is unchanged. 2. Send a message; get a reply. 3. Stop the process
  and start it again; open the workflow. 4. Run again and send a follow-up
  that refers to the first reply.
- **Expected:** the last session is already open — no tab click. The work log
  shows the previous run's folded feed; the model still has the first
  exchange in context; the label is unchanged. **+ New session** is still
  explicit: it copies the saved workflow file and still refuses a dirty
  workflow.

#### Test Case 2: Reset session on input

- **Prerequisites:** a Review (or Critique) node in a revise loop; flag off.
- **Steps:** 1. Run the loop for two rounds; the reviewer references round 1. 2. Turn the flag on (panel) and **start a new run** (it is a next-run seed). 3. Run two rounds again.
- **Expected:** the second round no longer references the first; there is no
  reset button anywhere; stored points still contain the old transcript.

#### Test Case 3: Checkpoint point inside the session

- **Prerequisites:** active session; `common-checkpoint` between two stages.
- **Steps:** run past the checkpoint, Stop before the later stage ends; open
  **Continue from…**; continue.
- **Expected:** only this session's points are listed; completed stages do not
  re-run; transcript and work log match the boundary; a Stop that never
  crossed a checkpoint added no point.

#### Test Case 4: Snapshot banner and guards

- **Prerequisites:** active session, a second session, a startable run.
- **Steps:** 1. Edit the session graph; banner appears, workflow file
  unchanged, Save is disabled. 2. **Save session graph as workflow**; banner
  clears and the file matches. 3. Edit again; **Load workflow into session**;
  the edit is gone. 4. Start a run; try to switch tab, create, delete.
- **Expected:** only step 2 writes the workflow file; during the run the
  controls are refused with a visible message.

#### Test Case 5: Feed snapshot after reload

- **Prerequisites:** agent streams a draft, calls a tool mid-draft, drafts
  more.
- **Steps:** run; restart; open the session.
- **Expected:** work log shows draft bubble, tool row, next draft bubble; the
  session JSON has far fewer frames than tokens; the flag does not clear it.

#### Test Case 6: Rename and delete

- **Prerequisites:** workflow with two sessions.
- **Steps:** leave the session; rename the workflow; reopen the sessions;
  delete the workflow from the topbar.
- **Expected:** sessions follow the rename; delete confirm names the session
  count and removes them.

### C. Functional Requirements Checklist

- [ ] Optional `NodeStateHook` (`persist$` fact + `restore`) exists in
      node-sdk; the runner restores every hooked node before wiring and exposes
      `nodeState$`; nodes without it persist nothing.
- [ ] OpenAI, Fake, Review, Critique persist only `{ history }`, on completed
      turns; Sub-Agent has no hook and no flag.
- [ ] Restore: OpenAI / Fake append the new `userPrompt` and run; Review /
      Critique wait for the turn input; `feedbackTurns` restarts at 0; a later
      context change resets as today.
- [ ] `Reset session on input` exists on the four nodes, default off, no
      button, works without a session, is a next-run seed, and never clears the
      feed.
- [ ] Tabs: fixed Workflow item, scrolling sessions, fixed New; label
      `YYYY-MM-DD #N` on the server-local day; no rename; switch / create / delete
      refused while running or paused; delete confirms.
- [ ] Bound session edits autosave (debounced + forced flush) to the session
      file only; Save disabled; `saveCurrent` / `rename` / `delete` refused while
      bound; `differsFromWorkflow` is a content comparison ignoring viewport.
- [ ] Create refuses a dirty workflow and copies the saved file; Load and
      Save-as-workflow do only what they say.
- [ ] Points: written on `createCheckpoint` boundaries with progress, node
      states, fingerprint and folded feed; immutable; no `status`; Continue lists
      the active session's points; stale points refuse with `POINT_STALE`.
- [ ] Feed: log folded by `appendFeedLogEvent` under the stated merge rule;
      live frames stay raw; equivalence test green; log cleared at run start;
      `executionFeed.snapshot` on select carries `lastRunFeed` (or `null`);
      Continue emits the point's feed with the original `runId` and the UI does
      not wipe.
- [ ] Workflow rename moves sessions; delete cascades with a counted confirm.
- [ ] No session selected → no session files and no checkpoint points.
- [ ] Old `.langflower/runs/**/checkpoint.json` is not read, migrated or
      swept; removed channels and `STALE_WORKFLOW` are gone.
- [ ] Docs and helper KB updated (list in § 3.A); GLOSSARY separates workflow
      session from `LangflowerSession`.
- [ ] Before close-out: `node build/tools/agent-run.mjs dead-code` → delete
      findings → `check-exports`.

### Verify

- Intermediate (optional): focused vitest for the store, log fold,
  equivalence test and agent cycle; package typecheck.
- **Close-out (required):** `npm run typecheck` (or
  `node build/tools/agent-run.mjs typecheck`) **and** `npm run test` or full
  `node build/tools/agent-run.mjs verify`. Do not mark done on `--quick` or on
  tests without typecheck. Execution, WebSocket and agent changes require the
  integration coverage above.
