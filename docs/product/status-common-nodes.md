---
kind: product
owner: docs
covers: []
status: current
---

## Common nodes — runtime catalog

Registered in [`catalog.ts`](../../packages/common-nodes/src/catalog.ts) only.
Target / stub specs live as `NODE.md` under `packages/common-nodes/src/**` and
in [features/node-library.md](features/node-library.md) — **do not treat those as
shipped**.

| Node                      | Type                      | Status   | Notes                                                                                                                   |
| ------------------------- | ------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------- |
| String / Number / Boolean | `common-string`, …        | **done** | Literals                                                                                                                |
| String (multiline)        | `common-string-multiline` | **done** | Literal textarea (`inline: 'text-multiline'`)                                                                           |
| Merge                     | `common-merge`            | **done** | Flow                                                                                                                    |
| Delay                     | `common-delay`            | **done** | Flow                                                                                                                    |
| Loop                      | `common-loop`             | **done** | External map-collect; `rerunItems` replaces matching slots (epic 07)                                                    |
| Repeat                    | `common-repeat`           | **done** | Flow — emit `value` N times (first ASAP, then on `trigger`), `index` (0-based), then `done`                             |
| Router                    | `common-router`           | **done** | Reactive channels                                                                                                       |
| Preview                   | `common-preview`          | **done** | Output                                                                                                                  |
| Hint                      | `common-hint`             | **done** | Output — canvas markdown annotation (no wires)                                                                          |
| Tool inspect              | `common-tool-inspect`     | **done** | Output — `toolId` + example args + `inputSchema`; optional `toolId` filter                                              |
| Finish                    | `common-finish`           | **done** | `stopsRun`                                                                                                              |
| Checkpoint                | `common-checkpoint`       | **done** | Explicit durable boundary + picker resume (epic 20)                                                                     |
| Concat                    | `common-concat`           | **done** | Text                                                                                                                    |
| Split (paced)             | `common-split-paced`      | **done** | Text — one non-empty chunk per trigger (first ASAP), `index`, then `finish`                                             |
| Read File                 | `common-read-file`        | **done** | Text — `ctx.files` (relative-only, no permission ask)                                                                   |
| Write File                | `common-write-file`       | **done** | Text — `ctx.files`                                                                                                      |
| Append File               | `common-append-file`      | **done** | Text — `ctx.files` + delimiter                                                                                          |
| Review Gate               | `common-hitl-review-gate` | **done** | Reactive HITL (approve / request-changes; multi-await OK)                                                               |
| Chat Loop                 | `common-chat-loop`        | **done** | HITL reply → `feedback`; infinite agent chat until Stop                                                                 |
| Fake LLM                  | `common-fake-llm`         | **done** | Demo stream + scripted internal tool-loop                                                                               |
| OpenAI-compatible LLM     | `common-openai-llm`       | **done** | Reactive stream/tool loop; idle/5xx retry → Steer; role tool profiles                                                   |
| MCP stdio                 | `common-mcp-stdio`        | **done** | Node-owned stdio MCP → `tools` (`ToolHandle[]`)                                                                         |
| MCP http                  | `common-mcp-http`         | **done** | Node-owned HTTP MCP (+ optional launch) → `tools` (`ToolHandle[]`)                                                      |
| Review (LLM tools)        | `common-review`           | **done** | Shared reactive loop + forced `accept`/`feedback` policy                                                                |
| Critique (LLM tools)      | `common-critique`         | **done** | Shared reactive loop + path-choice attack policy                                                                        |
| Sub-Agent                 | `common-sub-agent`        | **done** | `subagent-registration` + in-node invoke on a graph drawn before Start. L1+ / dynamic topology is not a current promise |
| Chat Input                | `common-chat-input`       | **done** | Composer cold-start entry (epic 13)                                                                                     |
| Assert                    | `common-assert`           | **done** | Hard harness (epic 06)                                                                                                  |
| IF                        | `common-if`               | **done** | Hard harness (epic 06)                                                                                                  |
| Gate                      | `common-gate`             | **done** | Hard harness (epic 06)                                                                                                  |
| Compare                   | `common-compare`          | **done** | Hard harness (epic 06)                                                                                                  |
| Switch                    | `common-switch`           | **done** | Hard harness (epic 06); static `pass`/`fail`/`default` ports                                                            |
| Memory Tools              | `common-memory-tools`     | **done** | ADR-033 — markdown tools + `update_plan` / `plan` feed under `.langflower/memory/`                                      |
| Embed text                | `common-embed-text`       | **done** | Epic 42 — Settings default + compact preview; raw texts (no e5)                                                         |
| Embed similarity          | `common-embed-similarity` | **done** | Epic 42 — cosine; no provider panel                                                                                     |
| Embed provider            | `common-embed-provider`   | **done** | Epic 42 — `embed-handle` / `EmbedHandle` for pack consumers                                                             |
| Tool collection           | `common-tool-collection`  | **done** | Optional hub: combine `tools` → one `ToolHandle[]` (last-wins; ADR-035)                                                 |
| Tool invoke               | `common-tool-invoke`      | **done** | Graph-side `handle.invoke` by `toolId` + JSON `args` (no LLM)                                                           |
| Fetch URL                 | `common-fetch-url`        | **done** | Epic 12 — SSRF-guarded GET + HTML→text                                                                                  |
| Extract Links             | `common-extract-links`    | **done** | Epic 12 — HTML → absolute links                                                                                         |
| Save Page                 | `common-save-page`        | **done** | Epic 12 — persist under `.langflower/crawl/{runId}/`                                                                    |
| Crawl                     | `common-crawl`            | **done** | Epic 12 — BFS depth/page caps + save                                                                                    |

### Not in catalog (often overstated as done elsewhere)

| Area                               | Types / path                                                                                        | Status                                                                | Track                                                                                                                                                                  |
| ---------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent palette types                | `common-agent-*`                                                                                    | **planned** (roles = LLM presets)                                     | EPICS (`docs/_archive/DONE/EPICS/README.md`) 01/04                                                                                                                     |
| Text beyond Concat / file I/O      | Template, one-shot Split, …                                                                         | **stub** / **planned**                                                | node-library §7 — `common-split-paced` shipped; `common-split` (`parts[]`) still planned                                                                               |
| JSON helpers                       | Parse, Stringify, Set Fields                                                                        | **stub** / **planned**                                                | node-library §7                                                                                                                                                        |
| Harness FS/shell nodes             | list/glob/grep/edit/bash as palette nodes                                                           | **planned**                                                           | Read/Write/Append File ship as Text via `ctx.files` (not harness ask)                                                                                                  |
| Tool-loop + builtins               | invoke `read`…`move`/`sleep`/`bash` and `ask_user` via `@langflower/tools`                          | **done**                                                              | epic 01; `ask_user` is default-on HITL text (question in feed; composer Send); `move` is workspace rename without bash; `sleep` is a capped wait (1–300s) without bash |
| Project memory (markdown tools)    | `common-memory-tools` → `.langflower/memory/`                                                       | **done**                                                              | [ADR-033](../adr/033-markdown-memory-tools-no-embedding-as-base.md); `update_plan` / `plan` feed; skeleton `kb-create` / `kb-navigate`                                 |
| hello-embed sample pack            | skeleton `nodes/hello-embed` + `kb-ingest` / `kb-manual-search` / `kb-tool` / `kb-rag`              | **done**                                                              | markdown → sqlite (vectors + FTS5); hybrid RRF retrieve; pack tsconfig must allow `.ts` imports (`allowImportingTsExtensions`)                                         |
| Vector KB pipeline / curation      | former `common-kb-*`                                                                                | **removed**                                                           | superseded by ADR-033                                                                                                                                                  |
| Obsidian vault helpers             | frontmatter / wikilinks / MOC                                                                       | **deferred**                                                          | TBD-007 (`docs/_work/TBD.md#tbd-007--obsidian-vault-helpers`)                                                                                                          |
| Crawl research nodes               | fetch/extract/crawl/save                                                                            | **done**                                                              | epic 12                                                                                                                                                                |
| Runtime `permission.ask` ladder    | feed Allow/Deny for **builtins** in tool loop                                                       | **done**                                                              | epic 02; wired packs/MCP skip ask (ADR-033)                                                                                                                            |
| Runtime `ask_user`                 | feed question bubble + composer Send; optional option chips; tool result is formatted operator text | **done**                                                              | sibling of `permission.ask` (`runner.askUser.*`); not Pause/Steer                                                                                                      |
| Tools package + permission adapter | `@langflower/tools`, `server/src/harness/`                                                          | **done**                                                              | epics 01 / 02                                                                                                                                                          |
| MCP client / inventory map         | `@langflower/tools` mcp/, LLM `tools` port                                                          | **done** — fixture CI; maintainer confirmed live MCP nodes 2026-10-17 | epic 16 / 41; [TESTING](../guides/TESTING.md#live-openai-compatible--mcp-tool-calling)                                                                                 |
