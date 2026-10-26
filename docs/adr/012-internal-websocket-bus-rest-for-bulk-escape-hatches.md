---
kind: adr
owner: docs
covers: []
status: current
id: ADR-012
supersedes: []
superseded-by: []
package: docs
---

## ADR-012 — Internal WebSocket bus; REST for bulk escape hatches

**Status:** accepted · **Date:** 2026-06-16 · **Updated:** 2026-10-19

**Context:** The backend emits many live facts (editor graph changes, palette
changes, execution telemetry, progress, errors). Polling or REST-for-everything does
not scale and duplicates connection overhead. Earlier attempts to keep separate DTO
contracts between runtime, server, and UI created adapter chains: one contract change
caused cascades through glue layers, and refactors tended to create even more
adapters.

**Alternatives considered:**

- **REST-only API** — simple, familiar; poor fit for high-volume server push and
  streaming execution events; encourages polling.
- **REST + SSE for push** — one-way push works; still two channels and no unified
  client/server event bus.
- **Stable DTO protocol separate from runtime** — cleaner public API boundary, but
  reintroduces drift and adapter maintenance for a local, co-versioned product.
- **WebSocket for every payload, regardless of size** — single pipe, but large
  payloads may still deserve HTTP/browser tooling.

**Decision:**

- UI opens **WebSocket on load** — primary transport for intents, queries,
  snapshots, and all server-initiated events.
- `packages/shared/src/langflower-bus-config.ts` is the canonical internal bus
  registry. It owns route names, payload types, and default transport (`/ws`, port
  `4010`) so client and server share one source of truth.
- Runtime APIs are allowed to define protocol payloads directly via `Parameters<>`
  / `ReturnType<>`. This is intentional compile-time coupling: runtime contract
  changes should become visible to server/UI immediately instead of being hidden
  behind stale DTO adapters.
- No RPC envelope and no per-command `requestId` in the bus registry. Clients emit
  `*.requested` intents; the server emits `*.delta`, snapshots, telemetry, and
  lifecycle facts. The UI projects the authoritative event stream.
- **REST only** as a bulk escape hatch when payload size or tooling clearly justifies
  leaving the WebSocket bus.
- Session file bytes are two bulk hatches, not WebSocket frames.
  `POST /api/session-uploads` accepts one raw body (`Content-Type`,
  `X-Langflower-File-Name`, under 50 MB) and returns `HitlUploadedFile`.
  `GET /api/session-uploads/:fileId` serves those bytes. History stores
  `fileId`, not base64.

**Tradeoffs accepted:**

- (+) Natural fit for execution logs, progress, and live registry updates.
- (+) Runtime/server/UI refactors fail fast at compile time instead of drifting
  through adapter layers.
- (+) Shared transport settings prevent client/server port/path mismatches.
- (+) RxJS-friendly: all facts arrive as Observables over one authoritative stream.
- (−) The bus is not a stable public WebSocket API; packages must be co-versioned.
- (−) Runtime method-shape changes can intentionally break UI/server compilation.
- (−) Route tables are object-merged; namespace prefixes must stay unique to avoid
  silent shadowing.

**Consequences:**

- Do not add DTO adapter layers for the bus unless the protocol becomes public or
  independently versioned; file a superseding ADR if that changes.
- Do not add REST routes for event-bus work without updating this ADR.
- `POST /api/session-uploads` and `GET /api/session-uploads/:fileId` are
  the bulk hatches for one staged chat file. Do not send those bytes on
  the WebSocket bus.
- `docs/architecture/ARCHITECTURE.md`, `spec.md` §3.1.1, and
  `packages/shared/src/langflower-bus-config.ts` describe the current bus model.
- Each partial route config owns a unique prefix (`editor.*`, `runner.*`,
  `session.*`, `palette.*`, `workflow.*`) before the final spread merge.

---
