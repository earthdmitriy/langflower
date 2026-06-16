# Code regression — common-nodes-ai

## Meta

- Paths: `packages/common-nodes/src/ai/`
- Date: 2026-07-22
- Coverage: Representative sample — `define-llm-node/` (factory + inventory ports), `llm-session-shell.ts`, `inventory-tool-round.ts`, `openai-llm/node.ts`, `fake-llm/node.ts`, `review/{node,run-review-tool-loop}.ts`, `run-internal-tool-loop.ts`, `wait-for-subagent-result.ts`, `merge-tool-inventory.ts` / `filter-enabled-registrations.ts` / `resolve-mcp-inventory.ts`, `tool-registration.ts`, `llm-role-preset.ts`, `sub-agent/{node,protocol}.ts`, `chat-input/node.ts`, `mcp-server/node.ts`, `openai/create-chat-completion-stream.ts`, `build-effective-system-prompt.ts`, `llm-panel-ui-schema.ts`. Tests skimmed for FOUND_BUGS regression hooks only; not every line of `*.test.ts` or every OpenAI helper.

## Principles check

- **PASS — no barrels:** no `index.ts` under `ai/`; concrete imports throughout.
- **PASS — `type` not `interface`:** sampled production modules use `type` aliases only.
- **PASS — arrow-first style:** node factories and helpers are `const … = (…) =>`; `async function*` only where the language requires it (`fake-llm/node.ts`, `openai/create-chat-completion-stream.ts`).
- **PASS — no `withLatestFrom`:** none in production `ai/`; feedback cycles use ADR-016 `startWith` + `concatMap` in `llm-session-shell.ts` `createLlmSessionCycle$`.
- **PASS — no raw `combineLatest` in binds:** all sampled binds use `combineInputs` / `combineStatefulObservables` (`llm-session-shell.ts`, `review/node.ts`, `sub-agent/node.ts`, `mcp-server/node.ts`, `chat-input/node.ts`).
- **PASS — thin server / ownership:** unbound OpenAI client in `ai/openai/`; inventory/tool-loop domain in common-nodes; MCP tool ids from `@langflower/tools/mcp-tool-id` (`resolve-mcp-inventory.ts`).
- **PASS — composer entry points:** `bindLlmAgentSession` (`llm-session-shell.ts` ~377–479) lists bind steps in order; `defineLlmNode` wraps inventory injection with assertions (`define-llm-node.ts` ~71–102).
- **PASS — ToolHandlerContext field parity:** `toolCtx: ec` at call sites (`llm-session-shell.ts` ~198, `review/node.ts` ~345); no `toolHandlerContextFromEc` mapper remains.
- **PASS — package boundary:** no `@langflower/shared` imports in `ai/`.
- **PASS — shared inventory tool-round core:** `inventory-tool-round.ts` consumed by `run-internal-tool-loop.ts` and `review/run-review-tool-loop.ts`.
- **PASS — invoke allowlist:** `invokeInventoryTool` rejects unknown tool ids at invoke time (BUG-2026-07-19b mitigation).
- **PARTIAL — immutability:** domain payloads are readonly; bounded imperative accumulators remain in stream assembly (`openai/create-chat-completion-stream.ts` `mergeToolCallDelta` ~63–88; `llm-session-shell.ts` `createLlmSessionCycle$` closed-over `history` + `tap` ~279–304).

## FOUND_BUGS signals

- **BUG-2026-07-19b** (inventory filter ≠ invoke gate) — **mitigated** via `invokeInventoryTool` allowlist in both tool loops; keep when adding invoke paths.
- **BUG-2026-07-19** (`defaultValue` not a cycle primer) — **mitigated** via ADR-016 `createLlmSessionCycle$` shared by OpenAI + Fake.
- **BUG-2026-07-21d** (passthrough/demand) — **partially mitigated** in `review/node.ts`: `result` is in `combineInputs` driving `cycle$` (~300–348), not `withLatestFrom`. **Residual:** `shareReplay({ refCount: true })` on agent/review cycles still ties upstream demand to at least one subscribed demuxed output (same design-flaw class as HITL `preview` demand driver).
- **BUG-2026-07-21c** (per-token demo latency) — Fake tokenizes by sentence chunks; `DEFAULT_TOKEN_DELAY_MS = 40` retained; regression tests assert timely `response`.
- **BUG-2026-07-19c** (brace-glob mismatch) — Plan/Explorer write globs split in `llm-role-preset.ts` ~97–108.
- **BUG-2026-07-22d** (Fake forced into OpenAI resolve) — **mitigated** in `fake-llm/node.ts` `resolveSessionFactory` (~304–312): scripted factory preferred; EC factory is test-only path per comment.
- **BUG-2026-07-15c** (`@rx-evo` merge-of-raw$ gap) — historical Sub-Agent idle
  `toolLog`/`subagent` EMPTY loaders were a hub workaround; retired when Sub-Agent
  became an in-node agent (real inventory outs only).

## Glue / adapters / parallel types

- **Intentional provider adapter (OK):** `openai/create-chat-completion-stream.ts` `toOpenAiMessages` — domain `ChatCompletionMessage` → OpenAI SDK params; belongs here per AGENTS.md; no `*Adapter` name.
- **Parallel encode/parse:** ~~`ai/mcp-tool-id.ts`~~ **addressed** — deleted; owner `@langflower/tools/mcp-tool-id`; shared twin + parity test outside this chunk.
- **Field-reshuffle glue:** ~~`toolHandlerContextFromEc`~~ **deleted** — `ToolHandlerContext` uses `createEmbedding` + `harness`; LLM/Review pass `ec` as `toolCtx`.
- **Thin type re-export:** `tool-registration.ts` re-exports `ToolRegistration` / `ToolHandlerContext` from node-definitions while owning flatten helpers — mild aggregator smell.
- **Documented boundary twin (acceptable):** `HARNESS_BUILTIN_TOOL_IDS` in `llm-role-preset.ts` (~43–52) mirrors tools/shared catalogs so UI avoids bundling Node harness builtins — comment + parity tests elsewhere.
- **Documented shape mirror (acceptable):** `RolePermissionPosture` in `llm-role-preset.ts` mirrors project `permission` for role overlays — single merge site in server docs.
- **No `*Adapter` / `*Mapper` types** found by name.

## Streamlining & simplifications

- ~~Extract shared helpers from the two tool loops~~ **done** — `inventory-tool-round.ts`.
- ~~Extract LLM session shell~~ **done** — `bindLlmAgentSession` + `demuxByKind`.
- ~~Remove `compactForApi` identity stub~~ **done** — inline `[...messages]` in `openai-llm/node.ts`.
- ~~Unify MCP tool-id sources~~ **done** — tools owner import in `resolve-mcp-inventory.ts`.
- Reuse `assembleLlmAgentInventoryContext` (or a Review-specific wrapper) from `review/node.ts` instead of duplicating harness/MCP merge (~314–340).
- Drop type-only re-exports from `tool-registration.ts`; import from `@langflower/node-sdk` at consumers.
- Optionally extract provider-local duplicates (`formatList`, `toolLabel`, `requireChatConfig`, reasoning builders) only if a third consumer appears — YAGNI until then.

## Design-flaw fixes

1. ~~**Dual MCP tool-id sources**~~ **addressed** — tools owner; common-nodes imports tools.
2. ~~**ToolHandlerContext naming split**~~ **addressed** — field parity; mapper deleted.
3. ~~**Fake scripted multi-turn ≠ OpenAI history**~~ **addressed** — session-scoped history + factory in `fake-llm/node.ts` `prepareSession` / `runTurn`.
4. **Demand = output subscription** — agent/review `shareReplay` cycles pull upstream only while a demuxed output stays subscribed (BUG-2026-07-21d class). Prefer an explicit always-on demand driver (e.g. passthrough observability port or documented output set that must stay wired) if future output pruning is planned.
5. **Review inventory assembly fork** — `review/node.ts` reimplements harness/MCP/tool merge parallel to `assembleLlmAgentInventoryContext` without role-preset allowlist (`enabledToolIds: undefined`). Drift risk when inventory rules change.

## Findings

1. **Severity:** Important — **addressed (2026-07-22)**  
   **Path / symbol:** `inventory-tool-round.ts` ← `run-internal-tool-loop.ts` + `review/run-review-tool-loop.ts`  
   **Problem:** Parallel inventory invoke + spawn_subagent implementations; drift risk for allowlist / abort / serial spawn (BUG-2026-07-19b class).  
   **Fix applied:** Shared `toChatToolDefinitions` / `parseToolArgs` / `previewToolLogText` / `invokeInventoryTool` / `runSpawnSubagentRound`; Review keeps accept/feedback control routing.

2. **Severity:** Important — **addressed (2026-07-22)**  
   **Path / symbol:** `llm-session-shell.ts` ← `openai-llm/node.ts` + `fake-llm/node.ts` (+ Review demux)  
   **Problem:** Near-duplicate inventory assembly, ADR-016 feedback session, and five-way chunk demux.  
   **Fix applied:** Composer `bindLlmAgentSession`; providers supply `extendContext` / `prepareSession` / `runTurn` only; `demuxByKind` shared with Review.  
   **Residual:** Review still owns a separate inventory `combineInputs` block; provider-local reasoning copy remains.

3. **Severity:** Important — **addressed (2026-07-22)**  
   **Path / symbol:** ~~`ai/mcp-tool-id.ts`~~ deleted; `@langflower/tools/mcp-tool-id`  
   **Problem:** Parallel encode/parse (package-boundary workaround).  
   **Fix applied:** common-nodes imports tools owner; shared twin + parity test in tools package.

4. **Severity:** Important — **addressed (2026-07-22)**  
   **Path / symbol:** ~~`tool-handler-context.ts` / `toolHandlerContextFromEc`~~ deleted  
   **Problem:** Glue reshaping `ExecutionContext` into `ToolHandlerContext`.  
   **Fix applied:** Field names match EC; LLM/Review pass `ec` as `toolCtx`.

5. **Severity:** Important — **addressed (2026-07-22)**  
   **Path / symbol:** `fake-llm/node.ts` — tool-loop session `history` + `tap` append  
   **Problem:** Scripted Fake feedback turns did not accumulate assistant/tool history like OpenAI.  
   **Fix applied:** Session-scoped history + scripted/injected factory across feedback turns.

6. **Severity:** Important — **addressed (2026-07-22)**  
   **Path / symbol:** ~~`openai-llm/node.ts` `compactForApi`~~ deleted  
   **Problem:** Identity stub — obsolete parallel API per delete-obsolete principle.  
   **Fix applied:** Inlined `[...messages]` at tool-loop call site.

7. **Severity:** Important  
   **Path / symbol:** `review/node.ts` — inventory `combineInputs` (~300–347) vs `llm-session-shell.ts` `assembleLlmAgentInventoryContext` (~154–204)  
   **Problem:** Review reimplements harness builtin list, MCP resolve, wired flatten, and `mergeToolInventory` inline. OpenAI/Fake inherit role-preset `enabledToolIds`; Review hard-codes `undefined` (all tools). Any change to inventory merge rules must be edited twice.  
   **Proposed fix:** Export and reuse `assembleLlmAgentInventoryContext` with a Review-specific `enabledToolIds` policy (likely `undefined`), or add a small `assembleReviewInventoryContext` composer that delegates to the shared step.

8. **Severity:** Important  
   **Path / symbol:** `llm-session-shell.ts` `createLlmSessionCycle$` (~354); `review/node.ts` `cycle$` (~350–356)  
   **Problem:** `shareReplay({ bufferSize: 1, refCount: true })` means upstream inputs (including wired `result` / `feedback`) stay hot only while at least one demuxed output is subscribed. Pruning “unused” outputs can silently stop pulling upstream edges (BUG-2026-07-21d design-flaw class; HITL `preview` fix lives in `hitl/review-gate`, not here).  
   **Proposed fix:** Document required demand outputs per node, or add an explicit always-on passthrough/observability output; avoid relying on incidental subscribers.

9. **Severity:** Suggestion — **addressed (2026-07-22)** (boundary twin)  
   **Path / symbol:** `llm-role-preset.ts` — `HARNESS_BUILTIN_TOOL_IDS`  
   **Problem:** Hand-synced with tools/shared catalogs.  
   **Fix applied:** Kept local list with documented twin + parity via `wired-tool-options.parity.test.ts` (outside chunk).

10. **Severity:** Suggestion — **addressed (2026-07-22)**  
    **Path / symbol:** `llm-session-shell.ts` `demuxByKind`  
    **Problem:** Boilerplate demux when adding chunk kinds.  
    **Fix applied:** Shared helper; OpenAI/Fake/Review consume it.

11. **Severity:** Suggestion  
    **Path / symbol:** `tool-registration.ts` — `export type { ToolHandlerContext, ToolRegistration } from '@langflower/node-sdk'`  
    **Problem:** Type re-export aggregator; flatten helpers are the real module value.  
    **Proposed fix:** Import types from node-definitions at consumers; keep flatten/`toolRegistrationId` only.

12. **Severity:** Suggestion  
    **Path / symbol:** `openai/create-chat-completion-stream.ts` `mergeToolCallDelta` (~63–88); `llm-session-shell.ts` `createLlmSessionCycle$` (~279–304)  
    **Problem:** Local mutable Map / closed-over `history` mutation while assembling streams.  
    **Proposed fix:** Prefer immutable Map updates / explicit fold if touching these paths; otherwise acceptable as bounded stream-local state.

13. **Severity:** Suggestion  
    **Path / symbol:** `openai-llm/node.ts`, `fake-llm/node.ts`, `review/node.ts` — duplicated `formatList` / `toolLabel` / `requireChatConfig` / reasoning builders  
    **Problem:** Near-copy helpers across providers; drift in trace text and validation messages.  
    **Proposed fix:** Inline is fine per YAGNI until a third consumer; if extracting, colocate in `llm-session-shell.ts` next to `appendToolInventory`.

14. **Severity:** Suggestion  
    **Path / symbol:** `fake-llm/node.ts` — `runFakeToolLoopCycle` (~300) `as Observable<ToolLoopChunk>`  
    **Problem:** Cast papers over `concat` chunk union mismatch instead of typing `concat` inputs explicitly.  
    **Proposed fix:** Widen `runFakeToolLoopCycle` return to `Observable<FakeLlmChunk>` without cast, or map tool-loop chunks to `FakeLlmChunk` in `pipe(map(...))`.

15. **Severity:** Suggestion  
    **Path / symbol:** `mcp-server/node.ts` — future CLI comment (~18)  
    **Problem:** Roadmap pointer in runtime node file (now links to `docs/TODO/mcp-server-cli-stdio.md`).  
    **Proposed fix:** Keep behaviour JSDoc only; track product intent solely in TODO/use-case docs.

## Non-issues / looked OK

- `defineLlmNode` inventory assertions prevent port redeclare/skip.
- Chat Input HITL entry (`chat-input/node.ts`) is minimal: `pipeValue(map(...))`, no extra fold.
- Sub-Agent registration/spawn/result wire types (`sub-agent-protocol.ts`) are domain contracts, not ToolRegistration mirrors.
- Allowlist filtering via `mergeToolInventory` + invoke-time reject is coherent after BUG-2026-07-19b.
- Role preset write globs already split (BUG-2026-07-19c fix present).
- `waitForSubagentResult` subscribe is an allowed edge (Promise bridge + AbortSignal teardown).
- Provider HTTP factories under `ai/openai/` match package ownership (not thin-server violation).
- `resolveSessionFactory` documents Fake vs scripted vs test-injection semantics (BUG-2026-07-22d mitigation).
- No production `withLatestFrom`; no `@langflower/shared`; no local `mcp-tool-id.ts` copy.
