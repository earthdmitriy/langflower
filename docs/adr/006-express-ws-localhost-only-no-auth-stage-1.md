---
kind: adr
owner: docs
covers: []
status: current
id: ADR-006
supersedes: []
superseded-by: []
package: docs
---

## ADR-006 — Express + ws, localhost only, no auth (Stage 1)

**Status:** accepted · **Date:** 2026-06-16

**Context:** Stage 1 is a local dev tool; no multi-user or remote deployment yet.

**Alternatives considered:**

- **Fastify / Hono** — performance/lighter stack; team familiarity and middleware
  ecosystem less critical for local CRUD.
- **Separate WS server** — simpler HTTP handler, more port/process management for CLI.
- **Auth + bind 0.0.0.0** — enables LAN access; scope creep and security burden for
  Stage 1.

**Decision:** Express + `ws` on same HTTP server; bind **127.0.0.1**; no auth.
**WebSocket is the default UI transport;** REST limited to bulk workflow payloads
(see ADR-012).

**Tradeoffs accepted:**

- (+) Minimal Stage 1 complexity; single process for CLI to manage.
- (+) One port for static, WS, and bulk REST.
- (−) Must revisit binding, CORS, and auth before desktop/LAN/remote scenarios.
- (−) Express REST surface kept intentionally tiny — most handlers live on WS router.

**Consequences:**

- Document security assumptions in spec; no "just open the port" shortcuts in Stage 1.
- Implement `websocket/ws-handler.ts` as primary API gateway, not an afterthought.

---
