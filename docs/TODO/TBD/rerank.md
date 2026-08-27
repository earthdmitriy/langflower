# Rerank provider and hello-embed integration

## 1. Executive summary and intent

### Problem

`hello-embed` currently ranks chunks with cosine similarity plus FTS5 and RRF.
That is a good first-stage retrieve, but it scores the query and document
independently. A cross-encoder reranker can read each query/document pair
together, reorder a larger candidate pool, and keep a cleaner top-K for the
generation Context.

The implementation must cover both retrieval paths in `kb-rag`:

1. the forced first retrieve through `hello-embed-search`;
2. optional later retrieves through the `project_search` tool emitted by
   `hello-embed-search-handle`.

A standalone graph node after only the first search is insufficient because
tool-based second-hop retrieval would bypass it.

### Locked decisions

- Add a reusable `RerankHandle`, parallel to `EmbedHandle`.
- Add a `common-rerank-provider` catalog node that emits the handle.
- Add an optional `rerank` handle input to both hello-embed search nodes.
- Keep reranking disabled when no handle is wired. Existing workflows remain
  backward-compatible and preserve their current RRF-only behavior.
- Do **not** add a default reranker model to `LangflowerConfig` or Settings.
  Provider and model are explicit parameters on `common-rerank-provider`.
- First supported protocol is the Jina/Cohere-style `POST /v1/rerank`
  implemented by llama.cpp and vLLM.
- Do not implement an LM Studio chat-completion workaround or LLM-as-judge in
  this slice.
- Preserve the first-stage RRF `score`; add `rerankScore` instead of replacing
  or changing the meaning of `score`.

### Target dataflow

```text
query
  │
  ├─ embed query
  ├─ cosine candidates
  ├─ FTS5 candidates
  └─ RRF fusion
        │
        ▼
larger candidate pool
        │
        ├─ no RerankHandle → current RRF top-K
        │
        └─ RerankHandle → /v1/rerank → reranked top-K
                                      │
                                      ▼
                          full-chunk Context → LLM
```

## 2. External API and setup risks

### The endpoint is not part of the OpenAI API

The OpenAI Node SDK has no typed `client.rerank()` resource, and OpenAI does
not define a general cross-encoder endpoint that accepts one query plus an
arbitrary document list.

Langflower already depends on `openai`, so the adapter may reuse its supported
custom-request API:

```ts
const response = await client.post<unknown>('/rerank', {
	body: {
		model,
		query,
		documents,
		top_n: topK,
	},
});
```

This only provides HTTP transport, base URL handling, authentication, retries,
timeout behavior, and abort support. Langflower must own and runtime-validate
the request and response contracts because the SDK provides no rerank types.

Do not call this protocol “OpenAI-compatible reranking” in UI or docs. Describe
it as a `/v1/rerank` provider or Jina/Cohere-style rerank API.

References:

- OpenAI SDK custom requests:
  <https://github.com/openai/openai-node#making-customundocumented-requests>
- llama.cpp rerank server:
  <https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md#post-reranking-rerank-documents-according-to-a-given-query>
- vLLM scoring and rerank API:
  <https://docs.vllm.ai/en/latest/models/pooling_models/scoring/>

### LM Studio is not a working rerank provider

As of this plan, LM Studio exposes OpenAI-compatible Responses, Chat
Completions, Completions, and Embeddings endpoints, but no `/v1/rerank`.
A downloaded reranker may still appear in `GET /v1/models`; that only proves
the model ID is visible, not that the server can execute reranking.

Langflower's current model catalog stores all IDs returned by
`client.models.list()` and does not preserve model capability metadata.
Consequences:

- `Qwen3-Reranker-0.6B` may appear in the model select even though calls fail;
- the same ID may also appear in chat and embedding selects;
- selecting a visible model must not be presented as a successful capability
  check;
- a 404/unsupported-method response needs a specific diagnostic explaining
  that the provider does not expose `/v1/rerank`.

Do not route reranking through LM Studio `/v1/embeddings`. A reranker is not an
embedding model, and the returned values are not document vectors. Do not use
`chat/completions` as a silent substitute because generated “yes/no” text is
not a stable relevance score.

References:

- LM Studio supported OpenAI-compatible endpoints:
  <https://lmstudio.ai/docs/developer/openai-compat>
- Open LM Studio rerank request:
  <https://github.com/lmstudio-ai/lms/issues/521>

### Provider setup is an explicit usability cost

The user must run a separate compatible provider, load a reranker correctly,
add that provider to Langflower Settings, and select its model on the provider
node. This is substantially harder than selecting a chat or embedding model.

The first documented local paths are:

- llama.cpp `llama-server` with reranking enabled, rank pooling, and embedding
  internals enabled;
- vLLM serving a supported cross-encoder/pooling model with `/v1/rerank`.

For Qwen3 reranker GGUF files, conversion quality and metadata matter. An
incorrect conversion or missing rank-pooling metadata can return zero,
near-zero, null, or meaningless scores while the HTTP request itself succeeds.
Documentation must include:

- a tested server launch command and expected base URL;
- a standalone `curl /v1/rerank` smoke test before Langflower wiring;
- a two-document sanity check where the relevant document ranks first;
- a warning that model-list visibility is not a health check;
- troubleshooting for 404, unsupported endpoint, invalid scores, and a model
  loaded under the wrong task.

The default `kb-rag` workflow must remain runnable without a reranker. Do not
seed a wired, unconfigured provider node that makes the sample fail.

## 3. Codebase guardrails and ownership

### Package boundaries

- `@langflower/node-sdk` owns the author-facing live-handle contract and wire
  guard. It must not own HTTP, provider credentials, or model resolution.
- `@langflower/common-nodes` owns the unbound `/v1/rerank` HTTP adapter and the
  catalog provider node.
- `@langflower/server` only resolves credentials and injects the adapter into
  private `RunHostServices`.
- `hello-embed` owns candidate retrieval, its `SearchHit` shape, and where
  reranking is applied before Context packing.
- No API key, base URL, or OpenAI client enters the custom-node pack.
- Do not widen base `ExecutionContext`, `ToolHandlerContext`, or
  `LlmExecutionCaps`. Extend private `RunHostServices`, following embeddings.
- Do not introduce a second provider/config map or a `defaultReranker` field.

### Pattern references

- `packages/node-sdk/src/node-factory/define-embed/embed-handle.ts`
    - live, non-serializable handle;
    - branded wire-type constant;
    - strict duck-type guard.
- `packages/common-nodes/src/embeddings/create-embedding.ts`
    - unbound provider factory;
    - injected credential resolver and mockable client;
    - abort propagation, safe errors, and strict response validation.
- `packages/common-nodes/src/embeddings/embed-provider/node.ts`
    - provider/model panel selects;
    - run-scoped handle closure;
    - linked run and per-call abort signals.
- `packages/server/src/bridge/bind-embed-context.ts`
    - thin secret binding only.
- `packages/server/skeleton/nodes/hello-embed/lib/search.ts`
    - one shared retrieval implementation used by graph search and the tool.

### Dependencies

- Add no third-party dependency.
- Reuse the existing `openai` dependency in `@langflower/common-nodes`.
- Use `client.post<unknown>()`; do not add a parallel `fetch` client.
- Runtime response checking remains code-first with local type guards.

## 4. Data contracts

### Author-facing handle

Add a sibling SDK folder:

`packages/node-sdk/src/node-factory/define-rerank/rerank-handle.ts`

Planned contract:

```ts
export const RERANK_HANDLE_WIRE_TYPE = 'rerank-handle';

export type RerankScore = {
	readonly index: number;
	readonly relevanceScore: number;
};

export type RerankOptions = {
	readonly topK: number;
	readonly signal?: AbortSignal;
};

export type RerankHandle = {
	readonly rerank: (
		query: string,
		documents: readonly string[],
		options: RerankOptions,
	) => Promise<readonly RerankScore[]>;
};
```

`isRerankHandle` checks only the stable live capability shape. It must not
accept JSON lookalikes without a callable `rerank`.

The handle returns indexes rather than copied documents so hello-embed can
preserve the authoritative `SearchHit` objects and map scores without a glue
DTO.

### Host adapter

Add an unbound `CreateRerank` contract under
`packages/common-nodes/src/rerank/create-rerank.ts`:

```ts
export type CreateRerankArgs = {
	readonly providerId: string;
	readonly model: string;
	readonly query: string;
	readonly documents: readonly string[];
	readonly topK: number;
	readonly signal?: AbortSignal;
};

export type CreateRerankResult = {
	readonly scores: readonly RerankScore[];
};
```

HTTP request:

```json
{
	"model": "Qwen/Qwen3-Reranker-0.6B",
	"query": "How does project bootstrap work?",
	"documents": ["first candidate", "second candidate"],
	"top_n": 2
}
```

Accepted response fields:

```json
{
	"results": [
		{ "index": 1, "relevance_score": 0.91 },
		{ "index": 0, "relevance_score": 0.12 }
	]
}
```

Validation rules:

- provider ID, model, and trimmed query are non-empty;
- an empty document list returns `[]` without HTTP;
- `topK` is an integer in `1..documents.length`;
- `results` exists and is an array;
- every index is an integer, unique, and in document bounds;
- every relevance score is finite;
- non-empty input with no valid results fails visibly;
- results are sorted by descending score, with input index as deterministic
  tie-breaker;
- raw scores are preserved; do not apply sigmoid or claim a universal `0..1`
  range because llama.cpp and vLLM may expose different score scales;
- provider errors redact credentials and authorization headers;
- an abort remains an `AbortError`;
- 404/405 errors include an actionable `/v1/rerank` compatibility hint.

### hello-embed result

Extend `SearchHit` without changing existing `score` semantics:

```ts
export type SearchHit = {
	readonly path: string;
	readonly heading: string;
	readonly score: number;
	readonly rerankScore?: number;
	readonly text: string;
};
```

`score` remains the RRF score. `rerankScore` is present only when reranking
ran successfully.

The document sent to the reranker is the heading plus the full chunk text.
Path remains metadata and is not included in semantic scoring.

When formatting Context:

- RRF-only hit: show the existing score;
- reranked hit: show both rerank and RRF scores with explicit labels;
- preserve path, heading, and full chunk body.

## 5. Implementation sequence

### Phase 1 — SDK handle

1. Add `RerankHandle`, options, score type, wire constant, and guard under
   `define-rerank/`.
2. Export them from the main `@langflower/node-sdk` entry.
3. Add unit tests for valid handles and malformed values.
4. Update node-sdk package guidance with the new author-facing contract.

Acceptance:

- custom packs can import the handle from `@langflower/node-sdk`;
- no host/network concern is added to public execution contexts;
- runtime wire typing remains structurally compatible because wire types are
  string-branded rather than a closed enum.

### Phase 2 — provider HTTP and private host binding

1. Add `createRerank` and focused tests in common-nodes.
2. Export the factory through a concrete package subpath for server binding.
3. Add optional `createRerank` to private `RunHostServices`.
4. Add `bind-rerank-context.ts` in server, resolving credentials through the
   existing provider configuration.
5. Inject the bound factory from `buildExecutionContext`.

Acceptance:

- secrets remain server-side;
- the adapter uses the existing OpenAI SDK custom POST transport;
- mocked HTTP tests cover request shape, response validation, abort, redaction,
  and unsupported endpoint diagnostics;
- no config schema or Settings default changes.

### Phase 3 — common rerank provider node

1. Add `common-rerank-provider` under
   `packages/common-nodes/src/rerank/rerank-provider/`.
2. Add explicit provider and model selects using the existing provider/model
   option sources.
3. Require both values. Do not fall back to default chat or embedding models.
4. Emit a run-scoped `RerankHandle`; link run cancellation with optional
   per-call cancellation.
5. Register the node in the common catalog and catalog smoke tests.

Node description must say:

- requires a provider implementing `/v1/rerank`;
- LM Studio model visibility does not imply endpoint support;
- query and candidate text are sent to the selected provider.

Acceptance:

- an empty provider/model produces an actionable node error;
- selecting an ID from the catalog does not trigger a false “supported” state;
- no probe request is made merely to populate the palette or materialize the
  canvas;
- first actual use exposes provider/setup failures visibly.

### Phase 4 — hello-embed integration

1. Add an optional `rerank` input to `hello-embed-search`.
2. Add the same optional input to `hello-embed-search-handle`.
3. Validate wired values with `isRerankHandle`.
4. Extend the shared `runSearch` options with an optional reranker.
5. Refactor retrieval so RRF produces a candidate pool before final slicing:
    - without a handle, retain the current RRF top-K;
    - with a handle, send the larger candidate pool to rerank and then keep
      final top-K.
6. Map response indexes back to original hits, preserve RRF `score`, attach
   `rerankScore`, and rebuild packed Context in reranked order.
7. Keep both graph search and `project_search` on this single shared path.

Candidate controls:

- retain the existing `max(topK * 4, 32)` policy;
- cap candidates at 200 because panel `topK` is capped at 50;
- do not silently truncate individual chunks in this slice;
- surface provider request-size/context errors rather than pretending rerank
  succeeded.

Failure policy:

- no wired handle means intentional RRF-only behavior;
- a wired handle that fails must fail the search visibly;
- do not silently fall back to RRF, because that would tell users reranking is
  active when it is not.

The seeded `kb-rag` graph remains unwired by default. README instructions show
how to add one rerank provider and fan its handle out to both search nodes.

### Phase 5 — documentation and product honesty

1. Add `docs/RERANKING.md` as the canonical protocol/setup guide.
2. Update both hello-embed READMEs and keep skeleton/dogfood copies identical.
3. Update the helper knowledge base in skeleton, `.langflower`, and
   `demo-project` so it does not claim LM Studio rerank support.
4. Update `docs/CONFIG.md`:
    - existing providers are reused;
    - no default reranker setting exists;
    - the model catalog is capability-untyped.
5. Update `docs/NODES.md`, `docs/STATUS.md`, and package AGENTS files.
6. On implementation completion, promote/remove TBD-009 from `docs/TBD.md`
   according to its rules and link the completed plan.

Documentation must lead with the operational difficulty:

- rerank is optional;
- it requires a separate compatible backend;
- LM Studio is not currently sufficient;
- users should validate the endpoint with curl before wiring;
- query and retrieved project text leave Langflower for remote providers.

## 6. Affected files

### New files

- `packages/node-sdk/src/node-factory/define-rerank/rerank-handle.ts`
- `packages/node-sdk/src/node-factory/define-rerank/rerank-handle.test.ts`
- `packages/common-nodes/src/rerank/create-rerank.ts`
- `packages/common-nodes/src/rerank/create-rerank.test.ts`
- `packages/common-nodes/src/rerank/rerank-provider/node.ts`
- `packages/common-nodes/src/rerank/rerank-provider/node.test.ts`
- `packages/server/src/bridge/bind-rerank-context.ts`
- `docs/RERANKING.md`

### Changed files

- `packages/node-sdk/src/node-factory/define-reactive-node/define-reactive-node.ts`
- `packages/node-sdk/AGENTS.md`
- `packages/common-nodes/package.json`
- `packages/common-nodes/src/ai/features/run-host-services.ts`
- `packages/common-nodes/src/catalog.ts`
- `packages/common-nodes/src/registry-contract.test.ts`
- `packages/common-nodes/AGENTS.md`
- `packages/server/src/bridge/build-execution-context.ts`
- relevant server bridge/context tests
- `packages/server/skeleton/nodes/hello-embed/search.ts`
- `packages/server/skeleton/nodes/hello-embed/search-handle.ts`
- `packages/server/skeleton/nodes/hello-embed/lib/search.ts`
- `packages/server/skeleton/nodes/hello-embed/lib/ingest-search.test.ts`
- `packages/server/skeleton/nodes/hello-embed/hello-embed.nodes.test.ts`
- matching `.langflower/nodes/hello-embed/` dogfood files
- hello-embed README copies
- skeleton, dogfood, and demo helper knowledge-base files
- `docs/CONFIG.md`
- `docs/NODES.md`
- `docs/STATUS.md`
- `docs/NAVIGATION.md`
- `docs/TBD.md`

### Deleted files

- None planned.

## 7. Error handling, security, and observability

### Expected failures

- provider/model omitted;
- provider URL does not end at the expected `/v1` base;
- provider exposes models but not `/v1/rerank`;
- LM Studio returns 404/unsupported endpoint;
- model is loaded as chat or embedding instead of rank/scoring;
- malformed Qwen GGUF or missing rank metadata returns invalid scores;
- provider response contains duplicate/out-of-range indexes or non-finite
  scores;
- request exceeds provider limits;
- run is stopped during reranking;
- remote provider is unavailable or rate-limited.

### User-visible behavior

- Expected configuration/provider failures enter the node error lane with a
  concise corrective message.
- Errors must name the failing capability (`/v1/rerank`) and provider/model,
  but never include API keys or authorization headers.
- No fake empty hit list is emitted for provider failure.
- No automatic RRF fallback occurs after a configured reranker fails.

### Privacy

Reranking sends the original query and full candidate chunk bodies to the
selected provider. The node description and canonical docs must make this
explicit, especially for non-local providers.

No new persistence is introduced. Only the existing SQLite index remains
durable; rerank responses are run-scoped.

## 8. Verification and definition of done

### Automated tests

- [ ] SDK guard accepts a valid handle and rejects malformed values.
- [ ] HTTP adapter sends `model`, `query`, `documents`, and `top_n` to
      `/v1/rerank`.
- [ ] Adapter validates indexes and finite scores and preserves raw score
      values.
- [ ] Adapter forwards abort and redacts sensitive errors.
- [ ] Provider node requires explicit provider/model and emits a callable
      run-scoped handle.
- [ ] Catalog/registry includes `common-rerank-provider`.
- [ ] RRF-only search output remains byte-for-byte compatible where practical.
- [ ] Wired reranking receives more candidates than final top-K.
- [ ] Reranked output preserves RRF score, adds rerank score, and changes order.
- [ ] Invalid rerank responses fail visibly rather than falling back.
- [ ] `project_search` uses the same reranking path as initial graph search.
- [ ] Skeleton and dogfood hello-embed files remain synchronized.
- [ ] Server context integration proves credential resolution and injection.
- [ ] Integration coverage exercises a mocked `/v1/rerank` workflow path.

### Manual provider verification

1. Start a compatible llama.cpp or vLLM rerank server with a known-good model.
2. Call `/v1/rerank` directly with one relevant and one irrelevant document.
3. Confirm the relevant document has the higher score.
4. Add the provider and model ID to Langflower Settings.
5. Add `common-rerank-provider` to a copy of `kb-rag`.
6. Fan out `rerank` to both hello-embed search nodes.
7. Run a question whose RRF candidate order differs from reranker order.
8. Confirm initial Context and later `project_search` results are reranked.
9. Stop the rerank server and confirm the next run fails with an actionable
   provider error rather than silently using RRF.
10. Point the node at LM Studio and confirm the unsupported-endpoint message
    explains that model-list visibility is insufficient.

### Quality gates

- Intermediate while iterating:
    - focused node-sdk, common-nodes, server, and hello-embed Vitest files;
    - `node build/tools/agent-run.mjs verify --quick`.
- Before close-out:
    1. `node build/tools/agent-run.mjs dead-code`
    2. delete all dead-code findings introduced by the change;
    3. `node build/tools/agent-run.mjs check-exports`
    4. `node build/tools/agent-run.mjs verify`

The full verify gate must pass build, unit, and integration. Do not mark the
feature complete on focused tests or `verify --quick` alone.

## 9. Functional acceptance checklist

- [ ] Reranking is optional and disabled when no handle is wired.
- [ ] No default reranker model or new configuration field exists.
- [ ] Provider/model selection is explicit and persisted on the provider node.
- [ ] Both initial and tool-based retrieval use reranking when wired.
- [ ] First-stage RRF scores remain available alongside rerank scores.
- [ ] Provider credentials never enter workflow JSON or custom-node code.
- [ ] OpenAI SDK is used only as generic HTTP transport; docs do not claim a
      native OpenAI rerank API.
- [ ] LM Studio is documented as unsupported until it exposes `/v1/rerank`.
- [ ] llama.cpp and vLLM setup includes a direct endpoint smoke test.
- [ ] Default seeded `kb-rag` remains usable without rerank infrastructure.
- [ ] Full repository verification passes.
