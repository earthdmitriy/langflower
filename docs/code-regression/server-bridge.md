# Code regression — server-bridge

## Meta

- Paths: `packages/server/src/bridge/` (20 files); `packages/server/src/websocket/` **absent** — WS transport lives in `create-server.ts` + `@langflower/websocket-bridge` (out of chunk tree; noted for scope).
- Date: 2026-07-22
- Coverage: Full file inventory. Read end-to-end: `attach-langflower-bridge.ts`, `build-execution-context.ts`, `bind-llm-context.ts`, `wire-runner-handlers.ts`, `wire-workflow-handlers.ts`, `wire-editor-handlers.ts`, `wire-config-handlers.ts`, `wire-palette-handlers.ts`, `wire-models-handlers.ts`, `emit-bootstrap.ts`, `forward-runner-event.ts`, `bridge-outbound.ts`, `client-index.ts`, `inbound-guards.ts`, `langflower-bridge.types.ts`, `BRIDGE.md`, unit tests. Re-verified 2026-07-21 report fixes against current tree.

## Principles check

- **Thin server — PASS.** Bridge injects `@langflower/tools` / `common-nodes` via `build-execution-context.ts` and `bind-llm-context.ts`; no forbidden `kb/`/`crawl/`/`mcp/`/`llm/` domain trees. Evidence: `createProjectHarness`, `createKbContext`, `createMcpRuntime`, `bindCreateChatCompletionStream`.
- **Composer entry points — PASS.** `attachLangflowerBridge` lists ordered sibling wires; `syncAfterWorkflowMutation` documents step order; handlers prepare then emit without nested A→B→C chains.
- **Intent/fact bridge — PASS.** Clients emit `*.requested` / reply intents; server emits authoritative snapshots and `bridgeEmit` session-shared facts. `resume.failed` correctly stays unicast.
- **Session fan-out — PASS (2026-07-22 fixes hold).** `syncAfterWorkflowMutation` broadcasts `workflow.current.snapshot`; runner telemetry and `permission.ask` use `bridgeEmit`; editor deltas/status broadcast; single `client-index` WeakMap.
- **No barrels — PASS.** No `index.ts`; `client-index.ts` is a registry module.
- **REACTIVITY / edge subscribe — PASS (scope).** Bridge `.subscribe` is intentional transport edge; no UI folds, no `withLatestFrom`, no hidden reducers in `tap`.
- **Immutability — PASS with nits.** Viewport handler builds new `activeWorkflow` before assign; `mergeSeeds` returns new object.

## FOUND_BUGS signals

- **BUG-2026-07-14** (non-replaying `events$` / missed `pending`) — mitigated: always-on fan-out in `attach-langflower-bridge.ts` step 1 **before** connect handlers. Regression risk if subscription order changes or a second subscriber is added without the same guarantee.
- **BUG-2026-07-21f** (session-shared lifecycle must fan-out) — **addressed:** `runner.started`, `interrupted`, `resume.started`, `permission.ask`, `workflow.current.snapshot` use `bridgeEmit`.
- **BUG-2026-07-17** (feed clear mid-run) — gate present: `wire-runner-handlers.ts` ignores clear when `runnerStatus === 'running'`.
- **BUG-2026-06-26d** (editor deltas unicast) — **addressed:** editor wires use `bridgeEmit`.
- **BUG-2026-07-21b** (bootstrap false-ready vs feed) — emit order in `emit-bootstrap.ts` still sends `executionFeed.snapshot` before `workflow.current.snapshot`; UI must `combineLatest`/wait for readiness (REACTIVITY policy), not a new server defect.
- **BUG-2026-07-14 class (pending race)** — covered by `forward-runner-event.test.ts` + integration `pending-events-bridge.ws.test.ts` (cited in FOUND_BUGS).

## Glue / adapters / parallel types

- **No `*Adapter` / `*Mapper` filenames** in this chunk.
- **Thin bind (acceptable, ADR-014):** `bind-llm-context.ts` — credential resolve only; HTTP in common-nodes.
- **Transport cast glue:** `bridge-outbound.ts` — `client/bridge as unknown as Record<string, Subject<Payload>>`. Necessary until websocket-bridge exposes typed emit; no ADR exit criteria documented.
- **Parallel type:** local `WorkflowGraphNode` in `build-execution-context.ts` mirrors graph node `{ id, type, params }`.
- **uiSchema cast:** `as unknown as ExecutionContext<never>['uiSchema']` in `buildExecutionContext` — palette `resolveDefinition` return not narrowed to node-definitions shape.
- **Type re-export smell:** `bridge-outbound.ts` re-exports `LangflowerBridge` / `LangflowerClient` (call-site convenience, minor aggregator).

## Streamlining & simplifications

- Optionally merge the two `runner.events$` subscribers into one always-on pipeline (telemetry forward + checkpoint observe) to prevent future desync (see Design-flaw fixes).
- Replace local `WorkflowGraphNode` with `Pick<WorkflowNodePersisted, 'id' | 'type' | 'params'>` or the session graph node type.
- Narrow `resolveDefinition` / palette return so `uiSchema` needs no double cast.
- Align `BRIDGE.md` and `attach-langflower-bridge.ts` step-3 comment with actual wire order (`config`, `models` between palette and editor).
- Promote stale `it.todo` cases in `tests/integration/ws/ws-session-sync.ws.test.ts` to real tests now that broadcast paths exist.
- Document or log checkpoint persist failures instead of `.catch(() => undefined)` in `wire-runner-handlers.ts`.

## Design-flaw fixes

1. **Dual `events$` subscribers** — `attach-langflower-bridge.ts` forwards telemetry; `wire-runner-handlers.ts` separately observes checkpoints. Correct today but fragile: a third writer or reorder could reintroduce BUG-2026-07-14 class drops. **Fix direction:** single always-on composer subscribe that calls `forwardRunnerEvent` then checkpoint observe (sibling steps in one body).
2. **Docs/test drift on multi-tab workflow sync** — code broadcasts `workflow.current.snapshot` on load/create/copy/delete-active; integration still has open todos for load/list broadcast. **Fix direction:** implement todos or remove them; sync BRIDGE.md intent table with `wire-config-handlers` / `wire-models-handlers`.

## Findings

1. **Severity:** Important
    - **Path / symbol:** `attach-langflower-bridge.ts` (step 1) + `wire-runner-handlers.ts` (lines 79–131) — two `session.runtime.runner.events$` subscriptions
    - **Problem:** Telemetry fan-out and checkpoint persistence share one hot stream via independent subscribers. Ordering and “always-on before run start” is correct only by convention; easy to break when extending runner wiring.
    - **Proposed fix:** One root subscription with explicit sibling steps: forward → observe/persist → terminal checkpoint broadcast.

2. **Severity:** Suggestion
    - **Path / symbol:** `BRIDGE.md` § Attach order (lines 28–32)
    - **Problem:** Says fan-out goes to “every indexed client”; implementation uses `bridgeEmit` on bridge subjects (not per-client index). Omits `wire-config-handlers` and `wire-models-handlers` present in `attach-langflower-bridge.ts`.
    - **Proposed fix:** Update doc to match `bridgeEmit` semantics and full wire list.

3. **Severity:** Suggestion
    - **Path / symbol:** `attach-langflower-bridge.ts` comment (lines 37–38)
    - **Problem:** Comment lists `workflow → palette → editor → runner`; actual order is `workflow → palette → config → models → editor → runner`.
    - **Proposed fix:** Align comment with code (or reorder wires if doc order is canonical).

4. **Severity:** Suggestion
    - **Path / symbol:** `build-execution-context.ts` → `WorkflowGraphNode`; `uiSchema` cast (~line 162)
    - **Problem:** Local mirror type + `as unknown as` hide the real domain/`ExecutionContext` contract.
    - **Proposed fix:** Reuse shared/session graph node type; narrow `resolveDefinition` return.

5. **Severity:** Suggestion
    - **Path / symbol:** `bridge-outbound.ts` → `clientEmit` / `bridgeEmit`
    - **Problem:** Runtime cast to `Record<string, Subject<Payload>>` is unavoidable glue without typed emit API; type re-exports duplicate `langflower-bridge.types.ts`.
    - **Proposed fix:** Add typed emit helpers in `@langflower/websocket-bridge` (ADR + exit criteria); import types directly at call sites.

6. **Severity:** Suggestion
    - **Path / symbol:** `tests/integration/ws/ws-session-sync.ws.test.ts` — `it.todo('workflow.load binds graph…')`, `it.todo('saveCurrent broadcasts workflow.list.snapshot')`
    - **Problem:** Server now broadcasts via `syncAfterWorkflowMutation` (`bridgeEmit` for current + conditional list); todos imply unfixed behaviour and leave multi-tab workflow mutations unguarded in CI.
    - **Proposed fix:** Implement integration tests (outside this chunk’s edit scope).

7. **Severity:** Suggestion
    - **Path / symbol:** `wire-runner-handlers.ts` — `.catch(() => undefined)` on checkpoint persist/mark paths
    - **Problem:** Silent swallow hides disk/config failures during runs; harder to diagnose than a logged edge failure.
    - **Proposed fix:** Minimal structured log at transport edge or surface `runner.checkpointed` error fact.

8. **Severity:** Suggestion
    - **Path / symbol:** `wire-editor-handlers.ts` — `raw.payload as EdgeId` / `as NodeId`
    - **Problem:** Casts at inbound boundary instead of guard narrowing after `isInboundEvent<string>`.
    - **Proposed fix:** Small type guard or validate string shape before apply helpers.

## Non-issues / looked OK

- Thin composer: `buildExecutionContext` / `buildContextSeeds` / `bind-llm-context` inject-only; MCP dispose wired on session.
- Always-on telemetry subscription registered before connect/bootstrap (BUG-2026-07-14 lesson applied).
- `syncAfterWorkflowMutation` broadcasts `workflow.current.snapshot` and checkpoints; catalog broadcast on save/rename/copy/delete success.
- Single client registry (`client-index.ts` WeakMap); no parallel `clients` Map.
- `forwardRunnerEvent` + `bridgeEmit` for output/input/done; `emitPermissionAsk` broadcasts.
- Runner lifecycle, interrupt, resume success, feed clear (idle gate) patterns correct.
- Editor mutations broadcast deltas + `workflow.currentStatus.snapshot`; viewport no-op via `sameCanvasViewport`.
- Bootstrap order documented in `emit-bootstrap.ts` header; permission-ask replay on reconnect.
- Inbound guards minimal and typed; config save broadcasts redacted snapshot.
- Palette reload success broadcasts; compilation error unicast to requester (RPC-style — OK).
- Models refresh unicast (RPC-style — OK).
- No `withLatestFrom`, no barrel `index.ts`, no domain KB/crawl/MCP HTTP reimplementation in bridge.
- Unit tests: `forward-runner-event.test.ts`, `build-execution-context.test.ts` present.

**Return Status:** Critical=0 Important=1 Suggestion=7
