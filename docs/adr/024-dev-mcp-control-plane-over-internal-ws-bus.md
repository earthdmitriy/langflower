---
kind: adr
owner: docs
covers: []
status: current
id: ADR-024
supersedes: []
superseded-by: []
package: docs
---

## ADR-024 — Dev MCP control plane over internal WS bus

**Status:** accepted · **Date:** 2026-07-21

**Context:** Cursor / coding agents in this monorepo need to observe and drive a
**already running** local Langflower instance (workflows, runner, HITL,
permissions) without hand-maintaining a parallel API. The UI already speaks the
internal WebSocket bus ([ADR-012](./012-internal-websocket-bus-rest-for-bulk-escape-hatches.md)).
Outbound MCP in `@langflower/tools` is the opposite direction (workflow →
external tools) and must not be overloaded for this.

**Alternatives considered:**

- **Treat the raw WS bus as a public agent API** — rejected; ADR-012 keeps the
  bus internal and co-versioned; no stable external contract.
- **New REST control plane for agents** — rejected for MVP; duplicates bus
  intents and fights ADR-012’s “WS is default.”
- **Hand-listed MCP tools mirroring selected intents** — rejected; drifts from
  `langflowerWsConfig` on every bridge change.
- **Dev MCP stdio adapter over `createClient(langflowerWsConfig)`** — chosen:
  same client surface as UI/integration tests; tools derived from the bus
  registry via an exposure policy.

**Decision:**

- Ship `@langflower/mcp` — a **stdio MCP server** for Cursor (and similar hosts)
  that connects to `ws://127.0.0.1:<port>/ws` using `langflowerWsConfig`.
- **Source of truth** remains [`langflower-bus-config.ts`](../../packages/shared/src/langflower-bus-config.ts).
  MCP tools for client→server intents are generated from registry keys filtered
  by an allowlist policy (`workflow.*`, `runner.*`; **not** `editor.*`).
  Adding/changing an allowlisted bridge intent auto-exposes a tool after rebuild
    - MCP restart (codegen for descriptions/schemas + runtime key reflection).
- Observe/wait helpers and thin curated tools (`wait_event`, feed tail)
  wrap the broadcast bus so calls feel RPC-like.
- Consumer is **dev agents in this repo**, not a product public API or hosted
  remote control ([TBD-003](../_work/TBD.md#tbd-003--hosted-multi-tenant-cloud-product)).
- Does not start/stop Langflower by default; agent or human runs
  `langflower start` / `npm run dev`. Same localhost / no-auth assumptions as
  ADR-006.
- Headless browser / screenshots stay out of this ADR
  ([TBD-006](../_work/TBD.md#tbd-006--headless-ui-access-for-agents)).

**Tradeoffs accepted:**

- (+) One contract with UI and integration tests; no REST/DTO fork.
- (+) Policy globs keep editor mutations out of agent reach by default.
- (+) Co-versioned with the monorepo — intentional compile/codegen coupling.
- (−) Not a stable public MCP product surface; hosts must use matching
  Langflower revision.
- (−) Broadcast bus has no per-command `requestId`; MCP correlates with
  field predicates where payload fields exist (see exit criteria).
- (−) MCP client has the same power as any local WS client on the machine.

**Consequences:**

- Implement under `packages/langflower-mcp/`; do **not** grow
  `packages/server/src/` with MCP-server domain logic (ADR-014).
- Wire Cursor via `.cursor/mcp.json`; document lifecycle in `AGENTS.md` and
  how-to [LANGFLOWER_MCP.md](../reference/LANGFLOWER_MCP.md) (prefer `verify` when a live
  instance is not needed; do not leave the server running unless asked).
- Expand `editor.*` exposure only by changing the policy allowlist (and ADR
  revisit), not by inventing a second catalog.
- **Exit criteria (closed 2026-07-22):**
    - **Feed:** `get_execution_feed_tail` is snapshot-canonical —
      last `executionFeed.snapshot.events` plus live appends of `eventLog`
      kinds only (`output-emitted` / `input-received` / `done`); progress
      status from runner gate (`runner.snapshot` / start / interrupt / done)
      via `deriveExecutionProgressStatus` — not a second ad-hoc feed model.
    - **Correlation:** field predicates (`resolveWaitPredicate`) are sufficient
      for single-agent / CI on one session. Empty-payload intents
      (`list` / `save` / `create` / `interrupt`) remain next-broadcast-wins.
      Bus-wide `requestId` is **won't-do for now** — revisit only if multiple
      agents share one live session and predicates cannot disambiguate.
- **Revisit if:** agents need LAN/remote access, auth tokens, a versioned
  public control plane separate from the internal bus, or multi-agent
  same-session races that predicates cannot cover.

---
