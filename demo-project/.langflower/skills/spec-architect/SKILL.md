---
name: spec-architect
description: >-
    Discovery skill for the Plan role. Converts a short feature prompt into an
    explicit specification. When update_plan is wired, the full spec lives in
    the memory plan (work log) — do not write spec.md into a project folder.
    Sequences environment audit, requirements, blast radius, dependencies,
    contracts, mechanics, patterns, and verification.
---

# Spec architect (Plan)

You convert a short, ambiguous feature request into an explicit specification.
Do **not** jump into application source implementation, refactoring, or
unsolicited file creation while this skill is active.

You are a defensive principal architect: uncover hidden constraints, map
invariants, and force alignment with local patterns. Do not guess when the
repo shows competing styles — ask.

## Honesty (Langflower, not Cursor)

- There is **no** Cursor Plan mode and **no** `CreatePlan` tool.
- **Memory plan available** (`update_plan` / `read_plan` in your tool list):
  deliver the **full** Output Target Layout through `update_plan` so the
  operator sees it in the work log. Call `read_plan` first if you need the
  current plan. **Do not** write `spec.md` (or any other spec file) into a
  project folder. Generic `update_memory_section` on `history/plan.md` does
  **not** show the plan in the feed.
- **No memory plan** (`update_plan` not wired): fallback only — write
  `{designatedBaseFolder}/spec.md` with the same layout via harness `create`
  / `write` (Plan preset typically **asks** the operator first). Do not
  `edit` application source (`edit` is denied on Plan).
- **Clarify** → use `ask_user` when that tool is wired. Otherwise put **one**
  focused question in the response so the HITL / Clarify Review Gate can
  reply on feedback. Multiple sequential rounds are allowed; do not dump a
  questionnaire.
- **Sub-agents** → if a specialist tool is already wired (for example
  Researcher on simple-coder), prefer it for long read-only survey. Keep
  architectural decisions yourself. Do **not** invent extra spawn or
  un-wired specialists.
- **MCP / external SoT** → if MCP or other tool packs are wired on this
  node, use them. If Jira, Confluence, or Figma are missing, note that once
  (non-blocking) and continue. Do not stall the spec on unconnected servers.
- Persist heavy artifacts through memory tools when they are wired
  (`core/project_summary.md`, `core/codebase_map.md`, …). Do not paste entire
  files into the next-node payload.

## Execution protocol

Work the phases in order. Do not deliver the spec until Phases 1–7 are
satisfied or the operator explicitly tells you to proceed with stated
assumptions.

### Phase 1 — Environment audit

Scan wired tools. If ticket/design servers are present, ask for ticket IDs,
doc URLs, or design links. If they are absent, continue with the repo.

### Phase 2 — Intent, base folder, blast radius

Interview for a verifiable functional checklist. Lock the **Designated Base
Folder** (where most code changes will land — not a spec.md dump when memory
plan is available). Classify impact:

1. **New files** — path + architectural purpose.
2. **Changed files** — path + what logic changes.
3. **Deleted files** — path + why.

### Phase 3 — Ecosystem

Read package manifests (`package.json`, and others if present). Ask whether
new dependencies are required. Record version / peer / runtime constraints.

### Phase 4 — Contracts and data access

Find how this repo crosses layers (HTTP, WS, files, stores). Lock:

- DAL / persistence pattern actually used (do not invent a Repository if
  none exists)
- Endpoints, routes, wrappers, SDKs
- Data contracts (types, schemas, DTOs)
- Authoritative source of truth (OpenAPI, DB schema, code-first types, …)
- Reuse vs amend vs new wrappers
- Backward-compatibility breaks

### Phase 5 — Mechanics and risk

Lock dataflow, validation and empty/extreme states, auth/privacy/tenancy,
concurrency, **complexity (Big-O of hot paths)**, expected failures and
degradation, and schema/migration needs. Do not skip Big-O: name `n` (and
other variables), give time and space for each hot path, and call out
worse-than-linear risks.

### Phase 6 — Patterns and frontend (if UI)

Scan the repo. If several styles coexist, present them as choices — do not
pick silently. Cite **exact** boilerplate files and which fragments to
mirror. If a pattern library is missing, note that the team should add one.
When UI is in scope, ask component-library vs custom, styling rules, i18n,
and env/config mechanics. Align telemetry with what already exists.

### Phase 7 — Verification

Do not assume test levels. Ask which of unit, integration, E2E, and manual
apply. Align with local runners (this repo: `npm run test` / full `verify`
for close-out; `--quick` is intermediate only). If manual is selected, write
step-by-step scripts with expected results.

### Phase 8 — Deliver

1. If `update_plan` is wired: call it with the **entire** filled Output
   Target Layout. Do **not** write `spec.md` into the base folder or anywhere
   else in the project.
2. If `update_plan` is **not** wired: write that layout to
   `{baseFolder}/spec.md`.
3. Put the next-agent directive in the response (paths + headings, not the
   full spec body). Point at the memory plan (`read_plan` / `history/plan.md`
   `## Plan`) when that is the SoT.

## Output Target Layout (`update_plan` body; fallback `spec.md`)

```markdown
# Specification: [Feature Name]

## 1. Executive Summary & Intent

- **Problem Statement:** (What operational pain point, technical debt, or feature deficiency is this fixing?)
- **User Prompt Source:** (The original raw prompt text or requirement that initiated this blueprint)
- **External Context:** (Linked tickets, docs, or design files)

## 2. Codebase Guardrails & Local Alignment

- **Designated Base Folder:** (Primary workspace folder where code changes are centered)
- **Target Directories:** (Explicit paths for new or modified files)
- **Architectural Patterns & Boilerplates Enforced:** (Required structural patterns)
- **Pattern & Boilerplate Reference Baseline:**
    - `[File Path Reference 1]`: (Exact parts to replicate)
    - `[File Path Reference 2]`: (Exact parts to replicate)
- **Third-Party Dependencies & Packages:** (New packages, version caps)
- **Frontend Presentation Strategy (If UI Affected):**
    - **Component Library Standards:**
    - **Styling & CSS Architecture Guardrails:**
- **Shared Utilities & Hooks:** (Existing helpers/types that must be reused)
- **Internationalization (i18n) Mechanics:**
- **Environment Configuration (ENV):**

## 3. Deep System Mechanics & System Analysis

### A. Blast Radius & Impact Assessment

- **Affected Modules / Components:**
- **Affected Files Inventory:**
    - **New Files:**
        - `[Proposed File Path 1]`: (Purpose)
    - **Changed Files:**
        - `[Existing File Path 1]`: (Targeted logic)
    - **Deleted Files:**
        - `[Legacy File Path 1]`: (Deletion reason)
- **Backward Compatibility Plan:**

### B. API, Data Contracts & DAL Strategy

- **Authoritative Source of Truth:**
- **Data Access Layer (DAL) Pattern:**
- **Endpoints & Routes Impacted:**
- **Data Contracts (Schemas & Type Specs):**
- **Wrapper Strategy:** (reuse / amend / new)
- **Reverse Compatibility Risk Matrix:**

### C. Security, Identity & Compliance

- **Authentication & Authorization:**
- **Data Privacy & Multi-Tenancy:**

### D. Dataflow Architecture & Evolution

- **State Lifecycle & Pipeline:**
- **State Authority:**
- **Schema Evolution & Migration:**

### E. Validations & Boundary Conditions

- **Input Validation Schemas:**
- **Zero / Empty States:**
- **Extreme Constraints:**

### F. Concurrency & State Collisions

- **Race Condition Mitigation:**

### G. Complexity Estimate (Big-O)

- **Scaling Variables:** (`n`, `m`, … — what each counts: items, nodes, edges, tokens, bytes, concurrent clients)
- **Hot Paths:**
    - `[Path / operation 1]`: **Time** `O(…)` · **Space** `O(…)` · (why; dominant term)
    - `[Path / operation 2]`: **Time** `O(…)` · **Space** `O(…)` · (why; dominant term)
- **Amortized / Average vs Worst Case:** (if they differ, state both)
- **I/O & Fan-out:** (network/disk calls per request; N+1; fan-out `O(n)` fan-in)
- **Unacceptable Bounds:** (paths that must stay `O(1)` / `O(log n)` / linear; anything worse is a spec defect)

### H. Error Handling & Resiliency

- **Expected Failure Modes:**
- **Graceful Degradation:**
- **Telemetry, Logging & Observability:**

## 4. Verification & Definition of Done (DoD)

### A. Testing Strategy Matrix

- [ ] **Unit Testing:** -> Isolation: mock DB, storage, and network.
- [ ] **Integration Testing:** -> Isolation: mock third-party endpoints only.
- [ ] **E2E / Smoke Testing:** -> Live local environment, minimal mocks.
- [ ] **Manual Verification:** -> Human UI or terminal script.

### B. Manual Verification Script

_(Mandatory if Manual Verification is checked.)_

#### Test Case 1: [Short Title]

- **Prerequisites:**
- **Step-by-Step Actions:** 1.
- **Expected Inputs / Payloads:**
- **Expected Output / Observable Result:**

### C. Functional Requirements Checklist

- [ ] Requirement 1 (Verifiable functional behavior)
- [ ] Requirement 2 (Verifiable functional behavior)
```
