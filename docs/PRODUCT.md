# Langflower — product purpose

Canonical **purpose, goal, and product framing**. Technical architecture lives
in [ARCHITECTURE.md](ARCHITECTURE.md); end-user readiness in
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

Ship the **full coding-agent** use case as **Implementable**: a developer
describes work in their repo and drives it through a pre-authored multi-stage
graph (clarify → red team → coder → QA → review → result HITL) with harness
tools and `permission.ask`, without the model choosing “what’s next.”

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
[ADR-030](ADR.md#adr-030--custom-node-pack-layout--npm-model).

**Runtime loading differs on purpose** ([ADR-020](ADR.md#adr-020--built-in-vs-custom-node-loading)):
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

**Layers** ([ADR-022](ADR.md#adr-022--sub-agent-layers-swarm-nested-monte-carlo)):
swarm defaults to **serial** invokes (local LLM HW); parallel-by-nodeId is
opt-in / low priority; same-model Monte Carlo uses **Loop** + trial envelope;
**cross-model bake-off** = **N Sub-Agent** nodes (own provider/model each).

Normative: [ADR-021](ADR.md#adr-021--sub-agent-registration--port-routed-spawn-nodeid-filter),
[MECHANICS](DONE/EPICS/MECHANICS-tool-execution.md#sub-agent-as-toolhandle).

## Roadmap frame

Do **not** use historical **Stage 1 / 2 / 3** labels for planning.

Active product progress = closing use-case Status gaps
(**Partial → Implementable**). Epics 00–16 and LLM foundation phases are
archived under [DONE/](DONE/README.md).

**North star:** [coding-agent](use-cases/coding-agent.md) **full** multi-loop
pipeline. **Implementable** for that use case means the full graph only — a
basic Plan→Coder pilot is smoke/CI, not the product claim.

**Demo + Fake CI:** `coding-agent.json` + `execute-coding-agent.ws.test.ts`
(epic 21) — topology proof. **Next product bar:** real-LLM S1–S7 Expects on
that demo (smoke remains `basic-coder`, not the product claim).

**Bootstrap** (empty folder / folder switch → `.langflower` + seed workflow +
provider setup) is a **separate use case**:
[bootstrap-new-project](use-cases/bootstrap-new-project.md). Detailed bootstrap
UX is not inlined here. Global config + Settings dual path: epic 18 Partial.

## Non-goals (current)

- Hosted multi-tenant cloud product
- Electron / Tauri desktop shell (unless later decided)
- Serializable chat-session mechanics (node-internal state; maybe later)
- Image / video asset management for multimodal models
- Built-in IDE or git UI (use tools you already have)
- Sandboxed user-node execution (deferred)
- Replacing OpenCode config/tools 1:1 for compatibility’s sake
- Marketing a thin Plan → Coder demo as the coding-agent product claim

Long-horizon items above (sandbox, desktop shell, multi-tenant cloud) are
listed in [TBD.md](TBD.md) so they stay visible without entering the near-term
TODO / epic queue. Promote to [ADR.md](ADR.md) when a direction is chosen.

## Related docs

| Doc                                                                                | Role                                                                                |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [use-cases/README.md](use-cases/README.md)                                         | Scenario Status bar                                                                 |
| [features/](features/README.md)                                                    | User-facing feature “what”                                                          |
| [TBD.md](TBD.md)                                                                   | Long-term goals / hard tradeoffs (not soon)                                         |
| [ARCHITECTURE.md](ARCHITECTURE.md)                                                 | System / transport architecture                                                     |
| [STATUS.md](STATUS.md)                                                             | Package / capability implementation status                                          |
| [CONFIG.md](CONFIG.md)                                                             | `langflower.jsonc` / providers                                                      |
| [ADR-021](ADR.md#adr-021--sub-agent-registration--port-routed-spawn-nodeid-filter) | Sub-Agent canvas node + `subagent-registration` handle                              |
| [ADR-022](ADR.md#adr-022--sub-agent-layers-swarm-nested-monte-carlo)               | Sub-Agent layers + N-Sub-Agent bake-off                                             |
| [ADR-035](ADR.md#adr-035--uniform-inventory-wire--optional-tool-collection)        | One `tool-handle` inventory wire; optional Tool collection hub                      |
| [spec.md](../spec.md)                                                              | Historical Stage-1 bootstrap spec — prefer this file + use-cases for product intent |
