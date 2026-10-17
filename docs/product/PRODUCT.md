---
kind: product
owner: docs
covers: []
status: current
---

# Langflower — product purpose

Canonical **purpose, goal, and product framing**. Technical architecture lives
in [architecture/ARCHITECTURE.md](../architecture/ARCHITECTURE.md); end-user readiness in
[use-cases/](use-cases/README.md). Short product vocabulary:
[GLOSSARY.md](GLOSSARY.md#part-1--for-users) (Part 1). This file does not
replace ADRs or feature docs.

## Purpose

Langflower is a **local, folder-scoped reactive node graph**. The LLM is a
node, not the product. It competes with chat-style harnesses (e.g. OpenCode /
Cursor-like agents) by making the pipeline explicit on a canvas — not by
copying another graph ETL tool.

OpenCode influences UX and config shape; Langflower is a **separate product**.

## Goal (near term)

The **coding-agent capabilities are Available**. A developer describes
work in their repo and drives it through a graph they author (clarify, red
team, coder, QA, review, result HITL) with harness tools and
`permission.ask`. The graph, not the model, chooses what happens next.

Which edges they draw and what they write in agent instructions are
**project configuration**. That configuration cannot be a missing product
capability: it is specific to each repository. A sample workflow in this
repo is an example, not the acceptance contract.

See [use-cases/coding-agent.md](use-cases/coding-agent.md).

## Primary user

**Near term:** a developer running Langflower against an existing code repo
(delivery bar: coding-agent use case).

**Same runtime:** anyone wiring chat, agent-to-agent, research, KB, or custom
gates on a local folder — not a distant second product.

## Differentiators

| Vs chat harnesses (OpenCode-like)                                                                                                           | Vs graph tools (Langflow, n8n)                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Hard harness:** workflow graph defines execution order; Assert/IF/Gate fail-closed where needed. LLM fluctuation must not skip QA/review. | **Easy bootstrap** into a real project folder; graphs for **folder-scoped work**, not only generic automation plumbing. |
| **Graph prototyping** — author and see agent/HITL loops on the canvas. The LLM is a node, not the product.                                  | Same runtime, friendlier path from empty folder → useful workflow.                                                      |
| **Extensibility** — MCP and skills as common agent primitives; custom nodes for graph processing or custom tools via **ToolHandle**.        |                                                                                                                         |

### Hard harness (product meaning)

1. The **graph** is the pipeline law — stages and edges are fixed by the
   author, not by the model’s next-step choice.
2. **Logic nodes** (Assert, IF, Switch, Compare, Gate, …) enforce fail-closed
   checks between agents when the scenario needs them.

### Nodes: one authoring contract

Built-in nodes (`@langflower/common-nodes`) and user packs
(`.langflower/nodes/<pack>/`) share the same SDK (`@langflower/node-sdk`).
Default author path is **`defineNode`**; use `defineReactiveNode` when you need
RxJS / StatefulObservable. Pack layout and npm model:
[ADR-030](../adr/030-custom-node-pack-layout-and-npm-model.md).

**Runtime loading differs on purpose** ([ADR-020](../adr/020-built-in-vs-custom-node-loading.md)):
built-ins are imported from the npm package (no per-start bundler/scan) to keep
startup fast. Custom packs are scanned and bundled by `@langflower/compiler`
([STATUS](STATUS.md) **done**). Sandboxed execution of arbitrary user-node
code remains **out of scope** until explicitly planned.

### Sub-Agent (target)

Main agents **invoke** canvas Sub-Agent nodes with selected skills — not
hidden in-LLM agents. Each Sub-Agent announces one `ToolHandle` on `subagent-registration`;
the parent wires that output into its `tools` inventory and calls it like any
other tool. `invoke` runs the specialist in-node and returns a string.
Skills on one Sub-Agent are an optional schema enum. Nested **workflow files**
are far future; nested specialists use child `subagent-registration` → parent
Sub-Agent `tools`.

**Layers** ([ADR-022](../adr/022-sub-agent-layers-swarm-nested-monte-carlo.md)):
swarm defaults to **serial** invokes (local LLM HW); parallel-by-nodeId is
opt-in / low priority; same-model Monte Carlo uses **Loop** + trial envelope;
**cross-model bake-off** = **N Sub-Agent** nodes (own provider/model each).

Normative: [ADR-021](../adr/021-sub-agent-registration-port-routed-spawn-nodeid-filter.md),
MECHANICS (`docs/_archive/DONE/EPICS/MECHANICS-tool-execution.md`).

## Roadmap frame

Do **not** use historical **Stage 1 / 2 / 3** labels for planning.

Active product progress = closing use-case Status gaps
(**Partial → Available**). Epics 00–16 and LLM foundation phases are
archived under DONE/ (`docs/_archive/DONE/README.md`).

**Status rule.** **Available** means every capability the scenario needs is
in the product and a live OpenAI-compatible run covered it. The user
assembles the graph, prompts, and layout. **Ready** means the scenario
needs no extra configuration: the product already does it. **User configuration** — graph edges, system prompts,
which scripts a gate wraps, which ToolHandles a pack exposes — is not a
missing capability. Sample-prompt quality (“the model wrote a good plan
for this repo”) is not a Missing part.

**North star:** [coding-agent](use-cases/coding-agent.md) capabilities are
**Available** (2026-10-17). `basic-coder` remains a smaller example, not
a rival claim.

**Operator proof (2026-10-17),** with an OpenAI-compatible provider, daily
use replaces an OpenCode-style harness:

- Tool calls; idle retry; dead-loop detection; 5xx recovery via autokick
  (Steer opens when that budget is exhausted, not on every 5xx).
- Pause → Steer → continue. Several tabs of one run stay in sync; drafts
  stay on the tab. Checked with the launcher.
- HITL Review Gate and feedback loops. Complex work uses a graph shaped
  like `docs/assets/img/lf_dev.png`. Work whose result cannot be approved
  up front uses a chat loop (`docs/assets/img/chat-loop.png`).
- A glance at the canvas shows the stage. The work log shows reasoning,
  intermediate text, and tool calls.
- Starter commands produced a custom `ok` / `fail` review-gate around
  formatter, build, and tests, and project ToolHandles for tests and
  formatter. The agent calls those tools. A failing gate sends failures
  back and the agent fixes them. That custom gate is not
  `common-hitl-review-gate`.
- The static fan-out in `docs/assets/img/fan-out.png` runs. It is not a
  claim that the brief beats one researcher. Branch quality is user
  configuration. After a completed Loop list, `rerunItems` re-runs the
  matching entries and keeps the other results. The author passes the axis
  string. Review prose is not parsed
  ([research-fanout-merge](use-cases/research-fanout-merge.md)).
- MCP stdio and HTTP nodes work; tools reach the agent.
- On a long run the browser tab can be closed; `langflower start` keeps
  going. An open launcher window is a reminder that work is in progress,
  not a progress panel. Resume is a workflow session: an explicit boundary
  writes a point, and the operator continues from that point.

**Bootstrap** (empty folder / folder switch → `.langflower` + seed workflow +
provider setup) is a **separate use case**:
[bootstrap-new-project](use-cases/bootstrap-new-project.md). Detailed bootstrap
UX is not inlined here. Global config and the Settings dual path landed
(epic 18). See [settings-panel](use-cases/settings-panel.md).

## Non-goals (current)

- Hosted multi-tenant cloud product
- Embedding the editor in a native webview (Electron / WebView2)
  unless later decided. That is **not** the launcher. A thin **Slint
  supervisor** that can spawn one CLI per project folder and opens the
  system browser after listen is shipped
  ([ADR-038](../adr/038-launcher-is-a-cli-supervisor.md)). Tauri was
  tried for that supervisor and rejected (WebView, large executable);
  FLTK was tried next (moderate size, ugly UI); Slint is the accepted
  toolkit.
- Continuing an in-flight run after the Langflower process dies. Reopening
  the app restores the workflow-session tab, so the conversation is still
  there. HITL and Memory are not stored inside a session-point payload.
- Image / video asset management for multimodal models
- Built-in IDE or git UI (use tools you already have)
- Sandboxed user-node execution (deferred)
- Replacing OpenCode config/tools 1:1 for compatibility’s sake
- Marketing a thin Plan → Coder demo as the coding-agent product claim

Long-horizon items above (sandbox, desktop shell, multi-tenant cloud) are
listed in TBD.md (`docs/_work/TBD.md`) so they stay visible without entering the near-term
TODO / epic queue. Promote to [architecture/ADR.md](../adr/README.md) when a direction is chosen.

## Related docs

| Doc                                                                             | Role                                                                                |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [use-cases/README.md](use-cases/README.md)                                      | Scenario Status bar                                                                 |
| [features/](features/README.md)                                                 | User-facing feature “what”                                                          |
| TBD.md (`docs/_work/TBD.md`)                                                    | Long-term goals / hard tradeoffs (not soon)                                         |
| [architecture/ARCHITECTURE.md](../architecture/ARCHITECTURE.md)                 | System / transport architecture                                                     |
| [STATUS.md](STATUS.md)                                                          | Package / capability implementation status                                          |
| [CONFIG.md](../reference/CONFIG.md)                                             | `langflower.jsonc` / providers                                                      |
| [ADR-021](../adr/021-sub-agent-registration-port-routed-spawn-nodeid-filter.md) | Sub-Agent canvas node + `subagent-registration` handle                              |
| [ADR-022](../adr/022-sub-agent-layers-swarm-nested-monte-carlo.md)              | Sub-Agent layers + N-Sub-Agent bake-off                                             |
| [ADR-035](../adr/035-uniform-inventory-wire-optional-tool-collection.md)        | One `tool-handle` inventory wire; optional Tool collection hub                      |
| spec.md (`docs/_archive/spec.md`)                                               | Historical Stage-1 bootstrap spec — prefer this file + use-cases for product intent |
