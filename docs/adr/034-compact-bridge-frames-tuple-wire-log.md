---
kind: adr
owner: docs
covers: []
status: current
id: ADR-034
supersedes: []
superseded-by: []
package: docs
---

## ADR-034 — Compact bridge frames (tuple wire + log)

**Status:** accepted · **Date:** 2026-08-12

**Context:** High-frequency `runner.output-emitted` / `runner.input-emitted` object
frames repeated keys (`kind`, `runId`, `nodeId`, …) on every tick. NDJSON diagnostic
logs wrapped the same payload again with `schemaVersion`, `kind: 'frame'`, and
direction metadata — doubling noise on streaming runs.

**Alternatives considered:**

- **Keep object envelopes, compress with gzip** — smaller on wire but still verbose
  in memory/logs; does not unify WS and log shape.
- **Separate compact wire DTO + domain objects + accessor module** — rejected per
  [PRINCIPLES § No adapters](../architecture/PRINCIPLES.md#no-adapters-no-glue-code); tuple types
  in `@langflower/runtime` are the source shape.

**Decision:**

- **`PortTelemetry`** fixed 7-slot tuple:
  `['in'|'out', nodeId, portId, response, portIdx, edgeIds, feed]`
  where `response` is `@rx-evo` `ResponseDto` (`{ value } | { pending: true } |
{ inactive: true } | { error }`). `feed` is `RuntimeFeedPortMeta | null` —
  never `undefined`; JSON tuples use `null` for absent slots.
  Classify with `'pending' in event[3]`, `'value' in event[3]`, etc. — do not
  invent a parallel string tag.
- **`BridgeFrame`** wire/log line: `[ts, transportDir, busType, payload]` — identical
  JSON bytes on WebSocket and NDJSON (no log-only sanitization).
- Bus consolidates to **`runner.port`** (direction at `payload[0]`); **`runner.done`**
  uses `['done'] | ['done', runId]`.
- Hard cutover — no rollback flag or dual codec.

**Tradeoffs accepted:**

- (+) Smaller frames; one schema for WS + logs; no glue accessor layer.
- (−) Positional tuples are less self-describing in DevTools (named TS labels help).
- (−) Historical v1 NDJSON on disk is not migrated (read-only).

**Consequences:**

- `@langflower/runtime/types.ts`, `@langflower/websocket-bridge` codec, all
  `runner.port` consumers (UI folds, MCP, integration tests).
- Diagnostic log lines are raw `BridgeFrame` tuples only.

---
