# Code regression — langflower-mcp

## Meta

- Paths: `packages/langflower-mcp/src/`
- Date: 2026-09-20
- Mode: delta
- Coverage: Re-read of all hand-written modules (`cli.ts`, `mcp-stdio-server.ts`, `mcp-stdio-framing.ts`, `create-bridge-session.ts`, `handle-tool-call.ts`, `build-tool-catalog.ts`, `mcp-exposure-policy.ts`, `intent-wait-map.ts`, `intent-wait-predicate.ts`, `execution-feed-tail.ts`, `runtime-event-types.ts`, `ws-client-access.ts`, `wait-event-mode.ts`, `list-action-intents.ts`, `match-glob.ts`, `sanitize-tool-name.ts`) plus colocated unit tests. Skim of `generated/bridge-tool-meta.ts` (codegen shape; `editor.*` / S→C blobs still filtered at runtime). Confirmed leftovers via ts-scan `resolve_symbol` (`wait_session_ready`, `ACTION_EXCLUDE_GLOBS` — not found) and catalog test (`wait_session_ready` still forbidden). Cross-checked `packages/langflower-mcp/AGENTS.md`, bus JSDoc on `workflow.load.failed`, PRINCIPLES, FOUND_BUGS (same-mechanism only), LEDGER `legacy-wait-session-ready`. No new files vs 2026-09-19.
- Previous report: 2026-09-19 — Critical=0 Important=3 Suggestion=2

## Previous findings (delta mode)

| id                                   | severity  | status | evidence                                                                                                                                                                                                                                                        |
| ------------------------------------ | --------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `legacy-wait-session-ready`          | Important | fixed  | Tool and symbol stay deleted. Catalog test still `expect(names).not.toContain('wait_session_ready')`. ts-scan `resolve_symbol` from `build-tool-catalog.ts` returns not found. LEDGER closed 2026-09-18; AGENTS.md still forbids restoring it (BUG-2026-07-14). |
| `mcp-workflow-load-failed-wait`      | Important | fixed  | Closed 2026-09-20 — see LEDGER.                                                                                                                                                                                                                                 |
| `mcp-output-emitted-catalog-ghost`   | Important | fixed  | `CURATED_TOOLS` `wait_event` / `get_execution_feed_tail` now name `runner.port` and `in`/`out`/`done`. No `output-emitted` / `input-received` in catalog copy.                                                                                                  |
| `mcp-stdio-handle-queue-blocks-ping` | Important | fixed  | Closed 2026-09-20 — see LEDGER.                                                                                                                                                                                                                                 |

## Principles check

- **Package boundary / thin control plane — PASS.** Owns stdio handshake, exposure policy, codegen meta, wait/correlation. No server CRUD, no Langflower start/stop, no `editor.*` tools. Production `src/` does not import `@langflower/runtime`. Depends on `@langflower/shared` + `@langflower/websocket-bridge`.
- **MCP as thin client over shared WS contracts — PASS.** Action tools = `listActionIntents()` ∩ codegen meta; observe tools wrap broadcast keys. No parallel REST/DTO protocol.
- **No barrels (`index.ts`) — PASS.** None in the package.
- **`type` not `interface`; arrow functions — PASS.** Sampled modules use `type` + `const` arrows. No `any`, no `withLatestFrom`.
- **Composer entry points — PASS.** `cli.ts` `main`: assert → parse → session → catalog → `runMcpStdioServer`. `handleToolCall` lists action vs curated.
- **Delete obsolete / single API — PASS (was MIXED).** `wait_session_ready` stayed deleted. Catalog no longer names retired `runner.output-emitted`.
- **No adapters / glue (default) — PASS (ADR-backed).** Whole package is ADR-024 stdio over `createClient(langflowerWsConfig)`. `generated/bridge-tool-meta.ts` is codegen. Stdio parse twin is ADR-039. `ws-client-access.ts` casts stay local.
- **Immutability / RxJS — PASS (edge OK).** Session cache / `feedState` assignment live in `.subscribe` at the WS host edge. `execution-feed-tail.ts` folds are pure. `waitForEventSeq` is `merge(defer(already-past), seqAdvanced$)`. No `withLatestFrom`.
- **Prepare-then-mutate — PASS** in the stdio handler (parse → dispatch → `writeMessage`).
- **Fail-closed waits — PASS.** Load races `workflow.load.failed` against correlated current; `ping` / `initialize` / `tools/list` skip the in-flight `tools/call` queue (LEDGER 2026-09-20).

## FOUND_BUGS signals

- **BUG-2026-07-21f** (_lifecycle facts must fan-out; unicast is not a peer snapshot_) — **not the same mechanism.** That bug was initiator-only `clientEmit` of `runner.started` / `interrupted` hiding chrome on tab B. MCP load hang is a client wait that ignores a unicast failure and waits for a snapshot that does not change. Same family of unicast-vs-broadcast, different mechanism — do not tag `found-bugs-recurrence`.
- **BUG-2026-07-14** (_subscription timing vs non-replaying subjects_) — **held for connect.** `attachClient` still subscribes before `waitSessionReady`. `wait_session_ready` not restored. `wait_event` `mode=next` uses cache-seq + `seqAdvanced$`.
- **BUG-2026-07-19c** (_glob `{a,b}` never matched_) — **residual only.** `match-glob.ts` has no brace expansion; current `ACTION_NAMESPACE_GLOBS` are brace-free.
- Other BUG-* (canvas chrome, HITL feed paint, permissions inventory) — **none** applicable.

## Glue / adapters / parallel types

none

ADR-backed copies (note, not findings):

- **ADR-024:** stdio MCP over the internal bus. Correlation exit criteria remain the documented 2026-07-22 close. Load-failure race closed 2026-09-20 (LEDGER `mcp-workflow-load-failed-wait`).
- **`generated/bridge-tool-meta.ts` — not glue.** Codegen from `langflower-bus-config.ts`. `editor.*` and unused S→C keys never become tools (`listActionIntents` / curated filter). `assertToolMetaCoverage` guards allowlisted intents ↔ meta keys.
- **`runtime-event-types.ts` — DAG-legal aliases.** Indexes shared feed/snapshot payloads. Matches AGENTS.md. Not a second event union.
- **Parallel framing parsers — ADR-039.** Same parse dialect (CRLF + LF Content-Length, newline JSON, object-only JSON-RPC). Tools remains parse-only; encode/mode stay here. Gate: `packages/tools/src/mcp/mcp-stdio-frame-parser.parity.test.ts`.
- **`ws-client-access.ts`:** keyed `observeEvent$` / `emitClientIntent`; casts stay local. Not a `*Mapper`.
- **Feed projection:** `execution-feed-tail.ts` reuses shared `deriveExecutionProgressStatus` + payload types.

## Streamlining & simplifications

none

## Design-flaw fixes

none

## Findings

none

## Non-issues / looked OK

- **LEDGER `legacy-wait-session-ready` — do not reopen.** Tool absent; catalog test forbids the name; ts-scan miss; AGENTS.md still bans a second `waitSessionReady` on the hot `session.ready` Subject.
- **Historical closes still hold:** no `ACTION_EXCLUDE_GLOBS` (ts-scan miss); `emitClientIntent(ClientIntentKey)`; feed-tail tests use `RuntimeRunnerEvent`, not runtime `NodeId`; `interval(20)` poll is gone.
- **`mcp-output-emitted-catalog-ghost` stayed fixed in this chunk.** Out-of-chunk `docs/LANGFLOWER_MCP.md` troubleshooting still says feed `input-received` — not filed here.
- **HITL reply `wait: null`** — re-confirmed as the documented fire-and-forget contract (`ok` = emit, not accept). Not re-filed.
- **Untyped `INTENT_WAIT_OVERRIDES`** — type hygiene only; not re-filed.
- **`seqAdvanced$` is the race-safe cache-seq wait** for `wait_event` `mode=next`. Shared `waitBusEvent` is for action-tool correlation. Do not collapse the two.
- **`runtime-event-types.ts` aliases vs importing runtime — production OK.**
- **`generated/bridge-tool-meta.ts` — OK.** Codegen only; unused keys filtered at runtime.
- **`execution-feed-tail.ts` — OK.** Snapshot-canonical + live `eventLog` appends; `applyFeedSnapshot` wiping `liveAppends` is correct when the snapshot is the full slice.
- Exposure policy keeps `editor.*` out of tools. `assertToolMetaCoverage` + `intent-wait-map.test.ts` lock allowlist ↔ codegen ↔ wait override keys.
- `cli.ts` composer order is explicit. Action emit order: `waitBusEvent(...)` subscription starts before `emitClientIntent`.
- `status$` is a `BehaviorSubject` — `readStatus` + `take(1)` is safe; `session.ready` is not (BUG-2026-07-14).
- Empty-payload waits (`list` / `save` / `create` / `interrupt`) remaining next-broadcast-wins is an ADR-024 accepted tradeoff.
- No barrels, no `interface`, no `withLatestFrom`, no `index.ts`.
- `sanitizeToolName` and default `wait_event` `mode=latest` match the intended host constraints.
- Stdio parse swallow of malformed JSON is the existing ADR-039 dialect; previous report already covered `mcp-stdio-framing.ts` — not a new `fail-open-io`.
