---
kind: adr
owner: docs
covers: []
status: superseded
id: ADR-010
supersedes: []
superseded-by: [ADR-013]
package: docs
---

## ADR-010 — Stage 1 without execution engine

**Status:** superseded · **Date:** 2026-06-16 · **Superseded by:** ADR-013 (demo
executor), then full reactive/batch runtime — see
[EXECUTION_ARCHITECTURE.md](../architecture/EXECUTION_ARCHITECTURE.md)

**Context:** Spec splits visual editor + CRUD (Stage 1) from sandboxed execution
(Stage 2); partial execution risks wrong architecture locked in early.

**Alternatives considered:**

- **Minimal "run workflow" in Stage 1** — demo value, tempts one-off eval/in-process
  execution without sandbox.
- **Defer entire server** — UI-only mock; cannot validate real node registry or FS.

**Decision (historical):** Stage 1 stubs only: execute endpoint, WebSocket runs,
`execute()` calls.

**Tradeoffs accepted:**

- (+) Editor and persistence ship without blocking on sandbox design.
- (+) Forces explicit Stage 2 ADR for execution/isolation.
- (−) No end-to-end "run chain" demo until Stage 2.
- (−) Stubs must not grow into de facto executor.

**Consequences:**

- Obsolete as product framing — do not plan with Stage labels ([PRODUCT.md](../product/PRODUCT.md)).
- Sandboxed **user-node** execution remains deferred; built-in execution is shipped.

---
