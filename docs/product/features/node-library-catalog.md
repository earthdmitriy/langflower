---
kind: feature
owner: docs
covers: []
status: current
---

## 7. Catalog by category (status vs `catalog.ts`)

Summary tables. **P0** nodes have port detail in [§8](node-library.md#8-p0-node-port-reference).
Statuses below match [STATUS.md](../STATUS.md) / `catalog.ts` (2026-07-19).

### 7.1 Logic

| Node       | Type                | P   | Status   | Description                                                                          |
| ---------- | ------------------- | --- | -------- | ------------------------------------------------------------------------------------ |
| Router     | `common-router`     | —   | **done** | Reactive channel routing                                                             |
| Merge      | `common-merge`      | P1  | **done** | Fan-in / combine                                                                     |
| Delay      | `common-delay`      | —   | **done** | Canvas pacing delay (not the agent `sleep` builtin)                                  |
| Checkpoint | `common-checkpoint` | —   | **done** | Explicit durable resume boundary                                                     |
| Repeat     | `common-repeat`     | —   | **done** | Emit `value` N times (first ASAP, then on `trigger`), `index` (0-based), then `done` |
| IF         | `common-if`         | P0  | **done** | Boolean condition → `true` / `false` outputs                                         |
| Switch     | `common-switch`     | P0  | **done** | Value + rules → `pass` / `fail` / `default`                                          |
| Compare    | `common-compare`    | P0  | **done** | `a`, `b`, `op` → `result: boolean`                                                   |
| Assert     | `common-assert`     | P0  | **done** | **Hard harness:** fail run branch if condition false                                 |
| Gate       | `common-gate`       | P0  | **done** | Forward `value` when `pass` true                                                     |
| Loop       | `common-loop`       | P2  | **done** | Map-collect `items[]` → body → `results`; `rerunItems` replaces matching slots       |

### 7.2 Text

| Node           | Type                    | P   | Status   | Description                                                           |
| -------------- | ----------------------- | --- | -------- | --------------------------------------------------------------------- |
| Concat         | `common-concat`         | P1  | **done** | Multi `value` (`zip`) + `separator` → join when all slots fresh       |
| Split (paced)  | `common-split-paced`    | P1  | **done** | Split on divider; one non-empty chunk per trigger; `index` + `finish` |
| Read File      | `common-read-file`      | P0  | **done** | `ctx.files.read`; `update` dynamic re-read; relative-only             |
| Write File     | `common-write-file`     | P1  | **done** | `ctx.files.write`; path inline + content wire-only; no permission ask |
| Append File    | `common-append-file`    | P1  | **done** | `ctx.files.append` + multiline delimiter                              |
| Template       | `common-template`       | P0  | planned  | `{{var}}` substitution from `context` json                            |
| Split          | `common-split`          | P0  | planned  | Delimiter split → `parts[]` (not paced emit)                          |
| Replace        | `common-replace`        | P0  | planned  | Find/replace (literal or regex)                                       |
| Regex Extract  | `common-regex-extract`  | P0  | planned  | Pattern → `matches[]`                                                 |
| Join           | `common-join`           | P1  | planned  | `lines[]` + separator                                                 |
| Trim           | `common-trim`           | P1  | planned  | Whitespace trim                                                       |
| Markdown Strip | `common-markdown-strip` | P1  | planned  | MD → plain text                                                       |
| Truncate       | `common-truncate`       | P2  | planned  | Max length + ellipsis                                                 |
| Hash           | `common-hash`           | P2  | planned  | SHA-256 fingerprint                                                   |

### 7.3 AI

**Shipped:** LLM + internal tool-loop + `common-review` + fake tool registration

- HITL. **Not shipped:** separate agent palette types, Chat Input, role tool
  profiles (epic 04).

| Node                  | Type                      | P   | Status      | Description                                                                                                                                       |
| --------------------- | ------------------------- | --- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fake LLM              | `common-fake-llm`         | —   | **done**    | Demo stream + scripted internal tool-loop                                                                                                         |
| OpenAI-compatible LLM | `common-openai-llm`       | —   | **done**    | Real chat; role presets; internal tool-loop (epic 01)                                                                                             |
| MCP stdio             | `common-mcp-stdio`        | —   | **done**    | Node-owned stdio MCP → `tools` (`ToolHandle[]`) ([node-local-mcp](../use-cases/node-local-mcp.md))                                                |
| MCP http              | `common-mcp-http`         | —   | **done**    | Node-owned HTTP MCP → `tools` (`ToolHandle[]`)                                                                                                    |
| Review Gate           | `common-hitl-review-gate` | —   | **done**    | HITL approve / request-changes                                                                                                                    |
| Chat Loop             | `common-chat-loop`        | —   | **done**    | HITL reply only → `feedback`; run ends on Stop                                                                                                    |
| Review (LLM tools)    | `common-review`           | —   | **done**    | `accept` / `feedback` → ports — epic 03                                                                                                           |
| Critique (LLM tools)  | `common-critique`         | —   | **done**    | attack framing `assignment`/`packet` — path-choice                                                                                                |
| Plan/Coder/Explorer   | _(presets on LLM)_        | —   | partial     | Prompts/skills today; tool profiles epic 04                                                                                                       |
| `common-agent-*`      | —                         | —   | planned     | **Superseded** — do not implement as separate types                                                                                               |
| Chat Input            | `common-chat-input`       | P0  | **done**    | epic 13; see [hitl-chat.md](hitl-chat.md)                                                                                                         |
| Sub-Agent             | `common-sub-agent`        | P2  | **partial** | OUT `subagent-registration` + in-node loop shipped; L1+ open — [ADR-021](../../adr/021-sub-agent-registration-port-routed-spawn-nodeid-filter.md) |
| Memory Tools          | `common-memory-tools`     | P2  | **done**    | Pack → `tools` (`get_memory_tree`…`update_plan`/`read_plan`) + `plan` feed result; harness invoke not used                                        |
| Tool collection       | `common-tool-collection`  | P2  | **done**    | Optional hub: combine many `tools` → one `ToolHandle[]` (last-wins) — [ADR-035](../../adr/035-uniform-inventory-wire-optional-tool-collection.md) |
| Tool invoke           | `common-tool-invoke`      | P2  | **done**    | Graph-side `handle.invoke` by `toolId` + JSON `args` (no LLM)                                                                                     |
| Memory                | `common-memory`           | P2  | **done**    | Secondary graph I/O via `ctx.memory`                                                                                                              |

### 7.4 Harness (filesystem, shell, web)

OpenCode analog in parentheses. Target: server-side, project-root sandbox.

**Shipped as Text** (not Harness palette): Read / Write / Append File use
`ctx.files` (path fence, relative-only, **no** permission ask). Remaining rows
are still planned agent-style harness palette dual-surface.

| Node        | Type                 | P   | OpenCode      | Status   | Description                                  |
| ----------- | -------------------- | --- | ------------- | -------- | -------------------------------------------- |
| Read File   | `common-read-file`   | P0  | `read`        | **done** | Text — `ctx.files` + `update` re-read        |
| Write File  | `common-write-file`  | P1  | `write`       | **done** | Text — `ctx.files` overwrite                 |
| Append File | `common-append-file` | P1  | —             | **done** | Text — append + delimiter                    |
| List Files  | `common-list-files`  | P0  | `list`        | planned  | Directory entries                            |
| Glob        | `common-glob`        | P0  | `glob`        | planned  | Pattern → paths; **respects `.gitignore`**   |
| Grep        | `common-grep`        | P0  | `grep`        | planned  | Regex search → matches                       |
| Web Fetch   | `common-web-fetch`   | P0  | `webfetch`    | planned  | HTTP GET → body, status                      |
| Edit File   | `common-edit-file`   | P1  | `apply_patch` | planned  | Exact replace or unified diff                |
| Bash        | `common-bash`        | P1  | `bash`        | planned  | Shell command + timeout (default-deny nudge) |

Server module: `packages/server/src/harness/` — **not present** (epic 01).

### 7.5 Primitives (additional)

| Node                      | Type                                            | P   | Status   | Description                   |
| ------------------------- | ----------------------------------------------- | --- | -------- | ----------------------------- |
| String / Number / Boolean | see [§6](node-library.md#6-primitives-category) | P0  | **done** | Typed literals                |
| Set Fields                | `common-set-fields`                             | P0  | planned  | n8n-style field map → json    |
| JSON Parse                | `common-json-parse`                             | P0  | planned  | string → json                 |
| JSON Stringify            | `common-json-stringify`                         | P0  | planned  | json → string                 |
| Passthrough               | `common-passthrough`                            | P1  | planned  | Identity `any` (escape hatch) |
| Noop                      | `common-noop`                                   | P2  | planned  | Scope anchor for partial runs |

### 7.6 Output

| Node         | Type                  | P   | Status   | Description                                                                             |
| ------------ | --------------------- | --- | -------- | --------------------------------------------------------------------------------------- |
| Preview      | `common-preview`      | —   | **done** | Display wired value on canvas + work log                                                |
| Hint         | `common-hint`         | —   | **done** | Canvas markdown annotation — hidden `note`, no wires, no feed                           |
| Tool inspect | `common-tool-inspect` | —   | **done** | Dump `tool-handle` as `toolId` + example args + `inputSchema`; optional `toolId` filter |
| Finish       | `common-finish`       | —   | **done** | `stopsRun` sink                                                                         |

### 7.7 Embeddings

OpenAI-compatible embeddings via server-bound credentials. Settings default:
`embedding: "providerId/modelId"` ([CONFIG § Embeddings](../../reference/CONFIG.md#embeddings)).

| Node             | Type                      | P   | Status   | Description                                                                   |
| ---------------- | ------------------------- | --- | -------- | ----------------------------------------------------------------------------- |
| Embed text       | `common-embed-text`       | P1  | **done** | `text` → `vector` (json) + `dim` + compact `preview`; optional panel override |
| Embed similarity | `common-embed-similarity` | P1  | **done** | Two `vector` (json) → `score` (cosine); no HTTP, no provider panel            |
| Embed provider   | `common-embed-provider`   | P1  | **done** | `embed` out (`embed-handle` / `EmbedHandle`) for batch pack consumers         |

**UC1:** `String → Embed text → Preview` on **`preview`**. **UC2:** one Embed
provider, fan-out **`embed`** to pack ingest/search. Ingest:
`embedTexts(..., { role: 'document' })`; search: `{ role: 'query' }`. Do **not**
wire agent `tools` for float batches — use `EmbedHandle` ([ADR-033](../../adr/033-markdown-memory-tools-no-embedding-as-base.md)).

### 7.7b Removed — vector knowledge base

Former `.langflower/kb/` pipeline and `common-kb-*` palette nodes are **removed**
([ADR-033](../../adr/033-markdown-memory-tools-no-embedding-as-base.md),
[STATUS](../STATUS.md)). Agent memory uses `common-memory-tools` under
`.langflower/memory/`. Contradiction-curation use-case docs describe historical
graph shapes only.

**Historical layout (removed):**

```
.langflower/kb/
├── manifest.json
└── collections/{collectionId}/chunks.jsonl + vectors.bin
```

| Node (removed)   | Type               |
| ---------------- | ------------------ |
| KB Tools         | `common-kb-tools`  |
| KB Ingest        | `common-kb-ingest` |
| KB Embed         | `common-kb-embed`  |
| KB Search        | `common-kb-search` |
| KB List/Delete/… | `common-kb-*`      |

### 7.7a Obsidian vault helpers

Markdown helpers for personal Obsidian vaults (**done**, epic 11). Vault
**filesystem** I/O stays on harness builtins with optional
`harness.allowedRoots` for paths outside the Langflower project root.

| Node                 | Type                               | P   | Status   | Description                                    |
| -------------------- | ---------------------------------- | --- | -------- | ---------------------------------------------- |
| Obsidian Frontmatter | `common-obsidian-frontmatter`      | P1  | **done** | Parse / patch YAML frontmatter                 |
| Obsidian Wikilinks   | `common-obsidian-wikilink-rewrite` | P1  | **done** | Extract + rename `[[wikilink]]` targets        |
| Obsidian Build MOC   | `common-obsidian-build-moc`        | P1  | **done** | Compose Map of Content note from title + links |

**Helper pipeline:** `String (inbox) → Frontmatter → Wikilinks → Build MOC`

Demo: `demo-project/.langflower/workflows/obsidian-kb.json`.

### 7.8 Web crawl

Storage root: `<project>/.langflower/crawl/{runId}/` — **done** (epic 12).
Nodes call `@langflower/tools` `createWebFetch` / `createCrawlContext` /
`runBfsCrawl`; host allowlist via `getRunHostServices` (not `ctx.harness` /
`ctx.crawl` on public `ExecutionContext`).

| Node          | Type                   | P   | Status   | Description                                      |
| ------------- | ---------------------- | --- | -------- | ------------------------------------------------ |
| Crawl Tools   | `common-crawl-tools`   | P0  | **done** | Pack → agent `tools` (`crawl_fetch`…`crawl_bfs`) |
| Fetch URL     | `common-fetch-url`     | P0  | **done** | Secondary I/O: Web Fetch + HTML → text           |
| Extract Links | `common-extract-links` | P1  | **done** | Secondary I/O: HTML → absolute `links[]`         |
| Crawl         | `common-crawl`         | P1  | **done** | Secondary I/O: BFS from seed                     |
| Save Page     | `common-save-page`     | P1  | **done** | Secondary I/O: persist under crawl dir           |

Guards: private IP / localhost / link-local blocked; optional
`harness.allowedHosts`; `maxBytes` / timeouts; crawl budget via `maxPages` /
`maxDepth`. Optional `robots.txt` remains P2.

---
