# hello-embed

Sample custom-node pack: index project markdown into a local SQLite store
(vectors + FTS5), retrieve with cosine + keyword (RRF), then pack full chunks
as Question + Context for a wire or an LLM tool.

Use the seeded workflows as-is for simple “search my `.md` files” tasks, or
copy this pack when you need a different corpus, chunker, or ranking.

## What it is

Three nodes in this folder, four workflows in `.langflower/workflows/`:

| Node                        | Role                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `hello-embed-ingest`        | Walk `**/*.md`, split on headings, embed one chunk at a time → sqlite. Streaming `progress` + `finish`.      |
| `hello-embed-search`        | `query` + `embed` → `hits` (JSON) and `text` (`Question` + full-chunk `Context`). Hybrid cosine + FTS5, RRF. |
| `hello-embed-search-handle` | Same retrieve as an LLM tool: `project_search` on `tools`.                                                   |

| Workflow           | Graph                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `kb-ingest`        | Embed provider → ingest → Finish. Progress in the feed.                                                                        |
| `kb-manual-search` | Chat / string query → search → Preview.                                                                                        |
| `kb-tool`          | `project_search` wired into an agent `tools` port.                                                                             |
| `kb-rag`           | Hybrid retrieve → packed `search.text` as LLM `userPrompt`; `project_search` + grep/read; Review ⇄ feedback; Approve → Finish. |

The index file defaults to `.langflower/.cache/hello-embed/kb.sqlite` (outside
this pack, so bootstrap force-seed does not wipe vectors). All three nodes
share that path via `DEFAULT_SQLITE_PATH` in `lib/paths.ts`.

Walk skips `node_modules`, `.git`, and `.langflower/.cache`. Embeddings come
from a wired `common-embed-provider` (`EmbedHandle`). The pack never sees API
keys.

## How to use

1. **Settings → Default embedding model** (OpenAI-compatible embeddings).
2. Run **KB ingest**. Re-run it after you add/edit markdown or switch the
   embedding model (dimension mismatch is rejected). An index built before
   embeddings `encoding_format: 'float'` may store all-zero vectors — search
   then scores every hit `0.00`; wipe by running ingest again on a current
   Langflower build.
3. Then run **KB manual search**, **KB tool**, or **KB RAG**.

`langflower start` compiles custom packs on startup, including this one.
After you edit the pack, Helper `compile_custom_nodes`, Custom → **Update**,
or restart.

Place **one** `common-embed-provider` and fan-out **embed** into ingest and/or
search nodes. Ingest uses the handle with role `document`; search / the tool
use role `query`.

Optional panel fields: `sqlitePath`, ingest `sourceDir` (empty = project
root), search `topK`.

## KB RAG

RAG means **retrieval-augmented generation**. An LLM does not automatically
know your private or recently changed project documents. RAG finds the most
relevant passages first and sends them to the LLM together with the question.
The model can then answer from that context instead of relying only on what it
learned during training.

RAG is useful when answers must come from a specific knowledge base. It can
find synonyms and close-in-meaning phrases that plain text matching may miss,
and it gives the model evidence it can quote and cite. It does not train or
change the model; it supplies relevant information for the current answer.

### Two phases

RAG has a preparation phase and a question-answering phase.

1. **Ingest the documents.** Read the knowledge base, split it into useful
   passages, create embeddings, and save a searchable index. Run **KB ingest**
   before using any search or RAG workflow. Without the index there are no
   passages to retrieve, so `kb-rag` cannot answer from the project docs.
   Run ingest again after the docs or embedding model change.
2. **Retrieve, then generate.** Embed the question, search the index, rank the
   best passages, and pack them into `Context`. Send the question and Context
   to the LLM, which writes an answer grounded in those passages.

### Glossary

- **Ingest.** Walk the corpus once, split it, embed it, and write an index. In
  this pack: `hello-embed-ingest` / **KB ingest**.
- **Chunks.** The retrieval unit — a slice of a document, not the whole file.
  Split so one hit is about one thing: a whole README in Context can drown the
  answer, while a tiny fragment may not contain enough evidence. This pack
  uses one markdown heading plus its body.
- **Vectors.** Fixed-length lists of numbers produced by an embedding model.
  Texts with close meanings have nearby vectors.
- **FTS5.** SQLite full-text search. It matches exact keywords and tokens in
  headings and bodies.
- **Cosine similarity.** A way to measure how close two vectors are. This
  sample uses it to rank chunks by meaning.
- **RRF** (reciprocal rank fusion). A method for combining the vector-search
  and keyword-search rankings into one result list.
- **Reranking.** A second scoring step that reorders retrieved passages and
  removes weak results before they are sent to the LLM.
- **HyDE** (Hypothetical Document Embeddings). The LLM drafts a possible
  answer, and that draft is embedded and used to search for related passages.

### Implemented in this sample

- **Document ingest.** `hello-embed-ingest` reads project markdown and creates
  a fresh local index.
- **Chunking.** Each markdown heading and its body becomes one chunk. Chunks
  keep retrieval focused: a whole file may cover too many topics, while a tiny
  fragment may not contain enough evidence.
- **Embeddings.** The embedding model turns each chunk and the question into
  vectors. Texts with similar meanings get nearby vectors, so search can find
  a relevant passage even when it uses different words.
- **Searchable index.** SQLite stores the prepared chunks, vectors, and
  text-search data. Questions query this store instead of rebuilding
  embeddings for the whole corpus.
- **Hybrid retrieval.** Cosine similarity finds passages with similar
  meaning. FTS5 finds exact words such as API names. RRF combines both ranked
  lists so either kind of match can reach the final results.
- **Context packing.** The best full chunks are formatted as `Question` +
  `Context`. The LLM receives complete section bodies rather than isolated
  matching lines.
- **Grounded generation.** `kb-rag` always retrieves before the first LLM
  turn. The system prompt asks the agent to answer from Context and cite each
  source by path and heading.
- **Optional multi-hop retrieval.** After reading the initial Context, the
  agent can call `project_search` with a new query based on what it learned.
  This creates a second retrieval hop when needed, but the tool may not be
  called on every run.

### Extra behavior in `kb-rag`

- `grep`, `read`, and `glob` let the agent open the source around a retrieved
  path when it needs more detail.
- Review sends human feedback back to the same agent session; Approve sends
  the accepted response to Finish.

For comparison, **KB manual search** stops after showing retrieved hits.
**KB tool** gives the model a search tool but lets it decide whether to use it.
**KB RAG** always performs the first retrieval before generation.

### Not in this sample

- **Reranking** with a second model to remove weak results before building
  Context (TBD-009 in `docs/TBD.md`).
- **HyDE or query rewriting** to improve retrieval for vague questions.
- **Overlapping or token-window chunks** for documents that do not divide
  cleanly at headings.
- **Token-budgeted Context** to fit results into smaller model windows.
- **Automated evaluation** for retrieval quality and answer faithfulness.

Copy the pack if you need those. This workflow is a compact RAG example, not a
complete knowledge-base product.

## Adapt for your case

Keep this folder as the sample. For a domain-specific index, copy the pack,
rename the `type` strings, and change the pieces you actually need:

| You need                        | Start from                       | Typical change                                                                                                                                                                                                                                 |
| ------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Other files (`.ts`, PDFs, XML)  | `lib/walk-markdown.ts`           | Filter, parser, skip list                                                                                                                                                                                                                      |
| Different chunking              | `lib/chunk-markdown.ts`          | Size windows, code symbols, breadcrumbs                                                                                                                                                                                                        |
| Another store or path           | `lib/schema.ts`, `lib/paths.ts`  | Table layout, default path, wipe vs upsert                                                                                                                                                                                                     |
| Hybrid retrieve                 | `lib/search.ts`, `lib/schema.ts` | Cosine + FTS5 fused with RRF (`k = 60`). `hits[].score` is RRF, not raw cosine. Candidate pool `max(topK * 4, 32)` then slice top-K.                                                                                                           |
| Graph search (Preview / Finish) | `search.ts` + `kb-manual-search` | `text` is Question + full-chunk Context (same packing as RAG)                                                                                                                                                                                  |
| Agent-callable search           | `search-handle.ts` + `kb-tool`   | ToolHandle `invoke` → packed `text`; sqlite path from params                                                                                                                                                                                   |
| Retrieve-then-generate          | `kb-rag`                         | Forced hybrid retrieve into LLM `userPrompt`. Wire `hello-embed-search-handle` for a second retrieve; grep/read for files. Review `feedback` → agent; Approve `response` → Finish. Do **not** zip with `common-concat` (`multi: 'zip'` stalls) |
| Streaming ingest progress       | `ingest.ts`                      | `defineReactiveNode`; `progress` `{ role: 'progress', streaming: true }` (not `result` bubbles); `finish` `{ role: 'none'` }                                                                                                                   |
| Safer Stop / resume             | ingest embed loop                | Sequential one-chunk `embedTexts` (this sample)                                                                                                                                                                                                |

Contracts to keep:

- Wire **`EmbedHandle`** from `common-embed-provider`, not a raw HTTP client
  and not a `ToolHandle`.
- Close over resolved `sqlitePath` from `ctx.params` in the tool handler —
  do not put pack paths on `ToolHandlerContext`.
- One shared default path constant; do not duplicate the string in nodes or
  workflows.
- Internal `from './file.ts'` needs `allowImportingTsExtensions` (already set
  here, with `noEmit`). Without it `tsc --noEmit` fails and the pack does
  not compile.

Host peers stay `@langflower/node-sdk` / `rxjs` / `@rx-evo/stateful-observable`
(same as `my-nodes`). Add author `dependencies` only if you pull extra
libraries, then `npm install` inside the pack.
