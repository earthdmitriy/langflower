# Code regression — langflower-mcp

## Meta

- Paths: `packages/langflower-mcp/src/`
- Date: 2026-07-22
- Coverage: Full re-pass over hand-written modules (`cli.ts`, `mcp-stdio-server.ts`, `create-bridge-session.ts`, `handle-tool-call.ts`, `build-tool-catalog.ts`, `mcp-exposure-policy.ts`, `intent-wait-map.ts`, `intent-wait-predicate.ts`, `execution-feed-tail.ts`, `ws-client-access.ts`, `wait-event-mode.ts`, `list-action-intents.ts`, `match-glob.ts`, `sanitize-tool-name.ts`) plus unit tests and skim of `generated/bridge-tool-meta.ts` (codegen shape only). Cross-checked ADR-024, `packages/langflower-mcp/AGENTS.md`, `docs/LANGFLOWER_MCP.md`, `docs/PRINCIPLES.md`, `docs/REACTIVITY.md`, and relevant `FOUND_BUGS` entries. Not a line-by-line audit of the generated meta blob.

## Principles check

- **Package boundary / thin control plane — PASS.** Owns MCP stdio + exposure policy + wait/correlation only; no server domain growth. Depends on `@langflower/shared` (`langflowerWsConfig`, `waitBusEvent`, `waitSessionReady`, `deriveExecutionProgressStatus`) and `@langflower/websocket-bridge` (`createClient`) as documented.
- **MCP as thin client over shared WS contracts — PASS.** Tools derive from `langflowerWsConfig` via `listActionIntents()` + codegen meta; no parallel REST/DTO protocol. Curated observe tools wrap the same broadcast keys the UI folds.
- **No barrels (`index.ts`) — PASS.** Concrete `package.json` exports; no `index.ts` under the package.
- **`type` not `interface`; arrow functions — PASS.** Sampled modules use `type` + `const` arrows.
- **Composer entry points — PASS.** `cli.ts` `main` sequences assert → parse → session → catalog → `runMcpStdioServer`; handlers do not bury order in nested callers.
- **Feature-sliced / colocation — PASS.** Policy, catalog, session, stdio, dispatch, feed projection, and predicates are separate modules with clear roles.
- **Immutability — PASS (edge OK).** Session cache/feed mutate at the WS I/O edge; `execution-feed-tail.ts` folds are pure; tool responses are new JSON strings.
- **RxJS / reactive waits — PASS.** No `withLatestFrom`. `waitForEventSeq` uses `merge(defer, seqAdvanced$)` + `firstValueFrom` (reactive, not `interval` poll). Action tools subscribe via `waitBusEvent` before `emitClientIntent`. Residual: feed/cache updates live in `.subscribe` at the host edge (accepted for ADR-024 cache).
- **No adapters / glue (default) — MIXED (ADR-backed).** Whole package is the ADR-024 stdio control-plane over `createClient(langflowerWsConfig)` — intentional. Residual typing shim in `emitClientIntent` (finding #1).
- **Delete obsolete / single API — PASS.** Legacy `useCache` and intent-wait name heuristic removed; explicit override map only.
- **Prepare-then-mutate — PASS** in stdio handler (parse → dispatch → `writeMessage`).

## FOUND_BUGS signals

- **BUG-2026-07-14** (_subscription timing vs non-replaying subjects_) — **mitigated for MCP:** `attachClient` subscribes to all `OBSERVE_EVENT_KEYS` immediately after `createClient`, before `waitSessionReady` — same “subscribe before bootstrap” pattern as `waitSessionReady` in `@langflower/shared`. `get_execution_feed_tail` is snapshot-canonical + eventLog appends; status from runner gate via `deriveExecutionProgressStatus`.
- **BUG-2026-07-21f** (_lifecycle facts must fan-out_) — **related, not direct:** MCP action waits assume broadcast replies; unicast-only intents would hang. `runner.resume.requested` correctly races `runner.resume.started` vs `runner.resume.failed`.
- **BUG-2026-07-19c** (_glob `{a,b}` never matched_) — **residual risk:** `match-glob.ts` has no brace expansion; current policy patterns are brace-free (finding #3).
- **BUG-2026-07-21b** (_false-ready hydration_) — **low relevance:** MCP cache/seq waits are not UI-style `withLatestFrom` + empty catalogs.
- Other BUG-* (canvas chrome, reactive ports, permission inventory) — **none** applicable to this package.

## Glue / adapters / parallel types

- **ADR-024 adapter (intentional):** stdio MCP over internal bus; exit criteria for feed + correlation **closed** in ADR-024 (2026-07-22).
- **Typed client access:** `ws-client-access.ts` — `observeEvent$` typed via `ObserveEventKey`; `emitClientIntent` still uses a `Record` cast for dynamic intent keys (finding #1).
- **Feed projection:** `execution-feed-tail.ts` reuses shared `RuntimeRunnerEvent`, `ExecutionProgressStatus`, `deriveExecutionProgressStatus` — tool response shape is a projection, not a mirrored WS payload type.
- **No `*Adapter` / `*Mapper` field-reshuffle modules.** `sanitizeToolName` is MCP host naming constraint; `intent-wait-predicate.ts` is ADR-024 correlation logic, not glue.
- **Codegen meta includes full bus keys:** `generated/bridge-tool-meta.ts` lists `editor.*`; runtime policy + `listActionIntents()` filter exposure — OK, not a parallel catalog.

## Streamlining & simplifications

- **`wait_session_ready` curated tool:** optional delete or alias of `ensure_connected` — docs already state ensure covers the common path (finding #2).
- **`OBSERVE_EVENT_KEYS`:** optional compile-time parity test against `langflowerWsConfig.fromServerToClient` subset to catch bus drift (finding #4).
- **`seqAdvanced$` on reconnect:** optional `Subject` reset in `detachClient` so no in-flight `waitForEventSeq` can resolve from a new attach generation (finding #5).

## Design-flaw fixes

1. ~~**Broadcast action wait ≈ RPC without correlation**~~ **closed (2026-07-22):** field predicates + resume race; ADR-024 records bus `requestId` as won't-do for single-agent CI.
2. ~~**Local feed diverged from session truth**~~ **closed (2026-07-22):** snapshot-canonical feed tail + runner gate status.
3. ~~**Dynamic string keys erased typing**~~ **mostly closed (2026-07-22):** observe path typed; emit path residual cast remains (finding #1).
4. ~~**Duplicated connect/`session.ready` sequencing**~~ **closed (2026-07-22):** `waitUntilSessionReady` delegates to shared `waitSessionReady` + timeout.
5. ~~**`waitForEventSeq` polled with `interval(20)`**~~ **closed (2026-07-22):** reactive `seqAdvanced$` + unit test.

## Findings

1. **Severity:** Suggestion  
   **Path / symbol:** `ws-client-access.ts` — `emitClientIntent`  
   **Problem:** Outbound intents still cast `client as unknown as Record<string, Subject<unknown>>` while `observeEvent$` is typed via `ObserveEventKey`. Asymmetric boundary typing.  
   **Proposed fix:** Derive a `ClientIntentKey` union from `langflowerWsConfig.fromClientToServer` (filtered by action policy) and narrow `emitClientIntent` the same way as observe — or codegen intent keys alongside `BRIDGE_TOOL_META`.

2. **Severity:** Suggestion  
   **Path / symbol:** `build-tool-catalog.ts` / `handle-tool-call.ts` — `wait_session_ready`  
   **Problem:** Overlaps `ensure_connected` (connect + `session.ready`); adds surface area and agent confusion.  
   **Proposed fix:** Remove curated tool or make it a thin alias documented as deprecated; keep `ensure_connected` as the single bootstrap entry.

3. **Severity:** Suggestion  
   **Path / symbol:** `match-glob.ts`; `mcp-exposure-policy.ts` — `ACTION_NAMESPACE_GLOBS`  
   **Problem:** Same brace-expansion gap as BUG-2026-07-19c if someone later writes `runner.{start,interrupt}.*`-style policy. Current patterns are safe.  
   **Proposed fix:** Keep patterns brace-free (current) or reject `{`/`}` in policy strings at startup.

4. **Severity:** Suggestion  
   **Path / symbol:** `mcp-exposure-policy.ts` — `OBSERVE_EVENT_KEYS`  
   **Problem:** Hand-maintained allowlist can drift when `langflower-bus-config.ts` adds agent-relevant server→client keys (e.g. future bootstrap/telemetry). `wait_event` enum and session subscriptions would miss new frames silently.  
   **Proposed fix:** Unit test asserting every `OBSERVE_EVENT_KEYS` entry exists in `langflowerWsConfig.fromServerToClient`, plus optional “required observe set” derived from workflow/runner/bootstrap namespaces.

5. **Severity:** Suggestion  
   **Path / symbol:** `create-bridge-session.ts` — `seqAdvanced$` / `detachClient`  
   **Problem:** `detachClient` clears cache and unsubscribes WS listeners but does not complete/reset `seqAdvanced$`. A slow `waitForEventSeq` across reconnect could theoretically resolve from the next attach's `bumpCache` (same event key).  
   **Proposed fix:** Replace with a per-attach `Subject` or increment a generation token checked in `waitForEventSeq`.

6. **Severity:** Suggestion — **addressed (2026-07-22, re-verified)**  
   **Path / symbol:** `create-bridge-session.ts` — `waitForEventSeq`  
   **Problem:** Polled cache with `interval(20)`.  
   **Fix applied:** Reactive `seqAdvanced$` merge; `create-bridge-session.wait-seq.test.ts` asserts no poll.

7. **Severity:** Important — **addressed (2026-07-22, re-verified)**  
   **Path / symbol:** `execution-feed-tail.ts` / `create-bridge-session.ts`  
   **Problem:** Second feed projection / interrupt status gap (BUG-2026-07-14 class).  
   **Fix applied:** Snapshot-canonical tail, eventLog appends only, interrupt → `stopped`, `deriveExecutionProgressStatus`; unit tests cover interrupt/settle/gate precedence.

8. **Severity:** Important — **addressed (2026-07-22, re-verified)**  
   **Path / symbol:** `handle-tool-call.ts` — `emitAction`; `intent-wait-predicate.ts`; ADR-024  
   **Problem:** Action tools waited for next broadcast without correlation.  
   **Fix applied:** `resolveWaitPredicate` + resume started/failed race; explicit `INTENT_WAIT_OVERRIDES` for every allowlisted intent; parity test in `intent-wait-map.test.ts`.

## Non-issues / looked OK

- Exposure policy correctly keeps `editor.*` out of tools while codegen may still list editor meta.
- `assertToolMetaCoverage` + `build-tool-catalog.test.ts` guard allowlist ↔ codegen drift for **action** intents.
- `cli.ts` composer order is explicit; stdio server is a thin JSON-RPC loop; sequential `await handle(line)` avoids overlapping tool races on one process.
- `ensureReady` coalesces via `readyInFlight`; reconnect path detaches cleanly.
- Action emit order: `waitBusEvent(...)` promise starts subscription before `emitClientIntent` (matches shared `requestWorkflowLoad` pattern).
- `status$` is a `BehaviorSubject` in websocket-bridge — `readStatus` + `take(1)` is safe.
- No barrels, no `interface`, no `withLatestFrom`, no domain logic belonging in server/tools.
- `sanitizeToolName`, default `wait_event` mode=`latest`, and feed-tail docs match agent workflow in `docs/LANGFLOWER_MCP.md`.
- `resolveWsUrl` reads shared transport defaults; no hard-coded protocol fork.
- Pure feed fold functions in `execution-feed-tail.ts` are unit-tested independently of WS wiring.

Return Status: Critical=0 Important=0 Suggestion=5
