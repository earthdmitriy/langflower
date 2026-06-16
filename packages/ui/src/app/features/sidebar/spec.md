# Specification: HITL Nodes Represented in the UI Feed

## 1. Executive Summary & Intent

- **Problem Statement:** Built-in HITL nodes (`common-hitl-review-gate`,
  `common-chat-input`) declare interactive
  input controls via `HitlInputConfig` on their `inputsConfigs[].config.hitl`.
  The server already forwards `runner.hitl.event` → `RuntimeRunner.pushIntoInput`
  and `REACTIVE_NODES.md` states "Feed panel renders one control per input port
  with `config.hitl`". **However, the UI has no component that renders these
  controls** — the sidebar work-log only shows static output values, and there is
  **no broadcast signal** that a run is active/paused-on-HITL (graph-locked), so
  the feed cannot know when to present live controls. A user running an HITL
  workflow has no way to act on the human-in-the-loop gate.
- **User Prompt Source:** "plan hitl loop — nodes with HitlInputConfig in inputs
  should be represented in UI feed".
- **Constraints from user:**
    - No `runner.status` / `idle` concept — reactive nodes handle interruption
      natively (graph lock gates interaction). The run-active gate is the existing
      `runner.snapshot.status === 'running'` (graph-locked); awaiting HITL
      composer tabs are a separate per-node fold — hard-reset on interrupt /
      `runner.done` / new `runId`, never gated via hydrate on `!isRunning`.
    - **HITL trigger mechanics:** the HITL control surface must appear when a value
      arrives **by wire into a non-HITL input port** of the HITL node (the
      `input-received` event for a port _without_ `config.hitl`), not merely because
      the run started. The HITL-marked ports are the user-action surface that opens
      in response.
    - **HITL ports are invisible and unwireable:** inputs carrying `config.hitl`
      must **not** render as canvas ports and must **not** accept wire connections.
    - **Multiple HITL inputs render together:** when a HITL node has several
      `config.hitl` inputs (e.g. review-gate's approve vs request-changes), the feed
      renders **all** of them at once so the user chooses the feedback type.
- **External Context:** `docs/REACTIVE_NODES.md` § HITL and graph lock;
  `docs/features/feed-panel.md` (feed = control surface); `hitl-config.ts`
  (`@langflower/node-sdk`); `REACTIVE_NODES.md` ADR-015 (interactive
  HITL loops end on Stop, not idle settle).

## 2. Codebase Guardrails & Local Alignment

- **Designated Base Folder:** `packages/ui/src/app/features/sidebar/` (the feed
  surface). Supporting protocol change in `packages/shared` (`langflower-bus-config.ts`
    - `langflower-server.ts`) and server broadcast in `packages/server/bridge`.
- **Target Directories:**
    - `packages/ui/src/app/features/sidebar/components/` — new HITL control
      components + work-log integration.
    - `packages/ui/src/app/features/sidebar/` — extend `feed-section.ts` fold with
      HITL section awareness (optional); add a pure HITL-projection helper.
    - `packages/ui/src/app/services/` — extend `WorkflowExecutionService` with a
      run-active signal (from existing `runner.snapshot`) and a HITL-controls
      projection.
    - `packages/shared/src/langflower-bus-config.ts` + `types/langflower-bootstrap.ts`
      — **reuse** existing `runner.snapshot` (`RunnerSnapshotPayload.status`); no
      new protocol type. Confirm `runId` is present when `status === 'running'`.
    - `packages/server/src/bridge/attach-langflower-bridge.ts` — **no change
      required**; `runner.snapshot` already emits `status` + `runId` on connect
      (line 138) and is updated by `RuntimeRunner.status$`.
- **Architectural Patterns & Boilerplates Enforced:**
    - Bridge-first UI: components read facts from `LangflowerBridgeClient.raw`;
      intents via `client['*.requested'].next(payload)`. No REST, no local
      `BehaviorSubject` caches of domain state (per `packages/ui/AGENTS.md`).
    - Signals / `computed` / `toSignal` / pure RxJS projections only.
    - Tailwind utility classes; native controls + `@angular/aria` for accessibility.
    - No `index.ts` barrels; import concrete paths.
- **Pattern & Boilerplate Reference Baseline:**
    - `packages/ui/src/app/features/sidebar/components/lf-work-log-panel.component.ts`:
      the work-log **timeline** renderer — shows folded `output-emitted` sections
      only. HITL controls do **not** render inside the timeline; the timeline is
      the chat history above the composer.
    - `packages/ui/src/app/features/editor/components/editor-shell.component.ts`:
      the **right sidebar** hosts the work-log timeline (top, scrollable) and a
      **bottom composer** that is the HITL input surface. When one or more nodes
      are awaiting a human reply (`WorkflowExecutionService.hitlTriggeredNodeIds()`,
      chat-style), the composer becomes the HITL surface:
        - **Exactly one** triggered node → its `lf-hitl-textarea` renders directly
          (no tab strip); the user's action (text / approve / deny) reads as the
          next message in the conversation. **Stop** sits in the composer chrome
          next to the node label.
        - **Two or more** triggered nodes → a **tab strip** (one tab per node,
          labelled by node title) above the textarea; the active tab's textarea +
          action buttons are shown. **Stop** sits on the right of the tab strip.
          Selecting a tab switches the surface; hovering a tab, or hovering /
          focusing the active HITL textarea, highlights the related canvas node
          via `NodeHoverService` (same linkage as the work-log feed) — so when
          several gates await at once it is obvious which node receives input.
          A tab appears the moment its node is triggered and disappears when
          that node alone is resolved (submit / HITL-port `input-received`), so
          answering one parallel gate drops only its tab. `runner.done` /
          `runner.interrupted` / a new `runId` hard-reset all awaiting tabs.
        - Footer while awaiting → only `<lf-hitl-actions>` (Approve / Send / …).
          Footer when idle → only `<lf-run-button>` (Run / Run from node).
        - When nothing is awaiting input, the composer shows a neutral hint
          instead of a duplicate block.
          **Clear** lives in the work-log panel header (not the footer). The composer
          height is resizable via `composerHeight` (`DividerPositions`), persisted
          across tabs. Upper bound is viewport-relative (no overlap with the
          work-log/inspector band) — see DIAGRAM_CANVAS § Side panel / composer
          resize. On reconnect mid-await, `executionFeed.snapshot` **hydrates**
          the per-node awaiting fold (same open/close rules as live events); a late
          completed/null snapshot must not wipe siblings already opened by live
          `input-received`.
    - `packages/ui/src/app/features/editor/components/run-button.component.ts`:
      the **existing** run-active gate — `runnerStatus` `toSignal` already folds
      `runner.snapshot` / `runner.started` / `runner.interrupted` / `runner.done`
      into `'running' | 'idle'` (lines 73–94). Reuse this exact derivation; do not
      re-introduce a parallel status signal. Surface it via a shared service
      (`WorkflowExecutionService`) so the work-log reads the same `isRunning`.
    - `packages/ui/src/app/services/workflow-execution.service.ts`: the single
      shared fold backing both work-log and canvas chrome (lines 23–68). Add a
      `hitlControls(nodeId)` projection sourced from node `inputsConfigs[].config.hitl`
        - `NodePreviewValuesService` (submitted values). Read run-active from the
          shared `runnerStatus` signal so canvas chrome and the feed never drift.
    - `packages/ui/src/app/features/sidebar/feed-section.ts`: pure fold helpers
      (`foldOutputEvent`, `foldUserTurn`, `latestOutputValue`) plus chat-density
      projection in `feed-timeline.ts` (`projectFeedTimeline`) — any HITL-derived
      state must be a pure function over `runtime-runner` events + node-definition
      metadata, not mutable local caches.
    - `packages/common-nodes/src/hitl/review-gate/node.ts`: the canonical HITL
      gate — `approve` / `requestChanges` inputs with `config.hitl`. UI must
      read `config.hitl` from `PaletteNodeDefinition.inputsConfigs`.
    - `packages/node-sdk/.../hitl-config.ts`: authoritative `HitlInputConfig`
      shape (`kind: 'textarea' | 'button' | 'file'`, `title`, `promptFrom`,
      `payload`, `placeholder`, `submitLabel`, `role` (`chat-start` |
      `reply` for textarea footer slot), `accept`, `multiple`).
    - `packages/ui/src/app/diagram/resolve-diagram-node-ports.ts`: the canvas
      port projection. HITL-marked inputs (`entry.config?.hitl` / `entry.hitl`)
      must be **excluded** from `resolveInputPortRows` so no port dot / handle
      renders and they cannot be wired — mirroring the existing `isHidden` skip
      (lines 61–70, 132–135). They remain available from `inputsConfigs` for the
      feed projection, not from `inputPorts`.
    - `packages/runtime/src/runtime-runner.ts` (`tapInputPort`, lines 468–502):
      `input-received` fires for **every** wired input. The HITL trigger listens
      for `input-received` on a **non-hitl** port of a HITL node to open its
      controls; HITL-marked ports receive their value only via `pushIntoInput`
      (user action), never via wire.
- **Third-Party Dependencies & Packages:** None new. Reuses `@angular/aria`,
  `rxjs`, `@langflower/shared`, `@langflower/node-sdk` (types only),
  `@langflower/runtime` (types only).
- **Frontend Presentation Strategy (If UI Affected):**
    - **Component Library Standards:** Native Angular controls only (per
      `packages/ui/AGENTS.md` — no Angular Material). Reuse `lf-inline-field`
      styling conventions for textarea/select parity.
    - **Styling & CSS Architecture Guardrails:** Tailwind utilities only;
      `dark:` variants via `html[data-theme='dark']`; `@layer components` only for
      repeated primitives.
- **Shared Utilities & Hooks:**
    - `NodePreviewValuesService.entriesForNode(nodeId)` — already projects live
      `runner.input-received` values keyed by `(nodeId, portId)`; reuse to show the
      submitted value after a HITL reply.
    - `formatPortValue` — reuse for rendering `promptFrom` output context.
    - `resolveNodePorts` / `PaletteNodeDefinition.inputsConfigs` — source of the
      `config.hitl` metadata on the canvas node.
- **Internationalization (i18n) Mechanics:** None configured in repo; user-facing
  strings (control titles, submit labels, "Waiting for your input") come from
  `HitlInputConfig` itself (`title`, `submitLabel`). No separate i18n layer.
- **Environment Configuration (ENV):** None. HITL is a runtime protocol feature,
  not environment-gated.

## 3. Deep System Mechanics & System Analysis

### A. Blast Radius & Impact Assessment

- **Affected Modules / Components:** Sidebar work-log (feed),
  `WorkflowExecutionService`, bridge client projection, server bridge runner
  status emission, shared WS protocol types.
- **Affected Files Inventory:**
    - **New Files:**
        - `packages/ui/src/app/features/sidebar/components/lf-hitl-textarea.component.ts`:
          the single full-height HITL textarea surface in the composer — one
          `(nodeId, portId)`, floating title inside the textarea, emits
          `runner.hitl.event` on submit. It stays visible the whole time the node is
          awaiting input (iterative feedback); the work-log timeline shows the
          submitted history. Rendered once per active tab (or directly when only one
          node is triggered); the active tab's action buttons live in the bottom bar
          (`lf-hitl-actions`), so this is only the text entry region.
        - `packages/ui/src/app/features/sidebar/hitl-projection.ts`: pure helpers —
          `hitlControlsForNode(definition, receivedPorts)` (returns every
          `config.hitl` input on the node), `nonHitlInputReceived(definition, events)`
          (true once a **non-hitl** input on the node emitted `input-received`), and
          `isAwaitableHitlPort(...)`.
    - **Changed Files:**
        - `packages/ui/src/app/features/sidebar/components/lf-work-log-panel.component.ts`:
          the work-log **timeline only** — HITL controls render in the composer
          (editor-shell), not inside the timeline. The timeline is the chat history
          above the composer.
        - `packages/ui/src/app/services/workflow-execution.service.ts`: expose a
          shared `isRunning` (reuse the `run-button.component.ts` `runnerStatus`
          derivation, centralized here) plus a `hitlControls(nodeId)` `computed`
          projection over `inputsConfigs[].config.hitl` and a
          `hitlTriggered(nodeId)` signal driven by `input-received` events on the
          node's non-HITL inputs.
        - `packages/ui/src/app/features/editor/components/run-button.component.ts`:
          consume the centralized `isRunning` from `WorkflowExecutionService`
          instead of maintaining its own `toSignal` (delete the local `runnerStatus`
          derivation to avoid two sources of truth).
        - `packages/ui/src/app/diagram/resolve-diagram-node-ports.ts`:
          exclude HITL-marked inputs (`entry.hitl` / `entry.config?.hitl`) from
          `resolveInputPortRows` so they render **no canvas port dot / handle** and
          cannot be wired. HITL inputs stay excluded from `inputPorts` but remain
          reachable from `PaletteNodeDefinition.inputsConfigs` for the feed. (No
          server change needed — `pushIntoInput` already rejects edge-occupied /
          multi ports, so a wired HITL port is doubly impossible.)
        - `packages/ui/src/app/features/canvas/components/lf-node.component.ts` and
          `lf-node-port-row.component.ts`: verify no port chrome renders for HITL
          inputs once they are excluded by `resolveNodePorts` (regression: no
          stray dot / wire handle).
        - `packages/shared/src/langflower-bus-config.ts`: **no change** — reuse
          existing `runner.snapshot` (`status: RuntimeRunnerStatus`). Keep
          `runner.hitl.event` as-is.
        - `packages/server/src/bridge/attach-langflower-bridge.ts`: **no change** —
          `runner.snapshot` already emits on connect (line 138) and tracks
          `RuntimeRunner.status$`.
    - **Deleted Files:** None.
- **Backward Compatibility Plan:** `runner.status` is additive — existing clients
  ignore unknown events. `session.state.snapshot` gains an optional
  `runnerStatus` field (extend, not replace). No change to `runner.hitl.event`
  payload shape. Existing HITL server forwarding stays unchanged.

### B. API, Data Contracts & DAL Strategy

- **Authoritative Source of Truth:** `langflower-bus-config.ts` (`@langflower/shared`)
  — message types mirror `@langflower/runtime` `RuntimeRunnerApi` shapes directly
  (no DTO adapters, per `packages/shared/AGENTS.md`).
- **Data Access Layer (DAL) Pattern:** N/A — no persistence. HITL state is
  runtime/event-sourced only.
- **Endpoints & Routes Impacted (WS events):**
    - **Reused (no new event):** `runner.snapshot` (server→client) already carries
      `status: RuntimeRunnerStatus` (`'running'` = graph-locked / run active) and
      `runId`. This is the **existing** UI run-active gate for canvas lock /
      Run button (`run-button.component.ts:73`) — **not** the awaiting-HITL fold.
    - **Existing (unchanged):** `runner.hitl.event` (client→server) →
      `RuntimeRunnerApi.pushIntoInput`; `runner.input-received` (server→client,
      emitted on value delivery — used to open/close per-node awaiting). Reactive
      nodes handle interruption natively. Composer tabs follow the per-node fold:
      hard-reset on `runner.interrupted` / `runner.done` / new `runId`.
      `executionFeed.snapshot` hydrates the same fold on reconnect when palette +
      workflow defs are available (hydrate is not gated on `!isRunning`).
      **Feed sections / `feedUserTurns` use the same readiness rule** — wait for
      real `workflow.current.snapshot` + `palette.snapshot` before replaying the
      feed (bootstrap emits feed earlier). Wrong:
      `executionFeed$.pipe(withLatestFrom(startWith(empty) maps))`. Correct:
      `combineLatest([executionFeed$, workflow$, palette$])` + apply once per
      feed identity. See `docs/REACTIVITY.md` § False-ready context /
      BUG-2026-07-21b.
- **Data Contracts (Schemas & Type Specs):**
  `HitlInputConfig` (control shape) is **reused as-is** from
  `@langflower/node-sdk` (`hitl-config.ts`) and surfaced through
  `PaletteNodeDefinition.inputsConfigs[].config.hitl` — no parallel type. The
  HITL submit payload is the existing `runner.hitl.event` shape
  (`RuntimeRunnerApi.pushIntoInput` arg): `{ nodeId, portId, payload }` with
  `runId` supplied from the active `runner.snapshot.runId`.
- **Wrapper Strategy:**
    - Reuse: `NodePreviewValuesService` (input-received projection),
      `WorkflowExecutionService` fold, `resolveNodePorts` (port metadata),
      `runner.snapshot` gate.
    - No new network wrappers — `runner.hitl.event` already routes to
      `pushIntoInput` (`attach-langflower-bridge.ts:876`).
- **Reverse Compatibility Risk Matrix:** None — no protocol change. Existing
  `runner.snapshot` and `runner.hitl.event` are reused unchanged.

### C. Security, Identity & Compliance

- **Authentication & Authorization:** None beyond existing WS session (single
  local project session). HITL replies are scoped to the active `runId` by the
  runtime (`pushIntoInput` rejects out-of-scope/multi/edge-occupied ports —
  `runtime/src/types.ts:355`). UI must send the active `runId` from
  `runner.snapshot` / `runner.started` in the `runner.hitl.event` payload.
- **Data Privacy & Multi-Tenancy:** N/A (local single-user editor). File uploads
  (`kind: 'file'`) stage via existing upload path; `HitlUploadedFile` metadata is
  the only thing carried in the payload — never raw bytes over the bus.

### D. Dataflow Architecture & Evolution

- **State Lifecycle & Pipeline:**
    1. Run starts (`runner.started` / `runner.snapshot.status: 'running'`) → UI
       shared `isRunning` becomes true. A **new** `runId`, `runner.interrupted`,
       or `runner.done` hard-resets the awaiting-HITL set. Hydrate is never
       gated on `!isRunning` (that would nuclear-wipe siblings mid-flight).
    2. A value arrives **by wire** into a **non-HITL** input port of the HITL node
       (e.g. `question` → its `input-received`). This is the **HITL trigger**:
       `WorkflowExecutionService.hitlTriggered(nodeId)` flips true for **that node
       only**. The HITL-marked input ports themselves never carry wires, so their
       values only ever come from the user.
    3. The bottom **composer** (the chat input surface) renders, for each triggered
       HITL node, **all** of its `config.hitl` inputs at once — the textarea
       surface (`lf-hitl-textarea`) plus the action button(s) in the bottom bar
       (`lf-hitl-actions`) — so the user chooses the feedback type
       (approve / request-changes / free-text) as a continuation of the timeline
       above. The `promptFrom` output value (if emitted) is shown as context above
       the controls (from `latestOutputValue` / `NodePreviewValuesService`). The
       work-log **timeline** itself is never overridden by HITL controls — it stays
       a pure execution history; the controls live only in the composer. A pure
       HITL gate emits no output until the user replies, so it has no timeline
       entry yet — that is expected; its controls still surface in the composer
       because `hitlTriggeredNodeIds()` is a **per-node fold** over wired non-HITL
       `input-received` / resolve / hydrate, independent of feed sections and
       run status.
    4. User acts on any control (textarea submit / button click / file pick) → UI
       emits `runner.hitl.event` `{ runId, nodeId, portId, payload }` and
       **immediately clears only that node** from `hitlTriggeredNodeIds()` so the
       composer (textarea + buttons) hides for that node while sibling awaiting
       gates stay visible. Drafts for the node are wiped at the same time.
    5. Server → `pushIntoInput` → runtime delivers value → `runner.input-received`
       fires for that HITL `(nodeId, portId)` → confirms that node stays closed
       (also used on reconnect replay). A later wired non-HITL `input-received`
       on the same node (chat loop) re-opens the composer for that node only.
    6. `executionFeed.snapshot` **hydrates** the same fold when feed + palette +
       workflow are available (reconnect / late defs). After live input/resolve
       deltas, non-hard-reset hydrates (including `status: 'completed'` or
       `null`) are ignored so they cannot wipe parallel siblings. Hard reset on
       `runner.interrupted`, `runner.done`, or a new `runId`. The **work-log
       feed** fold must use the same catalog readiness for HITL `input-received`
       → `feedUserTurns` (see REACTIVITY § False-ready / BUG-2026-07-21b).
- **HITL port visibility (canvas):** inputs carrying `config.hitl` are excluded
  from `resolveNodePorts` output, so they render **no port dot and accept no
  wire** — they exist only as feed controls. A HITL node's canvas body shows only
  its non-HITL (data) input ports.
- **State Authority:** `RuntimeRunner.status$` (server) is the authoritative
  run/lock state; the UI's shared `isRunning` is a pure projection of
  `runner.snapshot` + `runner.*` lifecycle events (already centralized in
  `run-button.component.ts`). Awaiting HITL is a **separate** per-node fold —
  open on non-HITL `input-received`, close on submit / HITL-port
  `input-received`, hydrate from the feed log; never gated on `isRunning`.
- **Schema Evolution & Migration:** No DB/schema. Protocol field is additive.

### E. Validations & Boundary Conditions

- **Input Validation Schemas:** Client-side coercion of `HitlInputConfig.payload`
  template: `textarea` → `{ from: 'textarea' }` substitute with the typed value;
  `button` → static `payload`; `file` → staged `HitlUploadedFile` merged into
  `payload` `HitlFileValue` slot. Server-side validation already lives in
  `pushIntoInput` (rejects missing/multi/edge-occupied ports → returns `false`;
  UI must surface a rejected reply, e.g. disable + inline error).
- **Zero / Empty States:** If a HITL node has `promptFrom` but that output never
  emitted, render the control without context (graceful). Composer HITL controls
  render only while `hitlTriggeredNodeIds()` is non-empty (per-node fold) — not
  while `isRunning` alone. If no `inputsConfigs` entry carries `config.hitl`,
  render nothing extra.
- **Extreme Constraints:** Multiple HITL inputs on one node (e.g. review-gate
  approve vs request-changes) → render **all** `config.hitl` controls together,
  each independently submittable; the user picks the feedback type. A HITL port is
  never occupied by an edge (it is hidden from canvas + `pushIntoInput` rejects
  edge-occupied ports), so the "occupied" branch is impossible for HITL ports by
  construction.

### F. Concurrency & State Collisions

- **Race Condition Mitigation:** Awaiting HITL is a single `foldAwaitingHitl`
  over `input` / `resolve` / `hydrate` / `hardReset` — never a nuclear replace
  keyed on `isRunning`. `hitlTriggered(nodeId)` opens on a non-HITL
  `input-received` and closes on submit / HITL-port `input-received` for that
  node only. After live deltas, hydrates are ignored so a late completed/null
  feed snapshot cannot wipe siblings. Late double-submits are rejected by
  `pushIntoInput` returning `false`. Multi-tab: one server session,
  `executionFeed` hydrate keeps every tab consistent; a reply from any tab
  advances the shared run (no per-tab run ownership). Stop
  (`runner.interrupted`) and `runner.done` hard-reset awaiting.

### G. Error Handling & Resiliency

- **Expected Failure Modes:** `pushIntoInput` returns `false` (port missing /
  out-of-scope / occupied / multi). WebSocket drop mid-HITL → on reconnect the
  client hydrates awaiting nodes from `executionFeed.snapshot` events once
  palette + workflow defs are available (still-open gates reappear).
- **Graceful Degradation:** Rejected reply → control stays enabled with an inline
  error ("Could not submit — run may have moved on"). Controls do not render when
  no node is awaiting. No control flash on snapshot hydrate (state is derived,
  not animated).
- **Telemetry, Logging & Observability:** No new telemetry beyond existing
  `runner.*` events. UI errors (rejected `hitl.event`) logged via Angular console
  in dev only.

## 4. Verification & Definition of Done (DoD)

### A. Testing Strategy Matrix

- [x] **Unit Testing:** Pure HITL projection helpers (`hitl-projection.ts`):
      which ports are awaitable, occupied-port exclusion, `promptFrom` resolution,
      status gating. Isolated from bridge/network.
- [x] **Integration Testing:** WS bridge round-trip in `tests/integration/ws/`
      extending `execute-hitl-inputs.ws.test.ts` — start run → assert `runner.snapshot`
      carries `status: 'running'` + `runId` → UI-intent `runner.hitl.event` → server
      `pushIntoInput` → `runner.input-received` for the port → run proceeds. Cover
      reject path (out-of-scope port → `false`).
- [ ] **E2E / Smoke Testing:** n/a (no browser E2E harness in repo).
- [x] **Manual Verification:** click-through of `common-hitl-review-gate` in the
      editor feed (below).

### B. Manual Verification Script

#### Test Case 1: HITL control appears (triggered by wired input) and submits

- **Prerequisites:** `langflower start` (port 4010) running; load a workflow with
  a HITL node whose **non-HITL** input is wired from upstream (e.g.
  `llmHitlOnceWorkflow` / `simpleHitlPreviewWorkflow`); editor sidebar visible.
- **Step-by-Step Actions:**
    1. Click **Run** in the topbar.
    2. Confirm the HITL node's canvas body shows **only** its data input port (the
       HITL action ports have **no** dot and cannot be wired).
    3. Wait until the upstream value arrives into the non-HITL input — the run
       pauses and the work-log timeline shows the node group.
    4. In the **bottom composer** (the chat input surface, below the timeline),
       confirm the HITL controls render as a continuation of the conversation:
       **all** Review Gate action controls (Approve + Request changes textarea)
       together, with the `promptFrom` context above. The timeline above is not
       overridden.
    5. Act on one control (type + Send, or click an action button).
- **Expected Inputs / Payloads:** text in textarea; click submit (or click a
  button).
- **Expected Output / Observable Result:** that control shows submitted value
  (siblings remain for multi-input nodes); run continues; downstream node receives
  the reply; on run end (`runner.snapshot` leaves `'running'`) controls stop
  rendering.

#### Test Case 2: Reconnect mid-HITL preserves control state

- **Prerequisites:** Run paused on HITL (Test Case 1 step 2–3 state).
- **Step-by-Step Actions:**
    1. Refresh the editor tab (or open a second tab).
    2. Observe the work-log after `session.state.snapshot` + `executionFeed` replay.
- **Expected Output / Observable Result:** HITL control re-renders live (gate
  still `'running'` per `runner.snapshot`), no blank canvas, previously streamed
  outputs preserved.

#### Test Case 3: Rejected / out-of-scope reply

- **Prerequisites:** Run ended (gate not `'running'`) or port occupied.
- **Step-by-Step Actions:** attempt to submit a HITL control after the run left
  the node.
- **Expected Output / Observable Result:** inline error; control remains enabled
  but no downstream advance (server returned `false`).

### C. Functional Requirements Checklist

- [ ] Reuse existing `runner.snapshot` (`status: RuntimeRunnerStatus`) as the
      run-active gate — **no new `runner.status`/`idle` event**. Centralize the
      `isRunning` derivation (currently local to `run-button.component.ts`) into
      `WorkflowExecutionService` so the work-log reads the same signal.
- [ ] **HITL trigger:** `hitlTriggered(nodeId)` becomes true when a **non-HITL**
      input on the HITL node receives a wired value (`runner.input-received` on a port
      _without_ `config.hitl`), and becomes false when the user submits any HITL
      control (optimistic) or when a HITL-port `input-received` confirms the reply —
      **per node**. The **composer** renders controls from `hitlTriggeredNodeIds()`
      (not gated on `isRunning`); the work-log **timeline** is never overridden by
      HITL controls.
- [ ] `WorkflowExecutionService` exposes a `hitlControls(nodeId)` projection
      sourced from node `inputsConfigs[].config.hitl` + `NodePreviewValuesService`.
- [ ] **Multiple HITL inputs** on one node all render together (one control per
      `config.hitl` port) so the user chooses the feedback type; each is independently
      submittable.
- [ ] **HITL ports are invisible & unwireable:** inputs carrying `config.hitl` are
      excluded from `resolveNodePorts` (no canvas port dot / handle) and cannot accept
      wires; they exist only as feed controls. (No server change — `pushIntoInput`
      already rejects edge-occupied ports.)
- [ ] `promptFrom` output value is shown as control context, drawn from existing
      feed/preview values (no new protocol for prompt text).
- [ ] Submitting a control emits `runner.hitl.event` with the active `runId`
      (from `runner.snapshot`); server routes it through `pushIntoInput` unchanged.
- [ ] On `runner.input-received` for the port, the control shows the submitted
      value and becomes non-interactive for that port (siblings stay live on
      multi-input nodes).
- [ ] Reconcile with graph-lock: canvas lock still uses `status === 'running'`;
      composer awaiting is the per-node fold (hard-reset on Stop / done / new
      `runId`). No UI-side idle state.
- [ ] No new third-party dependencies; no `index.ts`; Tailwind + native controls
      only; signals/computed only (no UI-side domain caches).
- [ ] Unit tests for HITL projection (trigger detection, multi-input, port
      exclusion); integration WS test extended for the
      snapshot→wired-input→hitl→input-received round-trip and reject path.
