# Phase 5 — Real OpenAI-compatible LLM node

**Status:** done  
**Depends on:** [Phase 4](llm-nodes-phase-04-wired-allowlists.md)  
**Index:** [llm-nodes-README.md](llm-nodes-README.md)

## Goal

Ship `common-openai-llm`: chat completions streaming via the official npm
`openai` package, same panel/ports/role model as fake-llm, credentials resolved
**only on the server** and never exposed on bridge/feed.

## In scope

- Dependency: `openai` — prefer owned by `@langflower/server` (or a tiny server
  llm helper). **Do not** resolve secrets inside `common-nodes`.
- Inject into `ExecutionContext` a server-bound factory, e.g.
  `createChatCompletionStream(args) => AsyncIterable / Observable` (or equivalent),
  implemented with `openai` + phase-1 resolve. Node calls the factory only.
- Node `common-openai-llm` / displayName clarifying OpenAI-**compatible**
  (baseURL from provider options):
    - Same shared panel as fake-llm (allowlists, provider, model, skill) — no
      `tokenDelayMs`
    - Same ports: `systemPrompt`, `userPrompt`, `tools`, `mcp`, `feedback` →
      `reasoning`, `draftResponse`, `response`
    - Per cycle: read skill → effective system → inventory from **filtered tools**
      (listing only; **no** tool-call loop); MCP port = placeholder / TODO only →
      stream deltas to `draftResponse` → final `response`; short `reasoning`
      preamble — not fake long deliberation
- Cancel/abort in-flight stream when the run stops (best-effort AbortSignal)
- Catalog register + NODE.md + unit tests with **mocked** stream factory
- Optional demo workflow (provider with `{env:…}` only)
- Finish `docs/LLM_NODES.md`: disclaimer vs use-cases, roles-as-config, shell-off
  recommendation (suggest users disable bash/shell for agents — detail when tools
  land), streaming ports, deferred tool loop / Review
- Cross-links: NAVIGATION, features README, node-library pointer

## Out of scope

- Function/tool calling loop, MCP invoke, `toolLog`, `maxIterations`
- Separate `common-agent-*` types (presets only — phase 3)
- Review node — [phase 7](llm-nodes-phase-07-review-node.md)
- Use-case Partial pilots — **after tool implementation** (locked)
- Live skills `fs.watch`
- Live model catalog — [phase 6](llm-nodes-phase-06-fetch-models.md)

## Acceptance criteria

1. `common-openai-llm` in palette; OpenAI-compatible naming clear in NODE.md.
2. Unit: mocked stream → `draftResponse` tokens then `response`; skill markdown in
   factory messages when `skillId` set.
3. Unit: tool inventory respects phase-4 `enabledToolIds`; disabled ids absent.
4. Unit/integration: resolved apiKey never appears in runner/feed payloads.
5. Missing provider/model/env → safe, non-leaking node error.
6. Two instances differ by skill + enabled tools (params isolation) / presets.
7. Docs include use-cases disclaimer + shell-off recommendation (even if UI toggle
   waits for tools epic).
8. Fake-llm tests green; phase-5 tests added.
9. `dead-code` → `check-exports` → `verify` green.

## Notes / pitfalls

- Prefer server-owned `openai` + injected stream factory (no resolve in common-nodes).
- Listing tools ≠ invoking them — say so in NODE.md / LLM_NODES.md.
- Real API integration optional / skippable without `OPENAI_API_KEY` in CI.
