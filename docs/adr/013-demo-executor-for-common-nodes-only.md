---
kind: adr
owner: docs
covers: []
status: superseded
id: ADR-013
supersedes: [ADR-010]
superseded-by: []
package: docs
---

## ADR-013 — Demo executor for common nodes only

**Status:** superseded · **Date:** 2026-06-16 · **Supersedes:** part of ADR-010 ·
**Superseded by:** `@langflower/runtime` + common-nodes catalog execution
([EXECUTION_ARCHITECTURE.md](../architecture/EXECUTION_ARCHITECTURE.md))

**Context:** Stage 1 defers full sandboxed execution (ADR-010), but the runnable demo
requires **Run** on built-in common nodes. A narrow in-process executor unblocked the
demo without esbuild import of user bundles at runtime.

**Alternatives considered:**

- **Defer Run until Stage 2** — demo Definition of Done cannot be met.
- **Full sandbox now** — too large for demo milestone; conflicts with ADR-010 timeline.
- **eval / dynamic import of user nodes** — rejected on security and complexity grounds.

**Decision (historical):** in-process executor for registered common nodes only;
user/custom node types rejected.

**Tradeoffs accepted:**

- (+) Demo milestone without Stage 2 sandbox.
- (+) Same port/input model as later runtime.
- (−) Not a security boundary for user nodes.
- (−) Partial ADR-010 exception.

**Consequences:**

- Historical path names under `workflow-executor` may differ; current entry is the
  runtime session / bridge. User-node sandbox still deferred ([STATUS.md](../product/STATUS.md)).
- Load-path split for built-in vs custom: [ADR-020](./020-built-in-vs-custom-node-loading.md).

---
