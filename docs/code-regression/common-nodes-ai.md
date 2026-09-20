# Code regression — common-nodes-ai

## Meta

- Paths: `packages/common-nodes/src/ai/`
- Date: 2026-09-20
- Mode: delta
- Coverage: Reconciled every 2026-09-19 finding against current source. Deep-read: `features/llm-session/{llm-session-shell,run-session-machine}.ts` (+ machine test header), `features/llm-loop/{inventory-tool-round,run-llm-loop,run-agent-loop,dead-loop-detector,autokick-recovery}.ts`, `features/llm-loop/operators/observe-provider-stream.ts`, `features/path-choice/bind-path-choice-session.ts`, `features/llm-role-preset.ts` (+ test), `features/llm-run-host.ts`, `features/chat-completion-stream.ts`, `features/openai/create-chat-completion-stream.ts` (`isHostBoundChatFactory`), `nodes/{openai-llm,fake-llm,sub-agent}/node.ts`, `ai/NODE.md`. Spot-checked: no `ai/openai/` tree, no `ai/features/run-host-services.ts`, no `index.ts`, no `withLatestFrom` / `shareReplay` / `skipBoundChatCompletionStream` / `enabledToolIds` production symbols. ts-scan: `runLlmSessionMachine` callers = 0; `LlmSessionPreparation` refs only inside `run-session-machine.ts`; `skipBoundChatCompletionStream` / `getLlmRunHostServices` unresolved. Not line-by-line: compaction tables, every `*.test.ts` / `NODE.md`.
- Previous report: 2026-09-19 — Critical=0 Important=3 Suggestion=4

## Previous findings (delta mode)

| id                                  | severity   | status     | evidence                                                                                                                                                                                                                                                                          |
| ----------------------------------- | ---------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `llm-session-machine-dead-export`   | Important  | fixed      | Closed 2026-09-20 — see LEDGER.                                                                                                                                                                                                                                                   |
| `sub-agent-tap-history`             | Important  | still-open | `nodes/sub-agent/node.ts` still writes `latestContext` in `tap` (~595–596) and `history` in loader + `tap` (~516, 528–529).                                                                                                                                                       |
| `permission-floor-twin-without-adr` | Important  | still-open | `ProjectPermissionConfig` / `DEFAULT_HARNESS_PERMISSION` / `toolFloorDecisionForUi` / `isHarnessToolAlwaysDenied` still in `llm-role-preset.ts`. ADR-039 table still omits this pair. `llm-role-preset.test.ts` still gates only `HARNESS_BUILTIN_TOOL_IDS` ↔ `BUILTIN_TOOL_IDS`. |
| `sub-agent-fatal-as-value`          | Suggestion | still-open | `runSubAgentTurn` `catchError` (~341–347) and timeout `catchError` (~536–545) still map fatal failures into `response` + `invokeDone` values via `fail()` / `failTimedOut()`.                                                                                                     |
| `inventory-allowlist-docs-ghost`    | Suggestion | still-open | Default `notInAllowlistText` still says “not in the enabled allowlist” (`inventory-tool-round.ts` ~74–77). Not a reopen of LEDGER `legacy-enabled-tool-ids` (that API stayed deleted).                                                                                            |

## Principles check

- **No barrels / no `withLatestFrom` / no `@langflower/shared` — PASS.** Zero `index.ts` under `ai/`. No `withLatestFrom`. Session cycle is ADR-016 `startWith` + `concatMap`.
- **Thin server / host I/O not in `bind` — PASS.** HTTP stays in `features/openai/`. Catalog binds read `ec.chat` (openai / fake / path-choice / sub-agent). `ai/features/run-host-services.ts` stayed deleted. Epic 48: `llm-run-host.ts` is types-only (`LlmRunHostServices`); attach/get lives in `src/run-host/` (other chunk). Not a defect.
- **Composer entry — PASS.** `bindLlmAgentSession` / `bindPathChoiceSession` list assemble → cycle → demux. Sub-Agent reuses `assembleLlmAgentInventoryContext` only (documented).
- **Hot session / no extra multicast — PASS.** No `shareReplay` on `createLlmSessionCycle$`.
- **Delete obsolete — PASS.** `runLlmSessionMachine` deleted 2026-09-20 (LEDGER). `runTurnFromState` stays.
- **Tap not a reducer — FAIL (`two-writers`).** Sub-Agent still mutates `history` / `latestContext` in `tap` (Finding `sub-agent-tap-history`).
- **No fake port events — FAIL (`false-ready`) on Sub-Agent only.** Agents / Review / Critique still refuse missing factory via stream `error`. Sub-Agent still synthesizes successful port values from fatal loop/timeout errors.
- **DAG twins — FAIL (`twin-without-adr`).** Permission-floor copy still unlisted in ADR-039 and still has no floor-function parity test.
- **`type` / arrows — PASS** on sampled production modules (`async function*` only in the OpenAI SDK iterator).

## FOUND_BUGS signals

none

Held (not recurrences): BUG-2026-07-19b invoke still rejects unknown names before `handle.invoke`; BUG-2026-07-19 / 08-27 cycle is `statefulObservable` + `concatMap` (agents `primeTurn0: true`); BUG-2026-07-21d no cycle `shareReplay`; BUG-2026-07-21c Fake sentence chunks + `DEFAULT_TOKEN_DELAY_MS = 40`; BUG-2026-07-22d Fake prefers scripted turns / skips host-bound OpenAI via `isHostBoundChatFactory` (`skipBoundChatCompletionStream` stayed deleted); BUG-2026-08-18b Sub-Agent input is `invoke$`, not a chunk Subject; BUG-2026-08-31 `structuralRunCap` + letter class still in `dead-loop-detector.ts`.

## Glue / adapters / parallel types

- **`LlmFeedbackSessionPrep` vs `LlmSessionPreparation` — still a same-package twin.** Production uses the first; the machine type is unused outside `run-session-machine.ts` (Finding `llm-session-machine-dead-export`).
- **Permission-floor copy — `twin-without-adr`.** `ProjectPermissionConfig` / `toolFloorDecisionForUi` / `isHarnessToolAlwaysDenied` vs tools `PermissionConfig` / `toolFloorDecision` / `isToolAlwaysDenied`. ADR-039 does not list this pair; ids have a parity test, floor helpers do not (Finding `permission-floor-twin-without-adr`).
- **ADR-backed / intentional, not flagged:** `toOpenAiMessages` (domain → OpenAI SDK); `HARNESS_BUILTIN_TOOL_IDS` ↔ tools `BUILTIN_TOOL_IDS` (parity test exists); `defineLlmNode` author factory; `LlmRunHostServices` types-only peek type so non-AI nodes never import the chat-stream module.
- **Leftovers that stayed deleted:** `ai/openai/` source tree; `ai/features/run-host-services.ts`; `enabledToolIds`; `filterEnabledRegistrations`; `skipBoundChatCompletionStream`; cycle `shareReplay`; `RunLlmLoopOptions.harness`.

## Streamlining & simplifications

none

(`runLlmSessionMachine` deleted 2026-09-20. `runTurnFromState` / `LlmSessionState` stay.)

## Design-flaw fixes

none

(Remaining open items are Important / Suggestion. No Critical hang / data-loss / overlapping-start sequence named this run.)

## Findings

1.  - id: `sub-agent-tap-history`

- class: two-writers
- severity: Important
- first-seen: 2026-09-19
- status: open
- path: `packages/common-nodes/src/ai/nodes/sub-agent/node.ts` `bind` — `latestContext` (~472, 555, 595–596), `history` (~473, 516, 528–529)
- evidence: Loader assigns `history = seedInvokeHistory(...)`. `tap` then writes `history = reduceInvokeHistory(...)`. A second `tap` on `specialistTools$` writes `latestContext`, which `enqueueInvoke` reads (`latestContext ?? announced`). Two assignments own one session concern; `tap` is not on the REACTIVITY telemetry allow-list.
- proposed fix: Carry history on the paced invoke session (seed + reduce in the loader / `scan`, not `tap`). Re-read live context at invoke time instead of caching via `tap`.

2.  - id: `permission-floor-twin-without-adr`

- class: twin-without-adr
- severity: Important
- first-seen: 2026-09-19
- status: open
- path: `packages/common-nodes/src/ai/features/llm-role-preset.ts` — `ProjectPermissionConfig`, `DEFAULT_HARNESS_PERMISSION`, `toolFloorDecisionForUi`, `isHarnessToolAlwaysDenied`
- evidence: File comments call these a structural twin of tools `PermissionConfig` / `DEFAULT_PERMISSION_CONFIG` / `toolFloorDecision` / `isToolAlwaysDenied`. ADR-039’s table still lists only wired-tool catalogs, secret-id, MCP entries, stdio framing, and pack compile errors. `llm-role-preset.test.ts` still asserts id-list parity only.
- proposed fix: Add the twin + exit (“DAG flips or shared-safe owner”) to ADR-039 and a floor-function parity test against tools, **or** move the UI-safe floor helpers to a package UI already imports. Do not import `@langflower/tools` from UI.

3.  - id: `sub-agent-fatal-as-value`

- class: false-ready
- severity: Suggestion
- first-seen: 2026-09-19
- status: open
- path: `packages/common-nodes/src/ai/nodes/sub-agent/node.ts` — `runSubAgentTurn` `catchError` (~341–347); `withInvokeDeadline` `catchError` (~536–545); `fail()` (~252–260)
- evidence: Missing config already becomes value chunks (`Error: …`). Fatal `runAgentLoop` / timeout errors are mapped to the same `response` + `invokeDone` success values. OpenAI / Review put that class on the StatefulObservable error lane. Canvas chrome stays green; parent invoke still gets a string (tool contract).
- proposed fix: Keep the invoke `Promise<string>`, but error `cycle$` (or emit `recoveryNotice` then error) on fatal failures so specialist chrome matches other LLM nodes.

4.  - id: `inventory-allowlist-docs-ghost`

- class: docs-ghost
- severity: Suggestion
- first-seen: 2026-09-19
- status: open
- path: `packages/common-nodes/src/ai/features/llm-loop/inventory-tool-round.ts` `invokeInventoryTool` default `notInAllowlistText` (~74–77)
- evidence: Default copy still teaches “enabled allowlist.” Production gate is live inventory + `toolCtx.authorize`. LEDGER `legacy-enabled-tool-ids` stays closed (symbol deleted; Review/Critique tests still assert Inspector fields omit it).
- proposed fix: e.g. “Tool «…» is not in this node’s inventory.”

## Non-issues / looked OK

- **LEDGER `legacy-enabled-tool-ids` / `legacy-filter-enabled-registrations` — do not reopen.** Production tree has neither symbol. Tests only assert Inspector fields omit `enabledToolIds`.
- **`skipBoundChatCompletionStream` stayed deleted.** ts-scan unresolved. Fake `resolveSessionFactory` uses `isHostBoundChatFactory` + scripted turns; comment no longer names the deleted flag.
- **Epic 48 `llm-run-host` split — not a defect.** `ai/features/llm-run-host.ts` is the LLM bag _type_ only. Nodes read `ec.chat`. `buildAgentToolCtx` import from `src/run-host/` is the intended owner (chunk `common-nodes-rest`).
- **Session vs loop vs policy stacks.** Session = turns/history; `runLlmLoop` = one completion + tools; `runAgentLoop` / `runPathChoiceToolLoop` = policies. Sub-Agent invoke `concatMap` is the BUG-2026-08-18b fix, not a rival cycle.
- **`observeProviderStream` `tap`** only aborts the provider (host edge). Stream `catchError` emits `provider.failed`; `endWith` missing-done is a typed failure fact.
- **`toOpenAiMessages` / list-models client** — vendor boundary. `listProviderModels` returns `{ models, error }`.
- **Control tools do not leak into inventory** (`control-tools.ts` + leakage test, not re-audited line-by-line).
- **`HARNESS_BUILTIN_TOOL_IDS` parity test exists** — keep; do not import tools from UI.
- Duplicated `toolLabel` / `requireChatConfig` / `ReactiveBindHelpers` and `withInvokeDeadline`’s custom Observable: working copies; deliberately not findings.
- No production `withLatestFrom`; no barrels; no `@langflower/shared`.
