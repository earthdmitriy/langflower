# Embeddings

How Langflower talks to OpenAI-compatible **embedding** endpoints, and why
that path is **not** the same as chat. Settings identity and catalog nodes:
[CONFIG § Embeddings](CONFIG.md#embeddings). Canvas wire: `EmbedHandle`
([GLOSSARY](GLOSSARY.md)). Bug that taught the `encoding_format` rule:
[FOUND_BUGS BUG-2026-08-26b](FOUND_BUGS.md).

This is **not** product vector-KB storage. Project memory is markdown tools
([ADR-033](ADR.md#adr-033--markdown-memory-tools-no-embedding-as-base)). Packs
own their sqlite/indexes and call `EmbedHandle.embedTexts`.

---

## Call chain

```text
Settings embedding: "providerId/modelId"
        │
        ▼
common-embed-provider / common-embed-text
        │  prefix passage: / query:  (provider only)
        ▼
ExecutionContext host.createEmbedding   ← server binds secrets
        │
        ▼
createEmbedding  →  OpenAI SDK embeddings.create
        │           encoding_format: 'float'  (required)
        ▼
toVectors  →  Float32Array[]  (reject empty / mixed dim / zero-norm)
```

| Piece                                                                                      | Owns                                                     |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| [`create-embedding.ts`](../packages/common-nodes/src/embeddings/create-embedding.ts)       | HTTP + response parse                                    |
| [`bind-embed-context.ts`](../packages/server/src/bridge/bind-embed-context.ts)             | Secrets only                                             |
| [`embed-provider/node.ts`](../packages/common-nodes/src/embeddings/embed-provider/node.ts) | `EmbedHandle`, `passage:` / `query:` prefixes, dim probe |
| Pack (e.g. hello-embed)                                                                    | Chunking, sqlite, cosine search — never `apiKey`         |

Do **not** copy `POST /v1/embeddings` into a pack that already has a wired
`EmbedHandle`. A second HTTP client belongs only in a CLI-only pack that
does **not** depend on `@langflower/common-nodes`.

---

## Chat vs embeddings (openai-node)

Both use the same provider `baseURL` / `apiKey` and the same `OpenAI`
client. **The request helpers are different APIs.**

|                             | Chat                             | Embeddings                                                                                                                           |
| --------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| SDK call                    | `client.chat.completions.create` | `client.embeddings.create`                                                                                                           |
| Extra body field            | none like this                   | `encoding_format?: 'float' \| 'base64'`                                                                                              |
| If the field is omitted     | —                                | SDK **injects `base64`** then `toFloat32Array` on every row ([openai-node PR 1312](https://github.com/openai/openai-node/pull/1312)) |
| Local LM Studio / llama.cpp | usually fine                     | often **ignore** `encoding_format`, still return JSON `number[]`                                                                     |

If you omit `encoding_format`, the SDK still runs the base64 unwrap. It
casts `embedding` to `string` and decodes. A real `number[]` from a local
server becomes a **`Float32Array` of zeros** (or a wrong dim). Ingest
looks successful: probe `dim` matches, sqlite fills, search scores are
all `0.00` because cosine of zeros is 0.

Langflower always sends **`encoding_format: 'float'`**. Then the SDK
returns the body as-is (no unwrap). `toVectors` copies `number[]` (or a
non-zero typed array) into `Float32Array`.

Do **not** “fix” this with a parallel `fetch` parser in common-nodes.
The SDK is the client; embeddings just need the extra field chat does
not have.

---

## Response handling

After the SDK returns `data[]`:

1. Order rows by `index` (fallback: array order).
2. Each `embedding` must be a finite `number[]` or `Float32Array` /
   `Float64Array`. `{ length: 256 }` (non-array object) is a chat model
   or a bad decode — **throw**.
3. Empty vector, mixed dims, or **L2-norm === 0** — **throw**. A zero
   vector is not a valid embedding. Do not store it. Do not treat probe
   `dim: 256` as proof the model works.

`l2Normalize` in a pack (hello-embed) runs **after** this. Normalizing
zeros stays zeros; the host must fail first.

---

## `EmbedHandle` roles

`common-embed-provider` prefixes texts before `createEmbedding`:

| `embedTexts` option              | Prefix      |
| -------------------------------- | ----------- |
| `{ role: 'document' }` (default) | `passage: ` |
| `{ role: 'query' }`              | `query: `   |

Ingest uses **document**; search uses **query**. That is E5 / Nomic-style
asymmetric embedding. A model that does not expect the prefix still
returns a **non-zero** vector of the prefixed string — prefix is not the
zero-vector bug.

Packs must reject a stored dim that does not match `handle.dim` after a
model switch.

---

## Symptoms of the base64 unwrap

| What you see                                                           | What it is not                                          |
| ---------------------------------------------------------------------- | ------------------------------------------------------- |
| Search hits with `score: 0.00`, often first files on disk (walk order) | Ranking cutoff missing; “bad corpus”                    |
| sqlite `chunk_vec` blobs all zero, dim looks right                     | Empty chunk text (`embedTextLen` was hundreds of chars) |
| Chat completions on the same `baseURL` / model work                    | Proof the embedding model is dead                       |
| `rawCtor: Float32Array`, `rawNorm: 0` from a debug dump                | Proof the host decoded wrong, not sqlite                |

An index written under the old unwrap is garbage. Re-run **KB ingest** on
a build that sends `encoding_format: 'float'`. Custom → **Update** only
recompiles the pack; the fix lives in `@langflower/common-nodes`. Restart
the **workspace** server (`npm run dev`), not a stale global `langflower`
from npm.

---

## Tests

[`create-embedding.test.ts`](../packages/common-nodes/src/embeddings/create-embedding.test.ts)
locks:

- `create` body includes `encoding_format: 'float'`
- `{ length: N }` objects throw
- zero-norm `Float32Array` throws
- `AbortSignal` forwarded; already-aborted fails closed

---

## Related

| Doc                                                                                        | Role                                     |
| ------------------------------------------------------------------------------------------ | ---------------------------------------- |
| [CONFIG § Embeddings](CONFIG.md#embeddings)                                                | User config, Settings, LM Studio example |
| [features/node-library.md § 11.5](features/node-library.md#115-embedding-provider-catalog) | Catalog node table                       |
| [HOW_TO_WRITE_REACTIVE_NODES.md](HOW_TO_WRITE_REACTIVE_NODES.md)                           | Pack authoring (`EmbedHandle` wire)      |
| hello-embed [`README.md`](../packages/server/skeleton/nodes/hello-embed/README.md)         | Sample ingest / search pack              |
