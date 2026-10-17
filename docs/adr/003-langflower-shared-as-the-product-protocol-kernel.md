---
kind: adr
owner: docs
covers: []
status: current
id: ADR-003
supersedes: []
superseded-by: []
package: docs
---

## ADR-003 — `@langflower/shared` as the product/protocol kernel

**Status:** accepted · **Date:** 2026-06-16 · **Updated:** 2026-07-22

**Context:** CLI, server, UI, and MCP must agree on persisted workflow/config
shapes and the internal WebSocket protocol. Runtime and node-authoring
contracts have separate package owners and must not be mirrored in shared.

**Alternatives considered:**

- **Duplicate types in server + UI** — faster early iteration, guaranteed drift.
- **OpenAPI / JSON Schema as source of truth** — useful for a public HTTP
  contract, but the co-versioned product uses a typed internal WebSocket bus.
- **Single `types` package + Zod runtime validation** — stronger runtime checks,
  but would incorrectly pull runtime/SDK ownership into one horizontal package.

**Decision:**

- `@langflower/shared` owns persisted product shapes, config helpers, internal
  WebSocket registry/payloads, and small pure cross-package helpers.
- `@langflower/runtime` owns runner, graph, port-state, and runtime event types.
- `@langflower/node-sdk` owns node-authoring and port metadata types.
- Cross-package consumers import declared concrete `package.json` exports.
  `index.ts` barrels and mirror DTOs are forbidden.

**Tradeoffs accepted:**

- (+) Single compile-time contract across all packages.
- (+) Shared stays framework- and I/O-free.
- (−) Every domain change rebuilds dependents.
- (−) Ownership must be explicit when a shape crosses product, runtime, and SDK
  boundaries.

**Consequences:**

- Import only published package paths; never another package's `src/` tree.
- Reuse runtime/SDK owner types in shared protocol definitions where the
  internal co-versioned bus intentionally exposes them (ADR-012).

---
