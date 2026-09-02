# Specification: Wiring helper — compatible ports and run lock UI

**Status:** queued  
**Index:** [README.md](README.md)  
**Related:** [edge-highlight.md](edge-highlight.md) (shared compatible-port implementation — implement once, satisfy both epics)

## 1. Executive Summary & Intent

- **Problem Statement:** Two wiring UX gaps: (1) users dragging wires cannot see type-compatible ports; (2) while a workflow run is active, the UI still allows edge draw — the server silently rejects (`isGraphLocked()`), so the wire vanishes with no feedback. Server-side graph lock exists; UI must prevent or explain blocked wiring.
- **User Prompt Source:** `when user drag wire highlight compatible ports + deny wiring in UI while running`
- **External Context:** Server graph lock in [`apply-editor-mutation.ts`](../../packages/server/src/workflow/apply-editor-mutation.ts); UI run gate via [`execution-run-gate-fold.ts`](../../packages/ui/src/app/services/execution-run-gate-fold.ts).

## 2. Codebase Guardrails & Local Alignment

- **Designated Base Folder:** `packages/ui/src/app/features/canvas/`
- **Target Directories:**
    - `packages/ui/src/app/features/canvas/` — draw gating + highlight (shared with edge-highlight epic)
    - `packages/ui/src/app/services/workflow-execution.service.ts` — `isRunning` signal
    - `docs/REACTIVE_NODES.md` § HITL and graph lock — doc sync
- **Architectural Patterns & Boilerplates Enforced:**
    - UI reads runner state from bridge folds — `WorkflowExecutionService.isRunning`, not local caches.
    - Graph lock authoritative on server — UI gate is UX layer, not security boundary.
    - Compatible-port highlight: same draw-highlight inject + port attributes as [edge-highlight.md](edge-highlight.md) — **do not duplicate**.
- **Pattern & Boilerplate Reference Baseline:**
    - [`execution-run-gate-fold.ts`](../../packages/ui/src/app/services/execution-run-gate-fold.ts): `createIsRunning$` fold.
    - [`workflow-execution.service.ts`](../../packages/ui/src/app/services/workflow-execution.service.ts): `isRunning` signal exposed to components.
    - [`lf-work-log-panel.component.ts`](../../packages/ui/src/app/features/feed/components/lf-work-log-panel.component.ts): precedent — Clear disabled when `isRunning`.
    - [`apply-editor-mutation.ts`](../../packages/server/src/workflow/apply-editor-mutation.ts) lines 604–610: `isGraphLocked()` rejects addEdge.
    - [`flow-canvas.component.ts`](../../packages/ui/src/app/features/canvas/components/flow-canvas.component.ts): ngDiagram config + edge draw handlers.
- **Third-Party Dependencies & Packages:** None.
- **Frontend Presentation Strategy (If UI Affected):**
    - **Component Library Standards:** Cursor/not-allowed on canvas when running; optional toast/tooltip — prefer subtle cursor + ngDiagram draw prevention.
    - **Styling & CSS Architecture Guardrails:** `.lf-canvas--graph-locked` overlay class on canvas host when running.
- **Shared Utilities & Hooks:** `buildDrawHighlightCss`, draw inject/unmount from [edge-highlight.md](edge-highlight.md) — skip inject when graph locked.
- **Internationalization (i18n) Mechanics:** English tooltip if shown: "Stop the run to edit wiring."
- **Environment Configuration (ENV):** None.

## 3. Deep System Mechanics & System Analysis

### A. Blast Radius & Impact Assessment

- **Affected Modules / Components:** Flow canvas, ngDiagram interaction config, workflow execution service consumers, optional canvas chrome.
- **Affected Files Inventory:**
    - **New Files:** None (draw-highlight utils live in edge-highlight epic).
    - **Changed Files:**
        - `flow-canvas.component.ts`: Gate edge draw when `execution.isRunning()`; set canvas locked class; skip `addEdge.requested` if running (defense in depth).
        - `flow-canvas.component.test.ts`: Assert no intent when running.
        - `packages/ui/docs/DIAGRAM_CANVAS.md`, `docs/features/visual-workflow-editor.md`: Document run-lock UX.
    - **Deleted Files:** None.
- **Backward Compatibility Plan:** Behavior change is intentional — users can no longer attempt doomed wire drops during runs. Server contract unchanged.

### B. API, Data Contracts & DAL Strategy

- **Authoritative Source of Truth:** `runner.snapshot.status === 'running'` via bridge; server `session.isGraphLocked()`.
- **Data Access Layer (DAL) Pattern:** N/A.
- **Endpoints & Routes Impacted:** None — still `editor.addEdge.requested` when not running.
- **Data Contracts:** Reuse existing payloads; no protocol change.
- **Wrapper Strategy:** Reuse `isRunning` signal; optionally pass `canEditTopology` computed to canvas.
- **Reverse Compatibility Risk Matrix:** None.

### C. Security, Identity & Compliance

- **Authentication & Authorization:** Server lock remains authoritative.
- **Data Privacy & Multi-Tenancy:** N/A.

### D. Dataflow Architecture & Evolution

- **State Lifecycle & Pipeline:**
    1. Runner starts → `isRunning` true → canvas enters locked mode.
    2. ngDiagram edge draw prevented or immediately cancelled (prefer prevent at draw start).
    3. Compatible-port highlight inactive while locked — do not set `draw-active` or inject `#lf-draw-highlight`.
    4. Runner done/interrupted → unlock → normal wiring + draw highlight behavior restored.
- **State Authority:** Bridge runner facts → execution fold → UI signal.
- **Schema Evolution & Migration:** None.

### E. Validations & Boundary Conditions

- **Input Validation Schemas:** N/A.
- **Zero / Empty States:** Not running → full wiring UX.
- **Extreme Constraints:** Pause vs running — graph lock applies only to `running`, not paused (verify against server `isGraphLocked` semantics).

### F. Concurrency & State Collisions

- **Race Condition Mitigation:** Reconcile feed snapshot on reconnect before enabling draw (`executionFeed.snapshot` + runner snapshot order).

### G. Error Handling & Resiliency

- **Expected Failure Modes:** Client thinks not running but server locked — defense-in-depth skip emit; optional brief inline hint if drop attempted.
- **Graceful Degradation:** If `isRunning` desynced, server still rejects — no corrupt graph.
- **Telemetry, Logging & Observability:** None.

## 4. Verification & Definition of Done (DoD)

### A. Testing Strategy Matrix

- [x] **Unit Testing:** Flow canvas does not emit `addEdge.requested` when `isRunning` true; unlock restores emit.
- [x] **Integration Testing:** WS test already covers server reject when locked — optional UI integration.
- [ ] **E2E / Smoke Testing:** Not required.
- [x] **Manual Verification:** Start run, attempt wire draw — blocked with visible feedback; stop run — wiring works.

### B. Manual Verification Script

#### Test Case 1: Wiring blocked during run

- **Prerequisites:** Simple two-node workflow.
- **Step-by-Step Actions:**
    1. Start full run.
    2. Attempt to draw edge between nodes.
    3. Stop or wait for completion.
    4. Draw edge successfully.
- **Expected Output / Observable Result:** Step 2 — no new edge, cursor/overlay indicates lock, no silent vanish. Step 4 — edge persists.

### C. Functional Requirements Checklist

- [ ] Compatible-port highlight during draw (edge-highlight inject + attributes; disabled while locked).
- [ ] Edge draw disabled or cancelled when `isRunning`.
- [ ] Canvas shows locked affordance (cursor/class) while running.
- [ ] No `editor.addEdge.requested` emitted while running.
- [ ] Wiring restored immediately when run completes or interrupts.
- [ ] Docs updated for graph-lock UX.
- [ ] **`npm run test`** at close-out.

### Verify

- Intermediate (optional): `verify --quick`.
- **Close-out (required):** `npm run test` or full `verify` — include existing `apply-editor-mutation.test.ts` / WS integration coverage.
