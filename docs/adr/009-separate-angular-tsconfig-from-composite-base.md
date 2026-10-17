---
kind: adr
owner: docs
covers: []
status: current
id: ADR-009
supersedes: []
superseded-by: []
package: docs
---

## ADR-009 — Separate Angular tsconfig from composite base

**Status:** accepted · **Date:** 2026-06-16

**Context:** Node packages use TypeScript project references (`composite: true`) for
incremental builds; Angular application build does not emit declarations.

**Alternatives considered:**

- **Drop composite for entire monorepo** — simpler tsconfig, slower/inconsistent
  incremental builds for Node packages.
- **UI package not extending base tsconfig** — duplicates strict flags.

**Decision:** UI extends `tsconfig.base.json` but overrides `composite: false`,
`declaration: false`, `declarationMap: false`.

**Tradeoffs accepted:**

- (+) Node packages keep project references; UI keeps strict inherited options.
- (−) Two tsconfig "profiles" agents must know about (documented in `packages/ui/AGENTS.md`).
- (−) Accidentally removing override breaks `ng build` with TS6304.

**Consequences:**

- Verify `ng build` after any change to `tsconfig.base.json`.

---
