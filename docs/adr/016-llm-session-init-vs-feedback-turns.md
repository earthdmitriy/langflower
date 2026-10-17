---
kind: adr
owner: docs
covers: []
status: current
id: ADR-016
supersedes: []
superseded-by: []
package: docs
---

## ADR-016 — LLM session: init vs feedback turns

**Status:** accepted · **Date:** 2026-07-19

**Context:** HOW_TO locked optional ports to `defaultValue` (runtime seeds when
unwired — not `startWith` in `bind`). Soft↔Hard debate graphs wired
`feedback` into the same `combineInputs` as `userPrompt`; wired slots skip
`applyPortDefaults`, so Soft waited forever for Hard (BUG-2026-07-19). Product
needs an agent-style session: init context, feedback as later turns with
conversation history on the real OpenAI node.

**Alternatives considered:**

- **Runtime `primeWhenWired` on all `defaultValue`s** — rejected: priming wired
  `tools` with `[]` then the real list double-fires LLM cycles.
- **`take(1)` freeze on init** — rejected: must never ignore init input changes;
  tools/prompt/skill changes are intentional and recreate the session.
- **Shared `agent-session` module** — rejected: keep provider nodes co-located;
  future APIs may diverge.
- **Restore `startWith` on every optional port** — rejected: undoes the
  `defaultValue` contract for inventory ports.
  **Decision:**

1. **Init ports** (`userPrompt`, `systemPrompt`, `tools`, `ctx`):
   `combineInputs` + `defaultValue` only. Any new init emission
   **`switchMap`s** a new session (empty history).
2. **`feedback` is not an init peer.** Prime turn 0 with `startWith('')`, then
   use the shared `runLlmSessionMachine` `mergeScan(..., 1)` fold so feedback
   arriving mid-turn is queued while history/counters remain immutable owned
   state.
3. **`startWith` carve-out is only for that feedback turn stream** — never on
   `tools` / other init peers.
4. **`common-openai-llm` / Critique / Review** share LLM-summary context
   compaction (`prepareChatCompletion`): approx token budget from Inspector
   `contextSize`, optional `compactOnError` pre-stream retry, and
   `historySync` so session history stays truncated.
5. **`common-fake-llm`** imitates streaming for users/demos with the same
   init/feedback split, but is **not** a mechanics test twin (no history oracle)
   and does **not** expose compaction params.
6. **Storm caps ask HITL continue:** when `maxFeedbackTurns` or agent
   `maxIterations` is exhausted, emit a `toolLog` and
   `runner.permission.ask` (`agent.maxFeedbackTurns` /
   `agent.maxIterations`). **Allow** resets the counter for another full
   configured budget; **Deny** (or missing ask hook) keeps the prior stop —
   `maxFeedbackTurns` → `toolLog` + **error** the cycle; agent
   `maxIterations` → soft-complete response. Must not `EMPTY`-drop further
   feedback. No fake success values to clear loading
   ([LLM_NODES.md](../reference/LLM_NODES.md) § Port events). Review/Critique
   `maxIterations` stay fail-closed (no continue ask).
7. Every turn uses the shared `runLlmLoop` `expand` machine. Recoverable
   provider idle/5xx/network failures retry from a committed checkpoint and
   suspend for Steer after the retry budget; they do not error the session
   Observable. Fatal authentication/configuration/protocol failures do.

**Tradeoffs accepted:**

- (+) Soft↔Hard and HITL feedback loops can start without runtime priming hacks.
- (+) Reviewers keep a bright line: no `startWith([])` on `tools`.
- (+) Init changes intentionally discard conversation state.
- (+) Cap / policy stops are visible in feed + port chrome (not a “dead” canvas).
- (−) Authors must learn two layers (init vs turn); HOW_TO must stay explicit.
- (−) Compaction uses approx tokens (`JSON length / 4`) and may still need
  `compactOnError` when the server window is smaller than `contextSize`.

**Consequences:**

- `packages/common-nodes/src/ai/nodes/openai-llm/node.ts` — session + history.
- `packages/common-nodes/src/ai/nodes/fake-llm/node.ts` — minimal split for demos.
- `packages/common-nodes/src/ai/features/llm-session/llm-session-shell.ts` — shared
  `createLlmSessionCycle$` for **all** LLM nodes (openai / fake / critique /
  review); `maxFeedbackTurns` → continue HITL then Deny → `toolLog` + stream
  error; path-choice turn drivers use `primeTurn0: false` + `historySync`
  chunks.
- `packages/common-nodes/src/ai/features/openai/prepare-chat-completion.ts` —
  shared pre-stream compaction runner for both tool loops.
- `packages/common-nodes/src/ai/nodes/critique/node.ts` /
  `review/node.ts` — must not invent a second history mechanism.
- [HOW_TO_WRITE_REACTIVE_NODES.md](../guides/how-to-write-reactive-nodes.md) — init vs
  turns; feedback `startWith` carve-out; no fake events / no silent refusals.
- [LLM_NODES.md](../reference/LLM_NODES.md) — unified session table.
- FOUND_BUGS BUG-2026-07-19 → fixed.

**Revisit trigger:** Tokenizer-accurate budgets; a second provider node that
cannot share openai’s message shape (still co-located).

---
