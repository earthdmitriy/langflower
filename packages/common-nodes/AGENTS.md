# @langflower/common-nodes

Built-in Langflower node catalog and test registry.

## Exports

Concrete modules only — **no `index.ts`** (forbidden repo-wide). Subpaths in
`package.json` `exports` point at compiled entry files, not barrels.

- `src/catalog.ts` — `getCommonNodeDefinition(s)`, `getResolvedCommonNode`
- `src/resolve-workflow-node-definition.ts` — type → reactive definition lookup
- `src/test-nodes/test-index.ts` — harness registry (when populated)
- `src/ai/features/openai/` — unbound OpenAI chat/list-models factories (server binds secrets)
- `src/embeddings/` — unbound embeddings HTTP factory (server binds secrets; catalog nodes)

## Dependencies

`@langflower/node-sdk` + `@langflower/runtime` +
`@langflower/tools` (handler configs + `@langflower/tools/html`) + `openai` —
**no** `@langflower/shared`. Runtime supplies graph/port contracts and the test
facade; run-scoped host capabilities come from `ctx.*`. Pack nodes import
`*_TOOL_CONFIGS` from tools and attach `handler` on wire registrations
([ADR-019](../../docs/ADR.md#adr-019--tool-handlers-on-registration-not-harness-toolid-registry)).
Crawl HTML helpers are owned by `@langflower/tools/html`; BFS crawl by
`@langflower/tools/run-bfs-crawl` — do not duplicate under `src/crawl/`.

**Growth rule:** unbound provider HTTP adapters (e.g. `ai/features/openai/`) live here;
server only binds secrets. Do **not** put SSRF or MCP stdio bodies
in this package or in server — those belong in `@langflower/tools`
([PRINCIPLES.md § Thin server](../../docs/PRINCIPLES.md#thin-server--do-not-grow-domain-here)).
MCP wire nodes live under `src/mcp/`; **do not** export MCP util helpers from
this package — import `@langflower/tools/build-mcp-handle` (etc.) inside nodes.

## Internal layout

| Path                                      | Purpose                                                                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `src/catalog.ts`                          | Node catalog (source of truth for shipped common nodes)                                                                        |
| `src/resolve-workflow-node-definition.ts` | Type → reactive definition lookup (`getCommonReactiveNode`)                                                                    |
| `src/ai/`                                 | LLM catalog under `ai/nodes/<node>/`; shared core under `ai/features/` (`llm-loop`, `llm-session`, `path-choice`, `openai`, …) |
| `src/embeddings/`                         | Unbound embeddings HTTP (`create-embedding`) + Embeddings catalog nodes (`embed-text`, `embed-similarity`, `embed-provider`)   |
| `src/tools/`                              | Runtime inventory helpers (`collect-agent-tool-handles`) + Tool collection catalog node                                        |
| `src/mcp/`                                | Wire MCP nodes only (`mcp-stdio`, `mcp-http`) — helpers live in `@langflower/tools`                                            |
| `src/hitl/`                               | Review Gate + Chat Input                                                                                                       |
| `src/output/`                             | Run output surfaced in the work log                                                                                            |
| `src/primitives/`                         | Scalar literals and JSON field helpers                                                                                         |
| `src/logic/`                              | Branching, comparison, routing                                                                                                 |
| `src/text/`                               | String templating and manipulation                                                                                             |
| `src/memory/`                             | `memory-tools` pack via `defineToolRegistrations` only                                                                         |
| `src/langflower-tools/`                   | Langflower Tools (`compile_custom_nodes`; local `emitRegistrationTools` peeks this node EC)                                    |
| `src/crawl/`                              | Crawl nodes + `crawl-tools` via `defineToolRegistrations`                                                                      |
| `src/test-nodes/`                         | Demo and harness fixtures (not in default registry)                                                                            |

Author factories: `defineNode` / `defineReactiveNode` /
`defineToolRegistrations` from `@langflower/node-sdk`; `defineLlmNode`
from `@langflower/node-sdk/llm`. `ToolHandle` stays on the main entry.
MCP wire nodes emit `ToolHandle[]` on `tools` (session stays in `@langflower/tools`
`buildMcpHandle`).

Each node is self-contained — helper logic is inlined into the consuming node
file. **AI exception:** catalog nodes under `src/ai/nodes/` stay thin `bind()`
entry points and call named slices in `src/ai/features/` (shared loop, session,
path-choice, OpenAI HTTP). Do not copy detector / autokick into a node folder.

## Reactive `bind()` (see `@langflower/node-sdk`)

- Outputs: **`configureOutput(portId, stream, meta)`** — stream from `connection.pipeValue(...)`, passthrough via `connection` + `inferTypeFrom`, or `statefulObservable` when the loader is non-trivial.
- Input → output map: **`input.pipeValue(map(...))`** — not
  `statefulObservable({ input: input.value$, loader: (v) => of(...) })`.
- Reusable value-lane transforms: **`OperatorFunction` + `pipeValue(op)`**
  (e.g. `demuxByKind`), not `(cycle$) => cycle$.pipeValue(...)`. Local
  operators are fine — not a `utils/` extract. See
  [REACTIVITY.md](../../docs/REACTIVITY.md) § Custom RxJS operators.
- `pipeValue` is variadic: `session$.pipeValue(filter(…), map(…))` — not
  `pipeValue(pipe(…))` for ordinary demux.
- Lockstep multi-outs (e.g. Repeat value/`done`): **one** paced session of
  `{ kind: '…' as const }` events, then demux — not a separate `switchMap` per
  out. Do **not** add `shareReplay`: `StatefulObservable` is already hot. See
  [HOW_TO_WRITE_REACTIVE_NODES](../../docs/HOW_TO_WRITE_REACTIVE_NODES.md)
  § Multi-output paced sessions; reference `flow/repeat/node.ts`.
- Passthrough: **`configureOutput(portId, input, { inferTypeFrom: input })`** —
  no wrapper.
- Combine inputs: **`combineInputs([a, b], mapFn).pipeValue(...)`** — not raw
  `combineLatest`. Keep pacing triggers **out** of that combine (ASAP + wait).
- Multi-slot fan-in: `multi: 'combine'` (combineLatest), `'zip'` (flush — every
  slot needs a new event; used by Concat), or `'merge'` (flatten).
- Panel params: include the hidden `ctx` port in `combineInputs` and read
  `ec.params`; `uiSchema` is static definition metadata.
- Number inline with a floor/step: `inline: { type: 'number', min, step }`.
- **No fake port events / no silent refusals** — emit only real facts on
  feed/observability outs; refuse via `StatefulObservable` **error** (e.g.
  `maxFeedbackTurns`), not placeholders or bare `EMPTY`. See
  [LLM_NODES.md](../../docs/LLM_NODES.md) § Port events.
- LLM nodes use `runLlmSessionMachine` for queued turns/history and
  `runLlmLoop` for provider/tools/Sub-Agent/Steer. Do not add async-IIFE
  Observables, mutable history, duplicated path-choice loops, or provider
  `for await` consumption outside the provider RxJS operator.
- Recoverable provider failures reduce to loop suspension; only fatal failures
  enter the StatefulObservable error lane. Keep partial streamed text out of
  committed history after a failed round. Stuck / dead-loop strategy:
  [LLM_RECOVERY.md](../../docs/LLM_RECOVERY.md).

## Package boundary

- Production + test code must not import `@langflower/shared`.
- Allowed workspace imports: `@langflower/node-sdk`,
  `@langflower/tools` (domain tool configs, `html`, `run-bfs-crawl`, structural
  types),
  `@langflower/common-nodes`, `./test`.

## Tests

- Catalog smoke: `src/registry-contract.test.ts`
- Boundary (DAG + ownership): [`tests/unit/package-boundaries/`](../../tests/unit/package-boundaries/)
