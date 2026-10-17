---
kind: adr
owner: docs
covers: []
status: current
id: ADR-001
supersedes: []
superseded-by: []
package: docs
---

## ADR-001 — npm workspaces monorepo

**Status:** accepted · **Date:** 2026-06-16

**Context:** Stage 1 ships CLI, server, UI, and shared types as one product with a
fixed build order.

**Alternatives considered:**

- **Separate repos per package** — simpler CI per artifact, but cross-package refactors
  and atomic Stage 1 delivery become painful.
- **Single package (no workspaces)** — fewer `package.json` files, but blurs CLI vs
  server vs UI boundaries and couples Angular build to Node publish.

**Decision:** Single repository with npm workspaces: `shared → server → ui → cli`.

**Tradeoffs accepted:**

- (+) One clone, one PR, shared types always in sync.
- (−) Build pipeline must enforce order; cannot publish UI alone as npm lib without
  extra packaging work.
- (−) Heavier root tooling (ESLint/Prettier span all packages).

**Consequences:**

- `@langflower/shared` compiled first; the **root** `langflower` package is the
  only publishable npm product (`bin` + bundled `dist/` + host-peer `vendor/`);
  `@langflower/cli` is a private workspace package (see [RELEASE.md](../guides/RELEASE.md)).
- `build/build-all.mjs` encodes dependency order.

---
