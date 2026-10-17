# Code regression — websocket-bridge

## Meta

- Paths: `packages/websocket-bridge/src/`
- Date: 2026-09-20
- Mode: delta
- Coverage: Delta reconcile of the 2026-09-19 report against the same seven production modules (`bridge-types.ts`, `bridge-subjects.ts`, `bridge-codec.ts`, `bridge-guards.ts`, `bridge-frame.ts`, `create-client.ts`, `create-server.ts`). Re-read those files and `create-client.test.ts`. Sampled `testing/` (ping fixture, transport helpers, `ExpectEqual`), `bridge-transport.test.ts`, `bridge-types.types.test.ts`, both `*.test-d.ts`. ts-scan: `list_exports` on the seven modules; `resolve_symbol` miss for deleted `WsBridgeOutboundSubjects`; `encodeBridgeFrame` still imported by server `bridge-event-log.ts`; `decodeInboundFrame` callers are only `create-client.ts` / `create-server.ts`. Did not re-read every assertion body. Consumers outside this chunk checked only for export liveness.
- Previous report: 2026-09-19 — Critical=0 Important=1 Suggestion=3 (numbered 1–4, no kebab ids)

## Previous findings (delta mode)

| id                                         | severity  | status     | evidence                                                                                                                                                                                                                                                                                |
| ------------------------------------------ | --------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `websocket-bridge-server-ws-path-fallback` | Important | still-open | `create-server.ts` line 47 is still `options.path ?? config.transport?.path ?? '/ws'`. `pingWsConfig` still has no `transport`. Unit `createServer(pingWsConfig, { port: 0 })` still succeeds. Client `resolveClientUrl` still throws. AGENTS.md still forbids a kernel `/ws` fallback. |

## Principles check

- **PASS — no barrels (`index.ts`)** — none under `packages/websocket-bridge`. Published subpaths remain `.`, `./create-client`, `./create-server`, `./bridge-codec` (plus duplicate `./bridge-codec.js` in `package.json`, outside this chunk).
- **PASS — `type` not `interface`** — contracts in `bridge-types.ts` / `ConnectedClientRecord` / `WsBridgeSocket` use `type`.
- **PASS — thin kernel / ADR-012** — generic `{ type, payload }` bus. No Langflower route table, no RPC, no `@langflower/shared` import. Product registry stays in `langflower-bus-config.ts`.
- **FAIL — `false-ready` (product path fallback)** — `createServer` still synthesizes `'/ws'` when both `options.path` and `config.transport?.path` are missing (`create-server.ts` ~47). Node `createClient` already refuses this (`resolveClientUrl`).
- **PASS — reactivity / edge `.subscribe`** — `.subscribe` only in `wireOutgoingSubjects` (send edge) and test helper `waitForBridgeStatus`. No domain `scan`, no `withLatestFrom`, no `tap` mutation. `status$` is a transport-edge `BehaviorSubject`.
- **PASS — composer entry** — `createClient` / `createServer` list wiring in one body. Client still documents wire-before-open so early `.next` is not dropped.
- **PASS — functional errors** — `decodeInboundFrame` returns `{ event } | { error }`. Factory throws for missing client URL (tested). `injectInbound` throws on an unknown key (programmer error after a typed key).
- **PASS — delete obsolete / Y / AD leftovers** — `resolve_symbol` `WsBridgeOutboundSubjects` is not found. `connected$` / `sample-diagram-ws-config.ts` stay deleted. Live maps remain `WsBridgeClientOutgoing` / `Incoming` and server directional maps.

## FOUND_BUGS signals

none

BUG-2026-07-14 (subscribe after a non-replaying `Subject`) is the same class, not a recurrence: inbound / outbound / `connections$` are plain `Subject`s by design; `status$` replays last transport status. Late `connections$` subscribers still miss already-open sockets — attach-timing, not a kernel regression. BUG-2026-07-21f / BUG-2026-06-26d unicast-vs-broadcast: library still splits broadcast Subjects vs per-`connections$` handles. BUG-2026-07-16: this kernel does not import runtime snapshot types.

## Glue / adapters / parallel types

none

Package name `websocket-bridge` is the ADR-012 transport kernel, not a field-reshuffle `*Adapter`. `encodeBridgeFrame` has a real consumer (`packages/server/src/bridge/bridge-event-log.ts`). `WsBridgeSocket` is a host-boundary wrapper (browser `WebSocket` vs Node `ws`). `BridgeFrame` vs `WsBridgeEvent` is decode (wire tuple vs in-memory envelope), not a DTO twin. Local `isRecord` in `bridge-guards.ts` cannot move to `@langflower/shared` (DAG: shared depends on this package). `Object.assign(...) as WsBridge*Api` is typed-map assembly at the host edge.

## Streamlining & simplifications

none

## Design-flaw fixes

none

## Findings

1.  - id: `websocket-bridge-server-ws-path-fallback`

- class: false-ready
- severity: Important
- first-seen: 2026-09-19
- status: open
- path: `packages/websocket-bridge/src/create-server.ts` — `createServer` path resolve (`options.path ?? config.transport?.path ?? '/ws'`)
- evidence: Line 47 still hardcodes Langflower’s product path. `pingWsConfig` has no `transport`, so `create-client.test.ts` `createServer(pingWsConfig, { port: 0 })` binds `/ws` without saying so. Node `resolveClientUrl` already throws when `path` / `port` are missing. Package `AGENTS.md` forbids restoring a kernel `/ws` fallback; product owner is `@langflower/shared` `langflowerWsConfig.transport`. LEDGER `legacy-client-ws-port-fallback` is the closed _client_ leftover in shared — not this server-kernel line.
- proposed fix: Require `options.path` or `config.transport.path` and throw with the same wording as the Node client. Add a unit test that `createServer(pingWsConfig, { port: 0 })` throws. Keep generic `host` default `127.0.0.1` and `port` default `0`. Do not restore `4010` or `/ws` kernel fallbacks.

## Non-issues / looked OK

- Client AA leftover stays deleted: no `path ?? '/ws'` or `port ?? 4010` in `resolveClientUrl`; Node throws; unit test covers the throw. Do not reopen LEDGER `legacy-client-ws-port-fallback`.
- Y / AD leftovers stay deleted: unused type aliases, `connected$`, `sample-diagram-ws-config.ts`.
- No `withLatestFrom`, no production `any`, no `index.ts`.
- Event-only `{ type, payload }` model; `injectInbound` is in-process injection onto the same inbound Observables, not RPC.
- Server broadcast Subjects vs per-client unicast handles stay clear; `bridge-transport.test.ts` covers them.
- Client pre-open `.next` → `TRANSPORT_NOT_OPEN`; server unicast `readyState !== OPEN` silent return is a post-`connection` race guard.
- `decodeInboundFrame` + `isWsBridgeEvent` after a successful codec decode is the custom-codec / `UNKNOWN_EVENT_TYPE` vs `INVALID_ENVELOPE` split, not removable glue.
- `message()` type carrier is the intended config API.
- Testing `ExpectEqual` / ping fixture / transport helpers are package-local.
- `createServer.close` / `wss.on('error')` incomplete teardown and `decodeInboundFrame` copy remain working-but-weaker; not re-filed.
- Out of `src/` (not numbered): `package.json` still publishes duplicate `./bridge-codec.js`. `README.md` still documents the wire as `{ "type", "payload" }` JSON — production uses `BridgeFrame` tuples.
