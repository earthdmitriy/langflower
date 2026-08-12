# Specification: LLM autokick and dead-loop recovery

**Status:** queued  
**Index:** [README.md](README.md)

## 1. Executive Summary & Intent

- **Problem Statement:** When an LLM provider stream goes idle or enters a token-repetition dead loop, Langflower today **suspends** the LLM loop and waits for human Steer/Resume (`streamIdleTimeoutMs` → `recoveryNotice` with `code: 'suspended'`). That leaves long-running agent workflows stuck until the user intervenes. The product needs automatic recovery: kick the model with a corrective message, optionally reconnect the stream with adjusted penalties, and detect cyclic/consecutive token repetition before it wastes tokens and time.
- **User Prompt Source:** `kick model when not responding for too long. re-connect and re-send entire context? + detect dead loops` (original `autokick.md` stub plus embedded pseudocode for `deadLoopGuardWithRecovery`).
- **External Context:** None. Reference draft algorithm preserved in § Appendix — dead-loop pseudocode.

## 2. Codebase Guardrails & Local Alignment

- **Designated Base Folder:** `packages/common-nodes/src/ai/llm-loop/`
- **Target Directories:**
  - `packages/common-nodes/src/ai/llm-loop/` — detection, recovery orchestration, policy knobs
  - `packages/common-nodes/src/ai/openai/` — optional wrapper around `createChatCompletionStream`
  - `packages/node-sdk/src/node-factory/define-llm-node/` — recovery notice types if new codes needed
  - `packages/common-nodes/src/ai/llm-recovery-ui-schema.ts` — Inspector fields
  - `docs/LLM_NODES.md`, `docs/use-cases/run-interruption.md` — product truth sync
- **Architectural Patterns & Boilerplates Enforced:**
  - Functional-reactive LLM loop: `runLlmLoop` expand + `reduceLlmLoop` scan; recoverable failures reduce to suspension, not Observable death ([`packages/common-nodes/AGENTS.md`](../../packages/common-nodes/AGENTS.md)).
  - Provider stream facts via `observeProviderStream` (`provider.reasoning|draft|done|idle|paused|failed`).
  - Expected failures as Results / recovery notices — no throws across the StatefulObservable boundary.
  - No new `@langflower/shared` types unless WS protocol changes (not expected for v1).
- **Pattern & Boilerplate Reference Baseline:**
  - [`packages/common-nodes/src/ai/llm-loop/operators/observe-provider-stream.ts`](../../packages/common-nodes/src/ai/llm-loop/operators/observe-provider-stream.ts): stream idle watchdog via RxJS `timeout({ first, each })` — extend or branch before suspend.
  - [`packages/common-nodes/src/ai/llm-loop/run-llm-loop.ts`](../../packages/common-nodes/src/ai/llm-loop/run-llm-loop.ts): transient retry from `roundCheckpoint`, `recoveryPackets`, `classifyLlmFailure`.
  - [`packages/common-nodes/src/ai/llm-loop/llm-loop-types.ts`](../../packages/common-nodes/src/ai/llm-loop/llm-loop-types.ts): `LlmRecoveryPolicy`, `DEFAULT_LLM_RECOVERY_POLICY`.
  - [`packages/common-nodes/src/ai/openai/create-chat-completion-stream.ts`](../../packages/common-nodes/src/ai/openai/create-chat-completion-stream.ts): AsyncIterable chunk mapping — natural wrap point for token-level dead-loop guard.
  - [`packages/node-sdk/src/node-factory/define-llm-node/recovery-notice.ts`](../../packages/node-sdk/src/node-factory/define-llm-node/recovery-notice.ts): `LlmRecoveryNotice`, `RECOVERY_PORT_ID`.
- **Third-Party Dependencies & Packages:** No new packages. Reuse existing `openai` client via server-bound `createChatCompletionStream`. Dead-loop detection is pure TypeScript (rolling hash over token deltas).
- **Frontend Presentation Strategy (If UI Affected):**
  - **Component Library Standards:** Feed already renders `recovery` role via work log — extend copy for autokick attempts (`code: 'autokick'` or reuse `retry` with distinct message).
  - **Styling & CSS Architecture Guardrails:** No new UI chrome for v1; recovery notices only.
- **Shared Utilities & Hooks:** `normalizeLlmRecoveryPolicy`, `llmRecoveryUiSchema`, `classifyLlmFailure`, `ChatCompletionStreamChunk` union.
- **Internationalization (i18n) Mechanics:** English-only recovery notice strings in node definitions and docs (project rule).
- **Environment Configuration (ENV):** Policy via node panel params and `LlmRecoveryPolicy` defaults — no new ENV vars for v1.

## 3. Deep System Mechanics & System Analysis

### A. Blast Radius & Impact Assessment

- **Affected Modules / Components:** LLM loop machine, provider stream observer, OpenAI stream adapter, recovery policy normalization, feed `recovery` presentation, Steer/Resume interaction (autokick must not fight manual steer).
- **Affected Files Inventory:**
  - **New Files:**
    - `packages/common-nodes/src/ai/llm-loop/dead-loop-detector.ts`: Rolling token window, consecutive/cyclic pattern detection, `DeadLoopError`.
    - `packages/common-nodes/src/ai/llm-loop/dead-loop-detector.test.ts`: Unit tests for repetition patterns.
    - `packages/common-nodes/src/ai/llm-loop/autokick-recovery.ts`: Orchestrate idle kick and dead-loop reconnect (append corrective user message, bump penalties, cap attempts).
    - `packages/common-nodes/src/ai/llm-loop/autokick-recovery.test.ts`: Recovery attempt limits, message append semantics.
  - **Changed Files:**
    - `packages/common-nodes/src/ai/llm-loop/llm-loop-types.ts`: Add policy fields (`autokickEnabled`, `maxAutokickAttempts`, `deadLoopDetection`, `autokickUserMessage`, penalty deltas).
    - `packages/common-nodes/src/ai/llm-loop/normalize-llm-recovery-policy.ts`: Normalize new fields.
    - `packages/common-nodes/src/ai/llm-recovery-ui-schema.ts`: Inspector toggles/thresholds.
    - `packages/common-nodes/src/ai/llm-loop/operators/observe-provider-stream.ts`: Optional branch — autokick before suspend on idle.
    - `packages/common-nodes/src/ai/llm-loop/run-llm-loop.ts`: Wire autokick recovery into loop expand; emit recovery notices on kick.
    - `packages/common-nodes/src/ai/openai/create-chat-completion-stream.ts`: Wrap outgoing AsyncIterable with dead-loop guard (or call shared wrapper).
    - `docs/LLM_NODES.md`, `docs/use-cases/run-interruption.md`: Document autokick vs Steer/Resume precedence.
  - **Deleted Files:** None.
- **Backward Compatibility Plan:** New policy fields default to **off** (preserve current suspend-only behavior). Existing workflows unchanged until users enable autokick in LLM node Inspector. Recovery notice shape extended additively; feed fold already handles `recovery` role.

### B. API, Data Contracts & DAL Strategy

- **Authoritative Source of Truth:** `LlmRecoveryPolicy` in `@langflower/common-nodes` + `ChatCompletionStreamChunk` in `chat-completion-stream.ts`. No WS protocol change for v1.
- **Data Access Layer (DAL) Pattern:** N/A — in-memory stream processing only.
- **Endpoints & Routes Impacted:** None (server binds credentials only via `bind-llm-context.ts`).
- **Data Contracts (Schemas & Type Specs):**
  - Extended `LlmRecoveryPolicy`:
    - `autokickOnIdle?: boolean` (default `false`)
    - `maxAutokickAttempts?: number` (default `2`)
    - `autokickUserMessage?: string`
    - `deadLoop?: { maxWindowTokens?: number; consecutiveThreshold?: number; minRepetitions?: number; minPatternTokens?: number }`
    - `autokickPenaltyDelta?: { frequency?: number; presence?: number }`
  - Internal `DeadLoopError`: `{ partialText, lastTokens, reason }`
  - Recovery stream signals via existing `LlmRecoveryNotice` on `recovery` port
- **Wrapper Strategy:**
  - Reuse: `createChatCompletionStream`, `observeProviderStream`, `runLlmLoop` checkpoint retry for transient HTTP failures.
  - Amend: wrap stream with dead-loop detector; extend idle handler to attempt autokick before suspend.
  - New: `deadLoopGuardWithRecovery` adapted to `ChatCompletionStreamChunk` (not raw OpenAI chunks).
- **Reverse Compatibility Risk Matrix:** Low — opt-in policy. Risk if autokick auto-resumes while user intended Pause — mitigate by checking `steerControl` pause state before kick.

### C. Security, Identity & Compliance

- **Authentication & Authorization:** Uses existing server-bound OpenAI credentials; no new auth surface.
- **Data Privacy & Multi-Tenancy:** Autokick appends user-visible corrective messages to in-flight conversation history — must not inject secrets. Log recovery attempts at debug level only.

### D. Dataflow Architecture & Evolution

- **State Lifecycle & Pipeline:**
  1. Provider emits draft/reasoning chunks → dead-loop detector inspects each delta.
  2. On loop detected OR idle timeout (if autokick enabled) → append partial assistant text + corrective user message to round messages.
  3. Re-invoke `createChatCompletionStream` with increased frequency/presence penalties (clamped [-2, 2]).
  4. Emit `recovery` port notice (`attempt`, `reason: 'dead-loop' | 'idle'`).
  5. After `maxAutokickAttempts`, fall back to existing suspend behavior.
- **State Authority:** `runLlmLoop` reducer owns committed history; partial loop text must not commit until round completes or recovery abandons.
- **Schema Evolution & Migration:** Panel param defaults only — no persisted workflow migration.

### E. Validations & Boundary Conditions

- **Input Validation Schemas:** `normalizeLlmRecoveryPolicy` clamps numeric thresholds (min attempts ≥ 0, window tokens ≥ 10).
- **Zero / Empty States:** Empty stream → no detector state; zero autokick attempts → immediate suspend (current behavior).
- **Extreme Constraints:** Very short patterns (1-token repeat) may false-positive — default `minPatternTokens: 2`, `consecutiveThreshold: 5`. Max recovery attempts prevents infinite reconnect loops.

### F. Concurrency & State Collisions

- **Race Condition Mitigation:** Autokick must abort if `steerControl` emits pause/steer during recovery setup. Single in-flight provider stream per LLM node instance (existing invariant).

### G. Error Handling & Resiliency

- **Expected Failure Modes:** Provider 429/5xx during recovery retry → classify via `classifyLlmFailure`, existing transient retry path. Dead-loop after max attempts → suspend with recovery notice. Non-DeadLoopError during detection → propagate unchanged.
- **Graceful Degradation:** Feed shows recovery notice; user can Steer manually if autokick exhausted.
- **Telemetry, Logging & Observability:** Debug log autokick attempt count and detection reason; no full prompt logging.

## 4. Verification & Definition of Done (DoD)

### A. Testing Strategy Matrix

- [X] **Unit Testing:** Dead-loop detector (consecutive + cyclic patterns), policy normalization, recovery message append, penalty clamping, max-attempt cutoff.
- [X] **Integration Testing:** Fake-LLM node emitting repeated tokens triggers autokick and completes; idle autokick resumes stream without human steer (when enabled).
- [ ] **E2E / Smoke Testing:** Manual OpenAI run deferred — fake-LLM covers CI.
- [X] **Manual Verification:** One real OpenAI workflow with autokick enabled confirms feed recovery notice and continued output.

### B. Manual Verification Script

#### Test Case 1: Dead-loop autokick recovers stream

- **Prerequisites:** Workflow with `common-fake-llm` configured to emit cyclic text; autokick enabled in recovery policy.
- **Step-by-Step Actions:**
  1. Start workflow run.
  2. Observe feed during repeated token output.
  3. Wait for autokick recovery notice.
  4. Confirm subsequent non-repeating completion.
- **Expected Inputs / Payloads:** Fake-LLM dead-loop fixture.
- **Expected Output / Observable Result:** `recovery` port notice with autokick reason; run completes without manual Steer.

#### Test Case 2: Autokick disabled preserves suspend

- **Prerequisites:** Same workflow; autokick off (default).
- **Step-by-Step Actions:**
  1. Trigger stream idle or loop.
  2. Observe feed and composer.
- **Expected Output / Observable Result:** Suspended recovery notice; Steer composer opens — no automatic reconnect.

### C. Functional Requirements Checklist

- [ ] Detect consecutive identical token deltas above configurable threshold.
- [ ] Detect cyclic token patterns (min pattern length × min repetitions) with hash + exact confirm.
- [ ] On dead loop (when enabled): append partial assistant + corrective user message, reconnect stream with penalty bump, cap attempts.
- [ ] On stream idle (when `autokickOnIdle`): attempt reconnect before suspend.
- [ ] Emit recovery notices on each autokick attempt via existing `recovery` port.
- [ ] Fall back to current suspend behavior after max attempts or when autokick disabled.
- [ ] Inspector exposes autokick and dead-loop policy fields with safe defaults (off).
- [ ] Unit + integration tests green; **`npm run test`** (full suite) passes at close-out.

### Verify

- Intermediate (optional): `node build/tools/agent-run.mjs verify --quick` while iterating on detector unit tests.
- **Close-out (required):** `npm run test` or full `node build/tools/agent-run.mjs verify` — unit and integration.

---

## Appendix — dead-loop pseudocode (reference)

Original draft algorithm for `deadLoopGuardWithRecovery` — adapt to `ChatCompletionStreamChunk` rather than raw OpenAI chunks:

- Rolling token window with cyclic hash comparison
- `DeadLoopError` with `partialText` and `lastTokens`
- Recovery: append assistant partial + user corrective message, increase frequency/presence penalties, restart stream
- Custom finish signal before reconnect (map to internal recovery fact, not WS protocol)

See git history of this file for full TypeScript pseudocode.
