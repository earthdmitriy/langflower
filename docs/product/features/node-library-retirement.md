---
kind: feature
owner: docs
covers: []
status: current
---

## 2. Node retirement policy

Early demos shipped a small common-node set for executor/canvas smoke. Only a
subset is **production**; draft/test types stay out of the palette (see
[§12 Migration](node-library.md#12-migration-from-early-demo-nodes)).

### 2.1 Shipped — in `catalog.ts`

| Node                      | Type                                               | Mode     | Status   |
| ------------------------- | -------------------------------------------------- | -------- | -------- |
| Fake LLM                  | `common-fake-llm`                                  | reactive | **done** |
| OpenAI-compatible LLM     | `common-openai-llm`                                | reactive | **done** |
| MCP stdio                 | `common-mcp-stdio`                                 | reactive | **done** |
| MCP http                  | `common-mcp-http`                                  | reactive | **done** |
| Tool collection           | `common-tool-collection`                           | reactive | **done** |
| Tool invoke               | `common-tool-invoke`                               | reactive | **done** |
| HITL Review Gate          | `common-hitl-review-gate`                          | reactive | **done** |
| Chat Loop                 | `common-chat-loop`                                 | reactive | **done** |
| Chat Input                | `common-chat-input`                                | reactive | **done** |
| Router                    | `common-router`                                    | reactive | **done** |
| Merge                     | `common-merge`                                     | reactive | **done** |
| Delay                     | `common-delay`                                     | reactive | **done** |
| Checkpoint                | `common-checkpoint`                                | reactive | **done** |
| Repeat                    | `common-repeat`                                    | reactive | **done** |
| Concat                    | `common-concat`                                    | reactive | **done** |
| Split (paced)             | `common-split-paced`                               | reactive | **done** |
| Read File                 | `common-read-file`                                 | reactive | **done** |
| Write File                | `common-write-file`                                | reactive | **done** |
| Append File               | `common-append-file`                               | reactive | **done** |
| String / Number / Boolean | `common-string`, `common-number`, `common-boolean` | reactive | **done** |
| String (multiline)        | `common-string-multiline`                          | reactive | **done** |
| Preview                   | `common-preview`                                   | reactive | **done** |
| Hint                      | `common-hint`                                      | reactive | **done** |
| Tool inspect              | `common-tool-inspect`                              | reactive | **done** |
| Finish                    | `common-finish`                                    | reactive | **done** |

**Not shipped (do not list as done):** `common-agent-*`, remaining harness
FS/shell palette nodes (list/glob/grep/edit/bash). Read/Write/Append File ship
as **Text** via `ctx.files`. Hard harness Assert/IF/Switch/Compare/Gate and
`common-review` are **shipped**.

**Roles:** Plan/Coder/Explorer are **presets on the LLM node**, not separate
palette types ([LLM_NODES.md](../../reference/LLM_NODES.md)).

**Router** is not replaced by IF/Switch. It provides reactive identity
routing on dynamic channels and selective partial runs
(`getSelectiveDownstreamNodeIds`). IF/Switch handle harness **decisions**;
Router handles **stream fan-out / fan-in**.

### 2.2 Replace — Constant → Primitives

| Retired                                                                    | Replacement                                                      |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `common-constant` (untyped string)                                         | `common-string`, `common-number`, `common-boolean`               |
| `common-ask-user` / `common-hitl-ask-user` / `common-hitl-approval-choice` | `common-hitl-review-gate` (+ `common-chat-input` for cold-start) |
| `common-fake-tool-registration`                                            | `common-*-tools` packs (KB / Crawl / Memory)                     |
| `common-fake-mcp-server` / `common-mcp-server`                             | `common-mcp-stdio` / `common-mcp-http` (`tools`)                 |

### 2.3 Draft/test — keep out of production registry

`common-concat` and `common-delay` are **shipped** in `catalog.ts` (useful
flow/text nodes). Distinct from the planned `common-join` (single `lines[]` +
separator param).

| Node    | Type             | Reason                    |
| ------- | ---------------- | ------------------------- |
| Collect | `common-collect` | Multi-port demo only      |
| Triple  | `common-triple`  | Reactive emit demo only   |
| Flaky   | `common-flaky`   | Retry policy test fixture |
| Throw   | `common-throw`   | Error policy test fixture |

Test-only behaviour (retry, error policy) stays in **internal test fixtures**,
not the production catalog.

---
