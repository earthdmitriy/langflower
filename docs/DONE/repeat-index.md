# Specification: Repeat node index output in feed

**Status:** done  
**Index:** [README.md](README.md)

## 1. Executive Summary & Intent

- **Problem Statement:** The `common-repeat` node emits `value` and `done` but hides the iteration index internally. Users running paced repeat loops cannot see progress (e.g. "iteration 2 of 5") in the work log feed, making long repeats hard to monitor.
- **User Prompt Source:** `repeat node - add 'index' output shown in feed — reason - track progress`
- **External Context:** None.

## 2. Codebase Guardrails & Local Alignment

- **Designated Base Folder:** `packages/common-nodes/src/flow/repeat/`
- **Target Directories:**
    - `packages/common-nodes/src/flow/repeat/` — node bind + tests
    - `packages/ui/src/app/features/feed-folding/` — verify feed classification only (likely no change)
    - `docs/features/node-library.md`, `docs/STATUS.md` — product truth
- **Architectural Patterns & Boilerplates Enforced:**
    - Lockstep multi-output paced session: one `session$` of tagged events, demux to outputs ([`packages/common-nodes/AGENTS.md`](../../packages/common-nodes/AGENTS.md) § Multi-output paced sessions).
    - Reference implementation: existing `value` / `done` demux in `repeat/node.ts`.
    - Feed: unmarked outputs → `presentation: 'data'` collapsed row labeled by `portId` ([`fold-port-events.ts`](../../packages/ui/src/app/features/feed-folding/fold-port-events.ts)).
- **Pattern & Boilerplate Reference Baseline:**
    - [`packages/common-nodes/src/flow/repeat/node.ts`](../../packages/common-nodes/src/flow/repeat/node.ts) lines 43–72: paced `session$` with `map((_, index) => …)` — extend to export index.
    - [`packages/common-nodes/src/flow/repeat/node.test.ts`](../../packages/common-nodes/src/flow/repeat/node.test.ts): pacing and reset tests — extend for index sequence.
    - [`packages/node-sdk/src/node-factory/define-reactive-node/port-meta.ts`](../../packages/node-sdk/src/node-factory/define-reactive-node/port-meta.ts): `FeedPortMeta` for optional `feed.role`.
- **Third-Party Dependencies & Packages:** None.
- **Frontend Presentation Strategy (If UI Affected):**
    - **Component Library Standards:** Default feed rendering via `lf-work-log-panel` `@default` template — no new component for v1.
    - **Styling & CSS Architecture Guardrails:** Existing muted `<details>` row for `data` presentation.
- **Shared Utilities & Hooks:** `formatPortValue`, `foldPortEventsToNodeFeed`, `ExecutionFeedService`.
- **Internationalization (i18n) Mechanics:** Port label `index` is English identifier (not user-facing copy).
- **Environment Configuration (ENV):** None.

## 3. Deep System Mechanics & System Analysis

### A. Blast Radius & Impact Assessment

- **Affected Modules / Components:** `common-repeat` node outputs, runtime port emission, feed fold (pass-through), work log display.
- **Affected Files Inventory:**
    - **New Files:** None.
    - **Changed Files:**
        - `packages/common-nodes/src/flow/repeat/node.ts`: Extend session events to `{ kind: 'value', value, index }`; add `index` output port (`wireType: 'number'`); consider `feed: { role: 'none' }` on `done` to avoid spurious `done: true` rows.
        - `packages/common-nodes/src/flow/repeat/node.test.ts`: Assert index emits 0..n-1 (or 1..n — pick one, document) in sync with value slots.
        - `docs/features/node-library.md`, `docs/STATUS.md`: Document new output port.
    - **Deleted Files:** None.
- **Backward Compatibility Plan:** Additive output port — existing graphs unaffected. New port appears in palette for re-wiring; unwired index still emits to feed for progress visibility.

### B. API, Data Contracts & DAL Strategy

- **Authoritative Source of Truth:** Node definition in `repeat/node.ts`; runtime `runner.output-emitted` frames ([`RuntimeRunnerEvent`](../../packages/runtime/src/types.ts)).
- **Data Access Layer (DAL) Pattern:** N/A.
- **Endpoints & Routes Impacted:** None — runtime emits new `portId: 'index'` frames automatically.
- **Data Contracts (Schemas & Type Specs):**
    - New output port: `{ portId: 'index', wireType: 'number' }`
    - Index semantics: **0-based** iteration counter matching internal `map((_, index) => …)` when `kind === 'value'`; no emit on `done` slot.
    - Optional: `feed: { role: 'none' }` on `done` output meta.
- **Wrapper Strategy:** Reuse existing `configureOutput` demux pattern from `valueOut$` / `doneOut$`.
- **Reverse Compatibility Risk Matrix:** None for WS protocol. Saved workflows without index wiring still receive index events in feed.

### C. Security, Identity & Compliance

- **Authentication & Authorization:** N/A.
- **Data Privacy & Multi-Tenancy:** N/A.

### D. Dataflow Architecture & Evolution

- **State Lifecycle & Pipeline:**
    1. `combineInputs([value, count])` → paced `trigger` slots.
    2. Session emits value slots with index; final slot emits done.
    3. Runtime broadcasts `runner.output-emitted` per port.
    4. Feed fold classifies `index` as `data`; work log shows collapsed row labeled `index`.
- **State Authority:** Repeat node session `$` — index derived synchronously with value emit.
- **Schema Evolution & Migration:** None.

### E. Validations & Boundary Conditions

- **Input Validation Schemas:** `count` already floored via `Math.max(0, Math.floor(…))`; `n <= 0` → immediate done, no index emits.
- **Zero / Empty States:** count=0 or invalid → only `done`, no index.
- **Extreme Constraints:** Large count values — index is O(1) number per slot; no accumulation.

### F. Concurrency & State Collisions

- **Race Condition Mitigation:** Index lockstep with value on same paced scheduler (`observeOn(asapScheduler)`) — existing guarantee.

### G. Error Handling & Resiliency

- **Expected Failure Modes:** None beyond existing repeat node errors.
- **Graceful Degradation:** N/A.
- **Telemetry, Logging & Observability:** No new logging.

## 4. Verification & Definition of Done (DoD)

### A. Testing Strategy Matrix

- [x] **Unit Testing:** Repeat node index sequence, sync with value emits, reset on value/count change.
- [x] **Integration Testing:** Optional — feed fixture asserts `portId: 'index'` appears in folded feed for repeat node run.
- [ ] **E2E / Smoke Testing:** Not required for v1.
- [x] **Manual Verification:** Run demo workflow with Repeat count>1; confirm feed shows `index` rows incrementing.

### B. Manual Verification Script

#### Test Case 1: Index tracks repeat progress

- **Prerequisites:** Workflow: trigger → Repeat (count=3) → any sink; open work log.
- **Step-by-Step Actions:**
    1. Pulse trigger three times (plus initial ASAP value).
    2. Expand collapsed `index` rows in feed.
- **Expected Output / Observable Result:** Index values 0, 1, 2 (0-based) aligned with each value emit; `done` hidden or muted if `feed.role: 'none'`.

### C. Functional Requirements Checklist

- [x] `common-repeat` exposes `index` number output port.
- [x] Index emits once per value slot, 0-based, lockstep with `value`.
- [x] No index emit on terminal `done` slot.
- [x] Feed displays `index` as collapsed technical row (default `data` presentation).
- [x] `done` output marked `feed: { role: 'none' }` to avoid noise (recommended).
- [x] Node unit tests updated; docs/STATUS synced.
- [x] **`npm run test`** passes at close-out.

### Verify

- Intermediate (optional): `verify --quick` after node unit tests.
- **Close-out (required):** `npm run test` or full `verify` — unit and integration.
