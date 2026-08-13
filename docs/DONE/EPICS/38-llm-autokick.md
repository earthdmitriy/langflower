# Epic 38 — LLM autokick and dead-loop recovery

**Status:** landed  
**Depends on:** —  
**Index:** [README.md](README.md)  
**Source:** retired note `docs/TODO/autokick.md` (folded into this epic)  
**Feeds:** [run-interruption](../../use-cases/run-interruption.md) S6,
[LLM_RECOVERY](../../LLM_RECOVERY.md),
[LLM_NODES](../../LLM_NODES.md) Failure recovery  
(docs sync only — no use-case Status flip to Implementable)

## Goal

When an LLM provider stream goes **idle** or enters a **token-repetition dead
loop**, **abort the in-flight provider request** (stop overloaded generation),
then **restart the LLM generation session** with the **entire stored**
`roundCheckpoint` messages (worst case: provider restarted and lost KV /
context), wait with exponential backoff, append a kick user turn, and keep
retrying without opening Steer. The feed shows attempt count, time since last
retry, and time until the next retry.

This lives in the **shared LLM core** (`runLlmLoop` /
`observeProviderStream`) so **every** LLM-class node gets it: Agent
(`common-openai-llm` / `common-fake-llm`), Critique, Review, and Sub-Agent.
Do not reimplement per node.

Today idle with partial draft **suspends immediately**; empty idle uses a
small retry budget then Steer. Long-running workflows stay stuck. This epic
makes autokick the **default**.

## Problem (why now)

- `observeProviderStream` idle watchdog (`streamIdleTimeoutMs` via RxJS
  `timeout({ first, each })`) ends the attempt and the loop suspends.
- There is no detector for consecutive identical token deltas or cyclic
  token patterns, so a looping model can burn tokens until idle or a human
  Pause.
- Original prompt: _kick model when not responding for too long; reconnect
  and re-send context; detect dead loops_ (draft `deadLoopGuardWithRecovery`
  in the appendix).

## Out of scope

- **Do not** change WS protocol or add `@langflower/shared` types. Extend the
  existing `recovery` port payload only (`LlmRecoveryNotice` additive fields).
- **Do not** add ENV vars or new npm packages.
- **Do not** put loop detection, rolling hash, `DeadLoopError`, or autokick
  timers in `@langflower/server`, `@langflower/runtime`, or
  `@langflower/shared`. No new `runner.*` facts.
- **Do not** duplicate stuck / dead-loop logic in `openai-llm`, `fake-llm`,
  `critique`, `review`, or `sub-agent` node files. Those nodes already share
  `runLlmLoop`. Per-node copies are a bug.
- **Do not** wrap `create-chat-completion-stream.ts` with the detector.
  That factory is a dumb HTTP mapper and is **also** used for compaction
  summaries — a guard there would abort or false-trigger compaction.
- **Do not** throw `DeadLoopError` across the StatefulObservable / runtime
  error lane. Catch inside the LLM loop; emit a `recovery` port event.
- **Do not** put detector internals (`lastTokens`, window hashes, op
  counters) on the recovery payload or the wire.
- **Do not** auto-open Steer on autokick `'retry'` (that is Pause / off /
  finite-cap exhaustion only). Do **not** fake Pause by pushing
  `steerControl`.
- **Do not** fight manual Pause/Steer: if `steerControl` is paused, cancel
  backoff and do not autokick.
- **Do not** replay a Langflower **disk checkpoint**. Do **not** append
  uncommitted partial draft as assistant content (provider may have
  restarted and never produced it). Reconnect = new completion with the
  **entire Langflower-owned** `roundCheckpoint` `messages[]` plus kick user
  turn. See [LLM_RECOVERY.md](../../LLM_RECOVERY.md) two reconnect assumptions.
- **Do not** use Hard Stop (`interrupt 'cancel'`) as the provider stop.
  Optimistic stop is `AbortSignal` on the in-flight chat stream only.
- **Do not** claim live-OpenAI Implementable bars; Fake-LLM covers CI. One
  manual OpenAI check is allowed but not the close-out gate.
- **Do not** wrap raw OpenAI `ChatCompletionChunk` in the product path —
  adapt the appendix to `ChatCompletionStreamChunk`.
- **Do not** emit a per-second WS tick for the countdown — client ticks from
  `nextAttemptAt` / `lastAttemptAt` on the last recovery port event.
- **Do not** restructure `packages/common-nodes/src/ai/` (`nodes/` vs
  `features/`). Implement recovery at the current `ai/llm-loop/` paths.
  Layout cleanup is [epic 39](../../TODO/EPICS/39-ai-package-restructure.md) after this lands.

## In scope

- Dead-loop + idle autokick in the **shared LLM core**
  (`packages/common-nodes/src/ai/llm-loop/`), which **all** LLM-class nodes
  already run:

    | Node                                           | Path into the core                     |
    | ---------------------------------------------- | -------------------------------------- |
    | Agent (`common-openai-llm`, `common-fake-llm`) | `runAgentLoop` → `runLlmLoop`          |
    | Sub-Agent                                      | `runAgentLoop` → `runLlmLoop`          |
    | Critique                                       | `runPathChoiceToolLoop` → `runLlmLoop` |
    | Review                                         | `runPathChoiceToolLoop` → `runLlmLoop` |

    Detector (consecutive + cyclic, hash then exact confirm) is
    **LLM-loop-internal** state over **`reasoning` and `draft`** deltas —
    **on by default**. Default window **1000** tokens (configurable).
    Per-`push` work **O(window)**, not O(N²). Not a package export.

- Idle autokick **on by default**, same package: **abort provider signal
  immediately**, backoff wait **inside the node expand**, then new
  completion with **entire stored messages** + kick user turn.
- Outward communication **only** via existing inventory ports: `recovery`
  output (`feed.role: 'recovery'`) and `steerControl` input (ADR-032 HITL).
  Structured `'retry'` / `'suspended'` notices; feed banner ticks from the
  port payload. No new bus events.
- Exponential backoff: `60s × 2^(n-1)` clamped at 16 minutes
  (`1 → 2 → 4 → 8 → 16` min).
- Additive `LlmRecoveryPolicy` fields + `normalizeLlmRecoveryPolicy` +
  Inspector `llmRecoveryUiSchema` (defaults **on**; operators may disable).
  Penalty bump on reconnect remains in policy.
- Structured `'retry'` notices + **feed banner** that shows retry number,
  time since last retry, and time until next retry.
- Docs: autokick vs Steer/Resume precedence in `docs/LLM_RECOVERY.md`,
  `docs/LLM_NODES.md`, [feed-panel](../../features/feed-panel.md), and
  [run-interruption](../../use-cases/run-interruption.md) S6.

---

## Product locks

1. **Default on.** `autokickOnIdle` and `deadLoopEnabled` default **true**.
   Existing workflows pick this up from policy defaults (Inspector can turn
   either off → today's suspend path).
2. **Unlimited retries.** `maxAutokickAttempts` default **`0` = unlimited**.
   A positive `N` then `'suspended'` after _N_ reconnects. Do not default to
   a small cap.
3. **Exponential backoff between attempts.** Delay before reconnect _n_
   (1-based) is `min(autokickBackoffMs × 2^(n-1), autokickMaxBackoffMs)` with
   defaults `60_000` and `960_000` → **1, 2, 4, 8, 16 minutes** then clamp.
   First wait starts when idle/dead-loop is detected (after the idle
   watchdog), not as a second silent timeout on top of an immediate kick.
4. **Notice codes.** Keep `'retry' | 'suspended'`. Autokick uses `'retry'`
   plus structured timing fields. `'suspended'` only when autokick is off or
   a finite cap is exhausted (opens Steer). Do **not** add `'autokick'`.
5. **Feed transparency.** Recovery banner MUST show attempt number, time
   since last retry, and time until next retry. Tick in the UI from
   `lastAttemptAt` / `nextAttemptAt`. See [LLM_RECOVERY.md](../../LLM_RECOVERY.md)
   Feed contract.
6. **Reconnect payload (worst-case context).** Abort in-flight `signal`,
   then `prepareChatCompletion` / `createChatCompletionStream` with:
    - `messages` = entire `roundCheckpoint` (Langflower session store for
      this node; compacted history if compaction already ran)
    - plus `autokickUserMessage` as a **new user turn**
    - **not** uncommitted `partial.draft` as an assistant message
7. **Optimistic stop.** On idle or dead-loop, `AbortController.abort()`
   **immediately** (same as Pause), so an overloaded provider stops
   generating. Not Hard Stop. Dead connection → abort is a no-op; replay
   still heals a restarted provider.
8. **Penalties.** Add `autokickPenaltyDelta` × attempt index to
   `frequency_penalty` / `presence_penalty`, clamp `[-2, 2]`.
9. **Pause wins.** Abort autokick setup **and cancel the backoff timer** if
   `steerControl` emits pause/steer. One in-flight provider stream per LLM
   node instance (existing invariant).
10. **No secrets in the kick message.** Default copy is a fixed English
    corrective string; panel override must not be used to inject credentials.
11. **Boundary — shared LLM-loop core.** Rolling window, hashes, and
    `DeadLoopError` live only under
    `packages/common-nodes/src/ai/llm-loop/` (plus unit tests). Agent,
    Critique, Review, and Sub-Agent **must not** grow a second detector.
    They already share `runLlmLoop` (via `runAgentLoop` or
    `runPathChoiceToolLoop`). Wire the guard in `observe-provider-stream` /
    `run-llm-loop` (main generation stream only). Compaction and
    `createChatCompletionStream` stay detector-free. Not runtime primitives,
    not server watchdogs, not package exports.
12. **Communication — port events + existing HITL/feed meta.** The only
    autokick facts the rest of the system sees are:
    - `recovery` **output** events (`feed.role: 'recovery'`, hidden
      inventory port) with `LlmRecoveryNotice` (`retry` | `suspended` +
      timing fields)
    - `steerControl` **input** (ADR-032 HITL textarea) when the operator
      Pauses / Steers — never a synthetic pause from autokick
      HITL fold already opens Steer on `code: 'suspended'` by reading that
      **port value**. `'retry'` uses the same port and must **not** open
      HITL. Do not add `hitl:` on the recovery **output** (it is not a
      composer gate). Do not add `runner.autokick.*`.
13. **Session demux must not strip timing fields.** Today
    `llm-session-shell.ts` (Agent) maps `recoveryNotice` → `{ code, text }`
    only. Forward additive notice fields or the feed cannot tick. Critique,
    Review, and Sub-Agent have the same demux pattern — update **all**
    shells that project `recovery$`, not only the Agent.
14. **Penalty bump needs factory args.** `CreateChatCompletionStreamArgs`
    has no `frequency_penalty` / `presence_penalty` today. Extending those
    args stays in `@langflower/common-nodes` (openai factory + prepare).
    Fake-LLM may ignore them. Do not put penalties on the server bind.

Default kick copy:

> I notice you are repeating yourself. Please stop and provide a concise answer.

---

## Policy contract

Extend `LlmRecoveryPolicy` in
[`llm-loop-types.ts`](../../../packages/common-nodes/src/ai/llm-loop/llm-loop-types.ts)
(authoritative; no WS types):

| Field                           | Default                             | Notes                                                  |
| ------------------------------- | ----------------------------------- | ------------------------------------------------------ |
| `autokickOnIdle`                | **`true`**                          | Idle timeout → backoff kick                            |
| `deadLoopEnabled`               | **`true`**                          | Consecutive + cyclic detection                         |
| `maxAutokickAttempts`           | **`0`**                             | `0` = unlimited; positive `N` then suspend             |
| `autokickBackoffMs`             | `60_000`                            | Base; attempt _n_ waits `base × 2^(n-1)`               |
| `autokickMaxBackoffMs`          | `960_000`                           | Clamp (16 min)                                         |
| `autokickUserMessage`           | default copy above                  | Inspector string                                       |
| `autokickPenaltyDelta`          | `{ frequency: 0.3, presence: 0.3 }` | Per-attempt bump                                       |
| `deadLoop.maxWindowTokens`      | **`1000`**                          | Rolling window; Inspector; normalize clamp **10–8000** |
| `deadLoop.consecutiveThreshold` | `5`                                 | Identical consecutive deltas                           |
| `deadLoop.minRepetitions`       | `3`                                 | Cyclic repeats required                                |
| `deadLoop.minPatternTokens`     | `2`                                 | Avoid 1-token false positives                          |

`normalizeLlmRecoveryPolicy` clamps: attempts ≥ 0, window tokens **10–8000**,
penalties into `[-2, 2]`, thresholds ≥ 1, backoff ≥ 1s, max backoff ≥ base.

Extend `LlmRecoveryNotice` additively (`code` + `text` remain required):

| Field           | On `'retry'` autokick        |
| --------------- | ---------------------------- |
| `attempt`       | 1-based                      |
| `reason`        | `'idle'` \| `'dead-loop'`    |
| `lastAttemptAt` | Epoch ms; omit on first wait |
| `nextAttemptAt` | Epoch ms of next reconnect   |
| `backoffMs`     | This wait                    |

Internal `DeadLoopError`: `{ partialText, lastTokens, reason, channel }` —
loop-local, not a StatefulObservable error. `channel` is `'reasoning'` or
`'draft'`.

---

## Mechanics

1. Provider emits reasoning/draft chunks → **per-channel** detectors inspect
   each delta (reasoning loops must trip without waiting for draft).
2. On loop detected **or** idle timeout → **abort `signal` immediately**
   (optimistic stop). If steer is not paused: emit `recoveryNotice` on the
   existing `recovery` port (`feed.role: 'recovery'`), **wait** the backoff
   inside the expand, then new `prepareChatCompletion` from entire
   `roundCheckpoint` + kick user turn, bump penalties. No `runner.*` fact.
3. Repeat without a default cap. Finite `maxAutokickAttempts` then
   `'suspended'`. Autokick off → today's suspend (including today's
   “idle with partial → immediate suspend”).
4. Provider 429/5xx during a recovery retry → existing `classifyLlmFailure`
   transient path first (already resends full checkpoint messages); after
   that budget, join the autokick wait.
5. Empty stream → no detector state.

State authority stays in `runLlmLoop` / `reduceLlmLoop`: partial loop text is
feed telemetry and is **not** replayed after abort. Backoff wait is loop
state, not a Steer HITL.

---

## Blast radius

| Area                                                                     | Touch?                       | Notes                                                                 |
| ------------------------------------------------------------------------ | ---------------------------- | --------------------------------------------------------------------- |
| `packages/common-nodes/src/ai/llm-loop/dead-loop-detector.ts`            | **Yes — create**             | Private to llm-loop; not a package export                             |
| `packages/common-nodes/src/ai/llm-loop/autokick-recovery.ts`             | **Yes — create**             | Backoff + kick user turn; node-internal                               |
| `llm-loop-types.ts` / `normalize-llm-recovery-policy.ts`                 | **Yes**                      | New policy fields                                                     |
| `llm-recovery-ui-schema.ts`                                              | **Yes**                      | Inspector toggles/thresholds                                          |
| `operators/observe-provider-stream.ts`                                   | **Yes**                      | Immediate abort on idle / dead-loop; run detector here                |
| `run-llm-loop.ts` / `observe-provider-stream.ts`                         | **Yes**                      | Shared core for **all** LLM-class nodes                               |
| `llm-session-shell.ts` + Critique / Review / Sub-Agent `recovery$` demux | **Yes**                      | Pass through full `LlmRecoveryNotice` (today strips to `code`+`text`) |
| `openai-llm` / `fake-llm` / `critique` / `review` / `sub-agent` node.ts  | **No detector**              | Already call `runAgentLoop` or `runPathChoiceToolLoop` → `runLlmLoop` |
| `ai/openai/create-chat-completion-stream.ts`                             | **Penalties only if needed** | **No** detector wrap (compaction shares this factory)                 |
| `packages/node-sdk/.../recovery-notice.ts`                               | **Yes**                      | Additive timing fields; keep `feed.role: 'recovery'`                  |
| Feed work-log recovery banner                                            | **Yes**                      | Attempt + last/next from **port event** payload; local tick           |
| `@langflower/server` / `@langflower/runtime` / WS                        | **No**                       | No new handlers, timers, or `runner.*` facts                          |
| Use-case Status                                                          | **No**                       | Docs only; live Implementable bars stay open                          |

**Suggested new tests:** `dead-loop-detector.test.ts` (correctness +
**complexity**), `autokick-recovery.test.ts`, Fake-LLM integration for cyclic
**reasoning paragraphs** and draft, plus idle autokick. Package-boundary
unit: llm-loop detector is not imported from `packages/server` or
`packages/runtime`.

---

## Flaws closed in this revision

1. **Wrong layer:** wrapping `create-chat-completion-stream` would run the
   detector on **compaction** streams and leak loop policy into the HTTP
   adapter. Guard the **main** `observeProviderStream` only.
2. **Session demux drop:** `llm-session-shell` currently maps recovery to
   `{ code, text }` — timing fields would never reach the feed.
3. **Penalty args missing:** factory args have no frequency/presence
   penalties yet; extend them in common-nodes, not on the server bind.
4. **SO error leak:** `DeadLoopError` must not kill the node cycle.
5. **Per-node copy:** Agent / Critique / Review / Sub-Agent already share
   `runLlmLoop`. A second detector in a node file would miss siblings.

---

## Detector complexity (required)

Naive “for every new token, for every pattern length L, exact-compare slices”
is **O(N²)** or worse per stream and is **forbidden**.

**Algorithm lock**

- Scan domain is the rolling window **W** (`maxWindowTokens`, default 1000),
  never the unbounded stream length _N_.
- `push` is O(1) amortized (ring buffer + rolling hash).
- Cyclic check per `push`: **O(W)** rolling-hash lookups. Exact slice
  compare **only after a hash hit**, and at most once per detection (then
  throw / abort).
- Do **not** exact-compare every L on every token (that is O(W²) per push).

Expose a test-only op counter (hash lookups + exact-compare token visits)
on the detector, or an equivalent instrumentation hook. Production builds
must not log per-token.

**Performance / complexity cases** (same file as unit tests; fail the epic
if any is red):

1. **Op budget (unique stream).** Push `T = 8_000` distinct tokens with
   `W = 1000`. Hash lookups per `push` ≤ `c * W` (use `c = 8`). Total
   exact-compare token visits on this non-looping stream ≤ `T` (ideally
   ~0). Fail if total hash lookups grow like `T²`.
2. **Linear in stream length.** Same unique generator at `T = 2_000` and
   `T = 8_000`, fixed `W = 1000`. Total hash lookups at 8k / 2k must be
   **≤ 6** (expect ~4). Fail if the ratio is ≥ 12 (quadratic in _T_).
3. **Bounded in W.** Unique stream `T = 4_000` at `W = 250` vs `W = 1000`.
   Total lookups may grow ~linear in W, not W²: `(ops_1000 / ops_250) ≤ 8`
   (expect ~4).
4. **Paragraph reasoning loop.** Repeat a ~300-token paragraph (multi-sentence
   block, not a 2-token phrase) **3×** on the **reasoning** channel with
   default `W = 1000`. Must detect on or before the third repeat. Same
   fixture on **draft**.
5. **No quadratic exact path.** A stream engineered so hashes collide often
   (e.g. many similar blocks) still stays within the per-`push` hash budget
   in (1); exact compares must not run for every L.

These are **unit** tests (deterministic counters), not live OpenAI. Wall-clock
is optional and must not be the sole gate (CI noise).

---

## Acceptance criteria

1. Consecutive identical deltas (reasoning **or** draft) at/above
   `consecutiveThreshold` raise `DeadLoopError` with `partialText`,
   `lastTokens`, and `channel`.
2. Cyclic patterns (`minPatternTokens` × `minRepetitions`) detect via rolling
   hash then exact slice confirm (no hash-only match), including
   **paragraph-length** blocks inside the default 1000-token window.
3. **Defaults:** autokick idle + dead-loop detection **on**;
   `maxWindowTokens === 1000` (Inspector-configurable, clamp 10–8000);
   `maxAutokickAttempts === 0` means unlimited reconnects (no auto-Steer).
4. Detector complexity cases in **Detector complexity** are green (O(W) per
   push, not O(N²)).
5. Backoff before reconnect _n_ is `min(60s × 2^(n-1), 16 min)` unless
   Inspector overrides base/max.
6. On idle or dead-loop, the in-flight provider `AbortSignal` aborts
   **before** backoff (not Hard Stop). Reconnect sends the **entire**
   `roundCheckpoint` messages plus kick user turn — **not** uncommitted
   partial draft as assistant content.
7. Each wait/reconnect emits `'retry'` with `attempt`, `reason`,
   `nextAttemptAt`, and `lastAttemptAt` when a prior reconnect exists.
8. Feed recovery banner shows retry number, time since last retry, and time
   until next retry, ticking locally. `'retry'` does not open Steer.
9. Pause/Steer cancels the backoff timer, aborts the provider signal, and
   does not autokick behind HITL.
10. Inspector exposes `maxWindowTokens` (default 1000) and can turn
    autokick/detection off or set a finite cap; off / cap exhausted →
    today's `'suspended'` + Steer.
11. Docs (`LLM_RECOVERY.md`, feed-panel, `LLM_NODES.md`, run-interruption S6)
    state abort + full-store replay, default autokick, backoff, feed timers,
    window 1000 / reasoning loops, shared LLM-loop core for all LLM-class
    nodes, and Steer precedence.
12. **Boundaries:** detector lives once in `llm-loop` and covers Agent,
    Critique, Review, and Sub-Agent; it is not imported by
    server/runtime/shared; `create-chat-completion-stream` is not wrapped;
    `DeadLoopError` does not enter the SO error lane; recovery timing
    fields survive **every** session demux onto `recovery`; no new
    `runner.*` events.
13. Close-out gate green (below).

## Verify

- Intermediate (optional): focused vitest on
  `packages/common-nodes/src/ai/llm-loop/**` (include detector complexity
  cases) and `verify --quick` while iterating.
- **Close-out (required):** `npm run test` or full
  `node build/tools/agent-run.mjs verify` — unit **and** integration,
  including detector complexity tests. Do not mark the epic done on
  `--quick` alone.

### Manual (not close-out)

1. **Dead-loop recovers:** Fake-LLM cyclic **paragraph** on reasoning (and a
   draft variant); defaults → recovery banner → non-repeating completion,
   no human Steer.
2. **Autokick off preserves suspend:** same fixture, autokick off →
   `'suspended'` + Steer composer, no automatic reconnect.

## Follow-up

After this lands, [epic 39](../../TODO/EPICS/39-ai-package-restructure.md) moves catalog
nodes to `ai/nodes/` and the shared core to `ai/features/` (named slices).
Do not fold that rename into this PR.

---

## Appendix — dead-loop pseudocode (reference)

Draft algorithm for `deadLoopGuardWithRecovery`. **Adapt** to
`ChatCompletionStreamChunk` inside **`llm-loop`**, not the OpenAI factory.
Do not yield a fake OpenAI `loop_detected` chunk on the wire — map to a
`recoveryNotice` port event. Do not wrap `createChatCompletionStream`
(compaction uses it).

- Rolling token window with cyclic hash comparison
- `DeadLoopError` with `partialText` and `lastTokens`
- Recovery: **abort** the in-flight stream, then new completion with
  **entire stored messages** + user corrective message (do **not** append
  uncommitted assistant partial). Increase frequency/presence penalties.

```
import OpenAI from 'openai';
import { ChatCompletionChunk } from 'openai/resources/chat/completions';

/* ── Rolling hash and dead‑loop detection (unchanged core) ── */
class RollingTokenHash {
  // (same as previous implementation – omitted for brevity)
}

export class DeadLoopError extends Error {
  constructor(
    message: string,
    public readonly partialText: string,
    public readonly lastTokens: string[]
  ) {
    super(message);
    this.name = 'DeadLoopError';
  }
}

export interface DeadLoopDetectorOptions {
  maxWindowTokens?: number;        // default 1000
  consecutiveThreshold?: number;   // default 5
  minRepetitions?: number;         // default 3
  minPatternTokens?: number;       // default 2
}

/* ── Recovery options ── */
export interface RecoveryOptions {
  /** OpenAI client instance. */
  client: OpenAI;
  /** The original request parameters used to start the stream (model, messages, etc.). */
  originalParams: Omit<OpenAI.Chat.Completions.ChatCompletionCreateParams, 'stream'>;
  /** Message injected when a loop is detected. */
  recoveryUserMessage?: string;
  /** Additional frequency_penalty to apply on recovery (added to original, clamped to [-2,2]). */
  extraFrequencyPenalty?: number;
  /** Additional presence_penalty to apply on recovery (same clamping). */
  extraPresencePenalty?: number;
  /** Maximum number of recovery attempts (to avoid infinite loops). */
  maxRecoveryAttempts?: number;
  /** Called when a recovery is triggered. */
  onRecovery?: (attempt: number, lastTokens: string[]) => void;
}

/* ── Custom chunk signalling the end of a looped message ── */
const LOOP_DETECTED_CHUNK: ChatCompletionChunk = {
  id: 'loop_detected',
  object: 'chat.completion.chunk',
  created: Math.floor(Date.now() / 1000),
  model: '',
  choices: [
    {
      index: 0,
      delta: {},
      finish_reason: 'loop_detected',   // non‑standard but recognisable
    },
  ],
};

/**
 * Async generator that streams chat completion chunks, automatically detecting
 * and recovering from dead loops. The consumer receives chunks seamlessly;
 * a loop recovery adds a new assistant message (preceded by a 'loop_detected' chunk).
 */
export async function* deadLoopGuardWithRecovery(
  initialStream: AsyncIterable<ChatCompletionChunk>,
  detectionOptions: DeadLoopDetectorOptions,
  recoveryOptions: RecoveryOptions
): AsyncIterable<ChatCompletionChunk> {
  const {
    client,
    originalParams,
    recoveryUserMessage = 'I notice you are repeating yourself. Please stop and provide a concise answer.',
    extraFrequencyPenalty = 0.3,
    extraPresencePenalty = 0.3,
    maxRecoveryAttempts = 2,
    onRecovery,
  } = recoveryOptions;

  let currentStream = initialStream;
  let messages = [...originalParams.messages]; // will be updated after loop
  let attempt = 0;
  let partialResponse = '';

  while (attempt <= maxRecoveryAttempts) {
    // Build a fresh detector for each stream segment
    const rh = new RollingTokenHash();
    let lastToken: string | undefined;
    let consecutiveCount = 0;

    // We'll accumulate the assistant text of this segment (for later if looped)
    let segmentText = '';

    try {
      for await (const chunk of currentStream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta === undefined || delta === null) {
          // Forward non‑content chunks (e.g. finish_reason, role)
          yield chunk;
          continue;
        }

        // ── Update detection state ──
        if (delta === lastToken) {
          consecutiveCount++;
        } else {
          consecutiveCount = 1;
          lastToken = delta;
        }
        rh.push(delta, detectionOptions.maxWindowTokens ?? 1000);
        segmentText += delta;

        // ── Consecutive token check ──
        if (consecutiveCount >= (detectionOptions.consecutiveThreshold ?? 5)) {
          throw new DeadLoopError(
            `Consecutive token repetition: "${delta}" repeated ${consecutiveCount} times.`,
            segmentText,
            rh.window.slice()
          );
        }

        // ── Cyclic pattern check ──
        const N = rh.length;
        const minPat = detectionOptions.minPatternTokens ?? 2;
        const minRep = detectionOptions.minRepetitions ?? 3;
        const maxPatternLen = Math.floor(N / minRep);
        for (let L = minPat; L <= maxPatternLen; L++) {
          const blockHash = rh.hash(N - L, N);
          let repeats = true;
          for (let r = 1; r < minRep; r++) {
            const start = N - (r + 1) * L;
            if (rh.hash(start, start + L) !== blockHash) {
              repeats = false;
              break;
            }
          }
          if (repeats) {
            // Confirm with exact comparison (avoid hash collision)
            const blockStart = N - L;
            let exactMatch = true;
            for (let r = 1; r < minRep; r++) {
              const otherStart = N - (r + 1) * L;
              if (!rh._compareSlices(blockStart, otherStart, L)) {
                exactMatch = false;
                break;
              }
            }
            if (exactMatch) {
              const blockTokens = rh.window.slice(N - L, N);
              throw new DeadLoopError(
                `Cyclic repetition: pattern [${blockTokens.join(' ')}] repeated ${minRep} times.`,
                segmentText,
                rh.window.slice()
              );
            }
          }
        }

        // No loop yet – yield the chunk normally
        yield chunk;
      }

      // Stream ended naturally without loop – we're done
      return;
    } catch (err) {
      if (!(err instanceof DeadLoopError)) throw err; // unexpected error

      // ── Loop detected ──
      partialResponse += segmentText;
      onRecovery?.(attempt + 1, err.lastTokens);

      if (attempt >= maxRecoveryAttempts) {
        // Give up, signal the loop and stop
        yield LOOP_DETECTED_CHUNK;
        return;
      }

      // 1. Emit the custom chunk to mark end of the looped assistant message
      yield LOOP_DETECTED_CHUNK;

      // 2. Append the assistant's partial response and a corrective user message to history
      messages.push({ role: 'assistant', content: err.partialText });
      messages.push({ role: 'user', content: recoveryUserMessage });

      // 3. Prepare new request with increased penalties
      const baseFreq = originalParams.frequency_penalty ?? 0;
      const basePres = originalParams.presence_penalty ?? 0;
      const newFreq = Math.min(2, Math.max(-2, baseFreq + extraFrequencyPenalty * (attempt + 1)));
      const newPres = Math.min(2, Math.max(-2, basePres + extraPresencePenalty * (attempt + 1)));

      const recoveryParams: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
        ...originalParams,
        messages,
        stream: true,
        frequency_penalty: newFreq,
        presence_penalty: newPres,
      };

      // 4. Start the recovery stream (this will become the new currentStream)
      const recoveryStream = await client.chat.completions.create(recoveryParams);
      currentStream = recoveryStream as AsyncIterable<ChatCompletionChunk>;
      attempt++;

      // Reset segment accumulator for the new stream segment
      segmentText = '';
      // Continue the outer loop – will iterate the new stream
    }
  }
}
```
