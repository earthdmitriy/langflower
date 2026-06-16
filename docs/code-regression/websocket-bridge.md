# Code regression — websocket-bridge

## Meta

- Paths: `packages/websocket-bridge/src/`
- Date: 2026-07-22
- Coverage: All production modules (`bridge-types.ts`, `bridge-subjects.ts`, `bridge-codec.ts`, `bridge-guards.ts`, `bridge-frame.ts`, `create-client.ts`, `create-server.ts`); skimmed `testing/` samples/helpers and `bridge-transport.test.ts` / `create-client.test.ts` for behavioral coverage. Not a line-audit of every assertion in `*.test.ts` / `*.test-d.ts`.
- Re-verified against prior report (2026-07-21) and same-day fixes in `create-client.ts` / `bridge-types.ts` / `bridge-guards.ts`.

## Principles check

- **Thin WS bus / ADR-012 — PASS:** Generic `{ type, payload }` transport only; no Langflower domain, no bus registry, no RPC. Product protocol lives in `@langflower/shared` (`langflower-bus-config.ts` imports `message` + `WsBridgeConfig` from here). Matches ADR-012 “co-versioned internal bus” layering.
- **Reactivity / edge `.subscribe` — PASS:** `.subscribe` appears only at transport edges (`wireOutgoingSubjects` → `send`, test `waitForBridgeStatus`). No UI folds, no hidden reducers, no `withLatestFrom`, no `tap` domain mutation.
- **Immutability — PASS (transport scope):** No in-place mutation of consumer payloads; map builds allocate new objects (imperative loops, not fold state).
- **No barrels — PASS:** No `index.ts`. Public surface is concrete `package.json` exports (`"."`, `./create-client`, `./create-server`).
- **`type` not `interface` — PASS (fixed):** All exported contracts in `bridge-types.ts` and `ConnectedClientRecord` in `create-server.ts` use `type`.
- **Arrow functions — FAIL (style only):** Production APIs still use `export function` / `function` (`createClient`, `createServer`, subject helpers, guards, frame decode). `message` is already an arrow const.
- **Composer entry points — PASS (light):** `createClient` / `createServer` list setup in one body (keys → subjects → socket/wss → handlers → return). No hidden A→B→C chains. Missing only an explicit call-order comment per PRINCIPLES.
- **Prepare-then-mutate — mixed:** Client/server prepare then attach listeners (OK). `createSubjectMap` / `toObservables` still mutate via `for` loops instead of `Object.fromEntries` builds.
- **Non-replaying Subjects — by design:** Inbound/outbound/`connections$` are plain `Subject`s (no replay). `status$` uses `BehaviorSubject` for last-known transport status — acceptable edge lifecycle, not a UI fold store.

## FOUND_BUGS signals

- **BUG-2026-07-14** (server subscribed to non-replaying `events$` after emissions) — same class: plain `Subject` drops pre-subscription emissions. Defect was server attach timing; library does not replay by design. Consumers must subscribe before traffic or rely on product snapshots (execution feed).
- **BUG-2026-07-21f** (lifecycle unicast vs broadcast) — library correctly separates server broadcast Subjects vs per-`connections$` client handles (`create-server.ts`). Misuse risk stays at Langflower bridge attach, not inside this package.
- **BUG-2026-07-16** (Angular import / snapshot subscription) — UI consumption concern; no recurrence in this chunk.

## Glue / adapters / parallel types

- Package name `websocket-bridge` is the intentional typed transport kernel (ADR-012), not a forbidden field-reshuffle `*Adapter` between mismatched domain types.
- No `@langflower/shared` dependency; sample payload types (`PingPayload`, diagram fixtures) are test-local — not mirrors of product bus types. OK.
- Soft smell: envelope shape validated twice — `defaultWsBridgeCodec.decode` (`bridge-codec.ts`) and `isWsBridgeEvent` / `parseWsBridgeEvent` (`bridge-guards.ts` ← `bridge-frame.ts`). Not glue; redundant boundary checks.
- `Object.assign(core, subjects, observables) as WsBridge*Api<C>` in `create-client.ts` / `create-server.ts` is typed-map assembly, not cross-package glue. Acceptable; each `as` still warrants review justification per PRINCIPLES.
- `bridge-codec.ts` uses `as Record<string, unknown>` after JSON parse — acceptable runtime-boundary cast per PRINCIPLES type-guard order.
- No ADR-backed adapter exit criteria required inside this package.

## Streamlining & simplifications

- **`bridge-codec.ts` ↔ `bridge-guards.ts`:** Single envelope validation path (codec returns parsed JSON → guards own shape + known-type routing).
- **`bridge-frame.ts` `decodeInboundFrame`:** Remove unreachable `INVALID_ENVELOPE` branch once codec guarantees `{ type, payload }` or codec delegates to `isWsBridgeEvent`.
- **`bridge-subjects.ts` `createSubjectMap` / `toObservables`:** Replace mutate-in-loop with `Object.fromEntries(keys.map(...))`.
- **`create-client.ts` / `create-server.ts`:** Add short call-order comment at composer top; convert `function` → arrow consts on touch.
- **`AGENTS.md`:** Document “no replay; subscribe before connect; `connections$` emits once per client” to reduce repeat of BUG-2026-07-14 class misuse.

## Design-flaw fixes

1. **Client outgoing wire attached only after `open`** — **addressed (verified 2026-07-22):** `wireOutgoingSubjects` runs at construction; pre-open `.next` reaches `sendEvent`, which emits `TRANSPORT_NOT_OPEN` on `errors$` instead of silent drop (`create-client.ts` ~157–162).
2. **Client transport close ≠ API teardown** — **addressed (verified 2026-07-22):** Shared idempotent `tearDown` from both `close()` and `socket.onClose` — unsubscribes wire, completes subjects, completes `errors$` / `status$` (`create-client.ts` ~184–210).
3. **`interface` contracts** — **addressed (verified 2026-07-22):** `bridge-types.ts` and `ConnectedClientRecord` converted to `type`; `message` remains arrow const.

## Findings

1. **Severity:** Suggestion  
   **Path / symbol:** `packages/websocket-bridge/src/{create-client,create-server,bridge-subjects,bridge-guards,bridge-frame}.ts` — `export function` / `function`  
   **Problem:** Violates repo style (“arrow functions, never `function` declarations”). No runtime bug.  
   **Proposed fix:** Convert on next touch.

2. **Severity:** Suggestion  
   **Path / symbol:** `packages/websocket-bridge/src/bridge-codec.ts` `defaultWsBridgeCodec.decode` ↔ `bridge-guards.ts` `isWsBridgeEvent` / `parseWsBridgeEvent`  
   **Problem:** Duplicate `{ type, payload }` envelope checks on every inbound frame.  
   **Proposed fix:** Codec decodes JSON only; guards own envelope + known-type routing (or codec calls shared guard).

3. **Severity:** Suggestion  
   **Path / symbol:** `packages/websocket-bridge/src/bridge-frame.ts` — `decodeInboundFrame` (~46–51)  
   **Problem:** `INVALID_ENVELOPE` return path appears unreachable when `codec.decode` already rejects non-envelope shapes and successful decode always passes `isWsBridgeEvent`.  
   **Proposed fix:** Delete dead branch or narrow codec contract explicitly.

4. **Severity:** Suggestion  
   **Path / symbol:** `packages/websocket-bridge/src/bridge-subjects.ts` — `createSubjectMap`, `toObservables`  
   **Problem:** Imperative mutate-in-loop map builds vs prepare-then-assign style in PRINCIPLES.  
   **Proposed fix:** `Object.fromEntries` / `map` one-liners.

5. **Severity:** Suggestion  
   **Path / symbol:** `packages/websocket-bridge/src/create-client.ts` / `create-server.ts` — `Object.assign(...) as WsBridgeClientApi` / `as WsBridgeServerApi` / `as WsBridgeConnectedClientApi`  
   **Problem:** Assembly casts paper over Subject/Observable map typing at the public API boundary.  
   **Proposed fix:** Small generic builder helper without `as`, or inline comment justifying each cast.

6. **Severity:** Suggestion  
   **Path / symbol:** `packages/websocket-bridge/src/create-server.ts` — per-client `wireOutgoingSubjects` send (~112–114)  
   **Problem:** When `ws.readyState !== OPEN`, send is silently skipped; client symmetric path emits `TRANSPORT_NOT_OPEN` on `errors$`.  
   **Proposed fix:** Emit server-side error (or document intentional silence for broadcast/unicast).

7. **Severity:** Suggestion  
   **Path / symbol:** `packages/websocket-bridge/AGENTS.md`; `create-server.ts` — `connections$`  
   **Problem:** Plain `Subject` — late subscribers miss prior connections (same subscription-timing class as BUG-2026-07-14). Not a library bug, but undocumented for consumers.  
   **Proposed fix:** Document subscribe-before-listen contract in AGENTS.md.

8. **Severity:** Suggestion  
   **Path / symbol:** `packages/websocket-bridge/src/bridge-transport.test.ts` (coverage gap)  
   **Problem:** No transport test for pre-open client emit → `TRANSPORT_NOT_OPEN`, or unexpected socket close → completed subjects / idempotent `tearDown`. Fixes exist in `create-client.ts` but are untested at transport level.  
   **Proposed fix:** Add two focused cases to `bridge-transport.test.ts` on next touch.

## Non-issues / looked OK

- No `withLatestFrom`, no `any` in production sources, no `index.ts` barrels.
- Event-only `{ type, payload }` model; no RPC — matches package AGENTS + ADR-012.
- Server broadcast vs per-client unicast Subjects are clear; routing covered by `bridge-transport.test.ts`.
- `isKnownWsBridgeEventType` dead both-direction branch removed — always requires `section` (`bridge-guards.ts`).
- Invalid JSON and unknown event types route to `errors$` with distinct codes (`INVALID_FRAME`, `UNKNOWN_EVENT_TYPE`).
- Codec pluggability + `decodeInboundFrame` known-type routing is a clean boundary, not domain glue.
- Testing samples (`pingWsConfig`, `diagramWsConfig`) and local `ExpectEqual` are package-local fixtures.
- `.subscribe` in `wireOutgoingSubjects` and test helpers is acceptable edge usage per REACTIVITY.

## Status

report path: `d:\Win\Projects\langflower\docs\code-regression\websocket-bridge.md`  
Critical=0 Important=0 Suggestion=8
