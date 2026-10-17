---
kind: adr
owner: docs
covers: []
status: current
id: ADR-014
supersedes: []
superseded-by: []
package: docs
---

## ADR-014 — Project-root harness I/O

**Status:** accepted · **Date:** 2026-06-17

**Context:** Stage 1 server services (workflow CRUD, config, node bundler cache) write
only under `<project>/.langflower/`. The common-nodes program requires harness tools
(Read File, Write File, Grep, Bash) that operate on the **user project tree** (parent
of `.langflower/`). Flowise-style path-traversal CVEs require explicit sandboxing.

**Alternatives considered:**

- **Keep all I/O under `.langflower/`** — blocks real agent workflows (read/edit source).
- **Unrestricted fs in node execute** — rejected on security grounds.
- **Separate worker process now** — deferred to Stage 2+ sandbox; too large for demo.

**Decision:** Harness handlers resolve every user path via `resolveProjectPath`
(project root + deny list). Generic services remain `.langflower/`-only. Builtin
tool bodies live in `@langflower/tools` (`packages/tools/`); the server injects a
bound harness through `RunHostServices` — not direct `fs` in nodes or
`@langflower/shared`, and not `ExecutionContext.harness` on the public EC.

**Tradeoffs accepted:**

- (+) Enables Plan/Coder agent presets without rewriting server layout.
- (+) Centralized deny list and permission checks before file/shell/web calls.
- (−) Two filesystem boundaries to document and test (`.langflower/` vs project root).
- (−) Symlink escape and SSRF need ongoing hardening as harness nodes land.

**Consequences:**

- `@langflower/tools` — path fence, builtin handlers, read-class `postProcess`,
  SSRF `webFetch`, crawl persist, KB store, MCP stdio runtime. **Must not**
  import `shared`. **May** import `@langflower/node-sdk` for `ToolHandle`.
  DAG-forced twins with shared (inspector catalogs, secret-id charset, MCP
  server entries) are [ADR-039](./039-dag-forced-twins-stay-copies-until-the-dag-flips.md).
- Server `buildExecutionContext` is a thin composer: credentials + WS HITL
  hooks; attach `RunHostServices` (allowedHosts / fence) on a private symbol.
- Catalog nodes call tools `create*` factories and peek `getRunHostServices`;
  they do not read `ctx.harness` / `ctx.kb` / `ctx.crawl` on public
  `ExecutionContext`.
- OpenAI unbound adapters live in `@langflower/common-nodes`
  (`ai/features/openai/`); server only binds secrets.
- Revisit when sandboxed user-node execution (ADR-010 Stage 2) supersedes in-process model.

**Extension (2026-07-19, epic 11):** `langflower.jsonc` may set
`harness.allowedRoots: string[]` — absolute (preferred) or project-relative
directories trusted **outside** the Langflower project root (typical: Obsidian
vault). `resolveProjectPath` / `resolveFenceRoot` accept paths under those
roots; deny-path globs still apply inside each fence. Empty/missing
`allowedRoots` preserves the original project-root-only default. Not a blanket
escape hatch — each vault path must be listed explicitly.

**Extension (2026-07-19, thin server):** Domain implementations moved out of
`packages/server/src/{crawl,kb,mcp,llm}/` into `@langflower/tools` (project
runtime I/O) and `common-nodes/ai/openai/` (provider adapters).

**Extension (2026-07-20, ADR-019):** Domain pack invocation is **not** a
second harness `toolId` registry. Invokers ship as configs from
`@langflower/tools/domain-tool-configs` and become `ToolHandle.invoke`; see
[ADR-019](./019-toolhandle-invocation-not-harness-toolid-registry.md).

---
