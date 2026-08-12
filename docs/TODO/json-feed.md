# Specification: JSON collapsed preview in work log feed

**Status:** queued  
**Index:** [README.md](README.md)

## 1. Executive Summary & Intent

- **Problem Statement:** Collapsed feed rows for technical (`data`) and tool/shell presentations show port labels only today; when users expand or when reasoning-style last-line preview applies to JSON values, `formatPortValue` pretty-prints multiline JSON — so a collapsed "last line" preview would show `}` instead of meaningful content. JSON object/array outputs need a sensible collapsed summary.
- **User Prompt Source:** `for now feed log show last line of output while details are not expanded — for json it become '}' — should strip line breaks for json or show 'JSON' placeholder`
- **External Context:** Feed presentation taxonomy in [Epic 37](../DONE/EPICS/37-deterministic-feed-fold.md) (reasoning last-line contract); formatter at [`format-port-value.ts`](../../packages/ui/src/app/features/sidebar/format-port-value.ts).

## 2. Codebase Guardrails & Local Alignment

- **Designated Base Folder:** `packages/ui/src/app/features/sidebar/`
- **Target Directories:**
  - `packages/ui/src/app/features/sidebar/format-port-value.ts` — new preview helper
  - `packages/ui/src/app/features/sidebar/components/lf-work-log-panel.component.ts` — summary binding
  - `packages/ui/src/app/features/sidebar/tests/format-port-value.test.ts` — unit tests
- **Architectural Patterns & Boilerplates Enforced:**
  - Keep `formatPortValue` for **expanded** body text (pretty JSON unchanged).
  - Add separate `formatFeedCollapsedPreview(value)` for `<summary>` lines only.
  - Pure functions — no bridge or fold changes for v1.
- **Pattern & Boilerplate Reference Baseline:**
  - [`format-port-value.ts`](../../packages/ui/src/app/features/sidebar/format-port-value.ts): `JSON.stringify(value, null, 2)` for objects — do not change for expanded view.
  - [`lf-work-log-panel.component.ts`](../../packages/ui/src/app/features/sidebar/components/lf-work-log-panel.component.ts): `@default` template uses `port.portId` in summary for `data` — switch to preview helper; reasoning branch already uses truncated `itemText`.
  - [`fold-port-stream.ts`](../../packages/ui/src/app/features/feed-folding/operators/fold-port-stream.ts): streaming merge uses full `formatPortValue` — leave unchanged.
- **Third-Party Dependencies & Packages:** None.
- **Frontend Presentation Strategy (If UI Affected):**
  - **Component Library Standards:** Existing `<details>/<summary>` pattern in work log.
  - **Styling & CSS Architecture Guardrails:** `truncate` on summary; `.lf-text-caption--muted`.
- **Shared Utilities & Hooks:** `formatPortValue` remains canonical for inspector + expanded feed body.
- **Internationalization (i18n) Mechanics:** Placeholder string `"JSON"` (English).
- **Environment Configuration (ENV):** None.

## 3. Deep System Mechanics & System Analysis

### A. Blast Radius & Impact Assessment

- **Affected Modules / Components:** Feed collapsed summaries only — not WS protocol, not fold logic, not inspector expanded view (unless inspector reuses preview helper later).
- **Affected Files Inventory:**
  - **New Files:** None (extend format-port-value module).
  - **Changed Files:**
    - `format-port-value.ts`: Export `formatFeedCollapsedPreview(value: unknown): string`.
    - `format-port-value.test.ts`: Cases for JSON object/array → `"JSON"`; multiline string → last non-empty line; primitives → stringified.
    - `lf-work-log-panel.component.ts`: Use preview in `@default`/`data`/tool/shell summaries where last-line preview desired.
  - **Deleted Files:** None.
- **Backward Compatibility Plan:** Expanded `<pre>` body unchanged — only collapsed label changes.

### B. API, Data Contracts & DAL Strategy

- **Authoritative Source of Truth:** UI formatter functions — no shared protocol types.
- **Data Access Layer (DAL) Pattern:** N/A.
- **Endpoints & Routes Impacted:** None.
- **Data Contracts (Schemas & Type Specs):**
  ```typescript
  // formatFeedCollapsedPreview rules (v1):
  // - null/undefined → String(value)
  // - string → last non-empty line (trimmed), or full string if single line
  // - plain object or array (not Error, not combine-error tuple) → 'JSON'
  // - number/boolean → String(value)
  // - Error → message first line
  ```
- **Wrapper Strategy:** New function alongside existing; `itemText()` may call preview for summaries, `formatPortValue` for bodies.
- **Reverse Compatibility Risk Matrix:** None.

### C. Security, Identity & Compliance

- **Authentication & Authorization:** N/A.
- **Data Privacy & Multi-Tenancy:** Preview avoids dumping large JSON in summary — minor UX win for sensitive payloads still in expanded body.

### D. Dataflow Architecture & Evolution

- **State Lifecycle & Pipeline:** Fold produces `NodeFeedItem.value` → template chooses preview vs full formatter per expand state.
- **State Authority:** Feed fold value unchanged.
- **Schema Evolution & Migration:** None.

### E. Validations & Boundary Conditions

- **Input Validation Schemas:** Detect JSON via `typeof === 'object' && !== null && !Array.isArray` OR `Array.isArray` — exclude `Date`, `Error`, combine-error tuples (mirror `formatPortValue` guards).
- **Zero / Empty States:** Empty string → empty summary or `(empty)` — pick one, test.
- **Extreme Constraints:** Very long single-line strings — truncate summary with CSS `truncate` (existing).

### F. Concurrency & State Collisions

- **Race Condition Mitigation:** N/A — pure formatters.

### G. Error Handling & Resiliency

- **Expected Failure Modes:** Circular JSON — `formatPortValue` try/catch; preview returns `'JSON'` for object types without stringify.
- **Graceful Degradation:** Fallback to `String(value)`.
- **Telemetry, Logging & Observability:** None.

## 4. Verification & Definition of Done (DoD)

### A. Testing Strategy Matrix

- [X] **Unit Testing:** `formatFeedCollapsedPreview` all branches.
- [ ] **Integration Testing:** Optional component test for summary text.
- [ ] **E2E / Smoke Testing:** Not required.
- [X] **Manual Verification:** Run workflow emitting JSON object port; collapsed row shows `JSON`, expanded shows pretty-print.

### B. Manual Verification Script

#### Test Case 1: JSON object collapsed preview

- **Prerequisites:** Node outputting `{ "foo": 1, "bar": 2 }` to feed.
- **Step-by-Step Actions:**
  1. Run workflow.
  2. Observe collapsed feed row before expanding.
  3. Expand details.
- **Expected Output / Observable Result:** Summary shows `JSON` (not `}`); expanded body pretty-printed multiline JSON.

#### Test Case 2: Multiline string last-line preview

- **Prerequisites:** Port emits `"line1\nline2\nline3"`.
- **Expected Output / Observable Result:** Collapsed summary shows `line3` (last non-empty line).

### C. Functional Requirements Checklist

- [ ] `formatFeedCollapsedPreview` exported with documented rules.
- [ ] JSON objects/arrays show `JSON` placeholder in collapsed summary.
- [ ] Multiline strings show last non-empty line in collapsed summary.
- [ ] Expanded feed body still uses pretty `formatPortValue`.
- [ ] Work log `@default`/`data` rows use preview in summary (optionally prefix with portId: `index: 2` or `index — JSON`).
- [ ] Unit tests cover JSON, string, primitive, Error cases.
- [ ] **`npm run test`** at close-out.

### Verify

- Intermediate (optional): `verify --quick`.
- **Close-out (required):** `npm run test` or full `verify`.
