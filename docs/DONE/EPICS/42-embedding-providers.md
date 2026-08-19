# Epic 42 — Embedding providers

**Status:** landed  
**Depends on:** [18-settings-panel](18-settings-panel.md)
(landed — Settings aside + chat default `model`);
[ADR-027](../../ADR.md#adr-027--author-sdk-owns-port-types-no-production-runtime-dep)
(SDK owns wire types);
[ADR-033](../../ADR.md#adr-033--markdown-memory-tools-no-embedding-as-base)
(amended: provider bind allowed; vector **KB as base memory** stays forbidden).  
**Index:** [README.md](README.md)  
**Related:** [settings-panel](../../use-cases/settings-panel.md),
[settings-panel feature](../../features/settings-panel.md),
[CONFIG.md](../../CONFIG.md), custom packs.

## Goal

Operators pick a **default embedding provider** in Settings (same OpenAI-compatible
`provider` map as chat). Catalog gains an **Embeddings** palette category:
simple in→out nodes for a manual check, plus a **provider node** that emits a
typed `EmbedHandle` for batch consumers (custom packs). Secrets stay
server-side. This is **not** a revival of `.langflower/kb/` or `common-kb-*`,
and **not** `ToolHandle` (that remains LLM inventory only).

## Locked decisions

1. **Credentials** come from Settings `provider.<id>` (`baseURL`, `apiKey` /
   `{env:…}`). New jsonc field is only the **default embedding identity**,
   parallel to chat `model: "providerId/modelId"` — e.g.
   `embedding: "openai/text-embedding-3-small"` (exact key name locked in
   implementation; must be distinct from chat `model`).
2. **No keys on public `ExecutionContext`.** Bind like chat:
   server `resolveProviderCredentials` → host factory on the **catalog**
   provider / simple embed nodes (private `RunHostServices` or a sibling embed
   bind). Custom packs never `fetch` the provider on the shipped path.
3. **SDK type, not tools.** `@langflower/node-sdk` owns a dedicated canvas
   capability (folder `packages/node-sdk/src/node-factory/define-embed/` at
   impl time), parallel to `ToolHandle` but **not** agent inventory:

    ```ts
    export const EMBED_HANDLE_WIRE_TYPE = 'embed-handle';

    export type EmbedTextRole = 'document' | 'query';

    export type EmbedTextsOptions = {
    	readonly role?: EmbedTextRole;
    	readonly signal?: AbortSignal;
    };

    export type EmbedHandle = {
    	/** Vector size for this bound model; packs MUST reject a mismatch. */
    	readonly dim: number;
    	readonly embedTexts: (
    		texts: readonly string[],
    		options?: EmbedTextsOptions,
    	) => Promise<readonly Float32Array[]>;
    };
    ```

    - `role` defaults to `'document'` (ingest / UC1). Search MUST pass
      `'query'` so models that need e5-style prefixes stay consistent.
      Models that ignore prefixes (BGE-M3) still get the same flag.
    - `signal`: catalog HTTP MUST abort on runner interrupt (Stop). Packs
      forward the run abort if they have one; otherwise omit.
    - `dim` is known from the bound model after the first successful
      response (or from a documented model table). Emit the handle only
      once `dim` is set, or resolve lazily but freeze `dim` after the first
      batch — never change mid-run.
    - Ingest and search SHOULD share **one** `common-embed-provider` (fan-out
      the same `embed` edge). Two provider nodes with different models are
      allowed by the canvas; the pack MUST fail if query `dim` ≠ stored
      `work_vec.dim`.
    - Export from `@langflower/node-sdk` (main entry or `./embed` — pick one
      owner at impl). Do **not** add this to `LlmExecutionCaps` or base
      `ExecutionContext`.
    - Payload is a live closure (not JSON-serializable), same idea as
      `ToolHandle.invoke`.
    - **Not** `McpHandle`: MCP is explicitly not a canvas wire. `EmbedHandle`
      **is** a wire: provider `embed` out → consumer `embed` in, both
      `wireType: EMBED_HANDLE_WIRE_TYPE`. Editor connect requires equal
      `wireType` (see `runtime-editor.ts`); `tool-handle` cannot connect here.
    - Authors import `EmbedHandle` + `isEmbedHandle` ( `defineNode` `execute`
      still sees `Record<string, unknown>`). Do not widen `defineNode`
      generics unless a second consumer needs it.
    - Optional later `defineEmbedProvider` factory (mirror
      `defineToolRegistrations`) — not required; one catalog `defineNode` that
      emits the handle is enough.

    `ToolHandle` stays `invoke → string` for LLM `tools`. Batch embed is
    `embedTexts → Float32Array[]`.

4. **Who uses the wire vs Settings default:**
    - **Packs (UC2):** required `embed` input. Graph shows the contract:

        ```text
        common-embed-provider.embed → consumer-ingest.embed
        common-embed-provider.embed → consumer-search.embed
        ```

        Pack ingest: `embedTexts(batch, { role: 'document', signal })`.
        Pack search: `embedTexts([query], { role: 'query', signal })`.
        Empty `embed` is a run error, not silent LM Studio localhost.
        `embed` input is **single** (not `combine` of two handles).

    - **Simple catalog nodes (UC1):** no extra provider node. Panel
      `providerId` / `model` empty → Settings embedding default.
5. **Not a product corpus.** `EmbedHandle` only talks to the embeddings HTTP
   API. Pack-owned indexes (sqlite BLOBs, etc.) stay in the pack. Do **not**
   recreate `common-kb-ingest/search` or hashing embeddings as the default.
6. **ADR-033 amend** (same change as code): embedding **provider in Settings**,
   **EmbedHandle** in the SDK, and Embeddings **catalog nodes** are allowed.
   Agent memory remains markdown tools under `.langflower/memory/`. No
   `.langflower/kb/` store.

## In scope

### Settings

- New Settings group **Default embedding model** next to **Default chat model**:
  provider select + model select (same catalog merge as Inspector /
  `langflower.providers` / `langflower.models`).
- Save persists the embedding identity on the active scope; project wins over
  global (same merge as `model`). Extend
  [`LangflowerConfigSaveRequestedPayload`](../../../packages/shared/src/types/langflower-config.ts)
  with an `embedding?: string` field next to `model` (same
  `"providerId/modelId"` shape). Settings draft/save/merge must carry it;
  omitting on Save leaves the existing scope value unchanged (same as other
  optional save keys).
- `common-embed-text` / `common-embed-provider` with empty panel
  `providerId` / `model` fall back to this default (same idea as LLM empty →
  `RunHostServices.defaultChat`). `common-embed-similarity` has **no**
  provider panel (pure cosine).
- Redaction unchanged: snapshots omit `apiKey`.

### Palette category `Embeddings`

Register in `packages/common-nodes/src/catalog.ts`. Layout:
`packages/common-nodes/src/embeddings/` (nodes + unbound HTTP adapter; server
binds secrets — same DAG as `ai/features/openai`).

| Type                      | Shape                                                                                    | Role                                                               |
| ------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `common-embed-text`       | `text` (`string`) → `vector` (`json` number[]) + `dim` (`number`) + `preview` (`string`) | UC1 manual check                                                   |
| `common-embed-similarity` | two `vector` (`json`) → `score` (`number`)                                               | UC1 cosine / L2-normalized dot; **no** HTTP, **no** provider panel |
| `common-embed-provider`   | `embed` out (`embed-handle` / `EmbedHandle`)                                             | UC2 batch provider for packs                                       |

Panel: `common-embed-text` and `common-embed-provider` get optional
`providerId` / `model` (`optionsSource` `langflower.providers` /
`langflower.models`); empty = Settings default. Similarity: empty
`uiSchema` (or score-only fields) — do not copy the provider selects.

`preview` on embed-text: compact line such as `dim=1024  [0.12, -0.03, …]`
(first ~8 floats). Wire `preview` → `common-preview`. Full `vector` stays
on the json port for similarity, not as the Preview payload.

HTTP (text + provider nodes): OpenAI-compatible `POST /v1/embeddings`.
Pass `AbortSignal` from the runner interrupt path. Azure-style URLs beyond
that path are acceptable to fail with a clear HTTP error in this epic.

### Docs / helper

- Rewrite [CONFIG.md](../../CONFIG.md) § Embeddings: default identity +
  `EmbedHandle` wire; delete hashing / `common-kb-*` instructions.
- Align [settings-panel](../../features/settings-panel.md) “embedding block”
  with the implemented Default embedding model (not a second provider list).
- Add a settings-panel UX scenario (or extend S2) for Save embedding default →
  Inspector / embedding-node dropdowns update without reload.
- Close-out: [langflower-helper](../../../packages/server/skeleton/skills/langflower-helper/)
  Can/Cannot — sync dogfood copy. Node-library catalog rows. [node-sdk
  AGENTS.md](../../../packages/node-sdk/AGENTS.md) lists `EmbedHandle` next to
  `ToolHandle`.

## Out of scope

- `.langflower/kb/`, `common-kb-*`, contradiction curation, hashing embedder.
- Host ANN / sqlite-vec / LanceDB as a product index.
- Putting `apiKey` / `baseURL` on author `ExecutionContext` or custom-pack
  panels as the primary shipped path.
- Using `ToolHandle` / `defineToolRegistrations` as the embed contract
  (agents that need a phrase-search **tool** are a follow-up; they must not
  receive raw float batches in LLM context).
- Host bind of `EmbedHandle` onto arbitrary custom-pack `ExecutionContext`
  so packs skip the canvas wire (shipped packs **wire** the provider node).
- Chat/embedding model lists split in Settings (one provider model catalog;
  wrong id fails at the embeddings HTTP API).
- Sandboxed custom-node execution (TBD-001).
- Widening `defineNode` input generics in this epic.

## Use cases (acceptance stories)

### UC1 — Manual I/O check

**Who:** Operator validating a cloud or local embedding model.

**Do:** Settings → set default embedding provider/model → canvas:
`common-string` → `common-embed-text` → Preview on **`preview`** (and/or
`dim`); optionally `vector` ports into `common-embed-similarity`.

**Expect:** Preview shows `dim` and a short float prefix, not thousands of
JSON numbers. Similarity is a finite score. No LM Studio required if
Settings points at a reachable OpenAI-compatible embeddings API. Missing
default + empty panel → clear run error (not hang). Stop during an in-flight
embed aborts the HTTP call.

### UC2 — Custom pack uses wired EmbedHandle

**Who:** Author of a project pack (search over a pack-local corpus).

**Do:** Place **one** `common-embed-provider`, fan-out `embed` into the pack
ingest **and** search nodes (test pack in this epic). Pack ingest
uses `role: 'document'`; search uses `role: 'query'`.

**Expect:** Pack never sees the API key. Changing Settings default (or the
provider node panel) changes which API `embedTexts` hits on the next run.
`handle.dim` is a positive integer; a test pack that stores vectors then
queries with a second provider of another dim fails closed. TypeScript: pack
imports `EmbedHandle` from `@langflower/node-sdk`; canvas rejects a `tools`
wire into `embed`. Unit/integration: fake embeddings factory (no live cloud
required in CI); fake respects `signal` abort.

## Acceptance criteria

1. Settings shows Default embedding model; Save writes `embedding` on
   `LangflowerConfigSaveRequestedPayload` + config merge; project > global;
   Inspector embedding-node selects update after Save without full reload.
2. Palette group **Embeddings** lists the three nodes above; similarity has
   no provider/model fields.
3. SDK exports `EmbedHandle` (`dim`, `embedTexts` + `role`/`signal`) +
   `EMBED_HANDLE_WIRE_TYPE` (+ `isEmbedHandle`); `tool-handle` and
   `embed-handle` do not connect (`wireType` equality in the editor).
4. UC1 fixture: string → embed-text → Preview of compact `preview`; `dim`
   matches vector length; first-N prefix only.
5. UC2: a **test** pack/catalog consumer with required single `embed` input
   calls `embedTexts`; credentials only on the provider-node server bind;
   abort cancels in-flight HTTP; dim mismatch fails.
6. ADR-033 amended; CONFIG / settings-panel / node-library / helper skill /
   node-sdk AGENTS match shipped behaviour (no KB-as-base claim; no
   ToolHandle-as-embed).

## Suggested implementation order

1. Config type + `embedding` on save/draft payloads + Settings UI.
2. SDK `EmbedHandle` (`dim` / `role` / `signal`) + wire type + guard;
   connection tests.
3. Server `bindCreateEmbedding` (mirror
   [`bind-llm-context.ts`](../../../packages/server/src/bridge/bind-llm-context.ts))
   including abort on interrupt.
4. `common-embed-text` (compact preview) + `common-embed-similarity` (no
   provider panel) + `common-embed-provider` + fake factory tests.
5. Docs + helper skill + node-sdk AGENTS.

## Verify

- Intermediate (optional): focused vitest on config draft, embed adapter,
  wireType connect, and catalog node tests; `verify --quick` while iterating.
- **Close-out (required):** `npm run test` or full
  `node build/tools/agent-run.mjs verify` — unit **and** integration. Do not
  mark this epic done on `--quick` alone.

## Links

- Chat credential bind:
  [`resolve-provider-credentials.ts`](../../../packages/server/src/config/resolve-provider-credentials.ts)
- LLM Settings default:
  [`lf-settings-panel.component.ts`](../../../packages/ui/src/app/features/sidebar/components/lf-settings-panel.component.ts)
- Agent inventory contrast (`ToolHandle`, do not reuse):
  [`tool-handle.ts`](../../../packages/node-sdk/src/node-factory/define-tool-registrations/tool-handle.ts)
- [ADR-033](../../ADR.md#adr-033--markdown-memory-tools-no-embedding-as-base)
