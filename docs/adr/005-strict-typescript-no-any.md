---
kind: adr
owner: docs
covers: []
status: current
id: ADR-005
supersedes: []
superseded-by: []
package: docs
---

## ADR-005 — Strict TypeScript, no `any`

**Status:** accepted · **Date:** 2026-06-16

**Context:** Stage 2 execution will wire untyped user node code at boundaries; we need
clear internal types before adding that surface.

**Alternatives considered:**

- **Gradual strictness** — faster scaffolding, defects found at runtime instead of
  in editor.
- **`any` at integration boundaries only** — convenient for ngDiagram/third-party
  gaps, tends to spread inward.

**Decision:** `strict: true` repo-wide; ESLint forbids `any`; boundaries use
`unknown` + guards.

**Tradeoffs accepted:**

- (+) Refactors and API changes fail fast in CI.
- (−) More upfront typing work on stubs and third-party adapters.
- (−) UI needs tsconfig override for Angular composite (ADR-009) — strictness kept,
  project-reference model split.

**Consequences:**

- No `@ts-ignore` without tracked removal plan.

---
