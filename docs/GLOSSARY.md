# Glossary

Short definitions of Langflower vocabulary. This file does **not** replace
[PRODUCT](PRODUCT.md), [features](features/README.md), [ADR](ADR.md), or
[EXECUTION_ARCHITECTURE](EXECUTION_ARCHITECTURE.md) — each entry is 1–3
sentences plus a See link.

**Status words are namespaced** (catalog vs use-case vs package vs TBD). See
[Part 2 — Docs & readiness vocabulary](#docs--readiness-vocabulary).

- [Part 1 — For users](#part-1--for-users) (UX order: framing and common questions first)
- [Part 2 — For developers](#part-2--for-developers) (starts with [reactive model](#reactive-model-critical))

---

## Part 1 — For users

What operators and workflow authors mean by these words in the product.
Entries are ordered for **UX**: framing and common questions first (not A–Z).

### Product & project

#### Langflower

A local, project-scoped coding agent with a visual workflow graph. It makes
the agent pipeline explicit on a canvas rather than hiding it in a chat
harness or copying a generic ETL graph tool.

See [PRODUCT](PRODUCT.md).

#### Hard harness

Differentiator: the **graph** (and logic nodes such as Assert / IF / Gate) is
the pipeline law. The model must not skip stages by choosing “what’s next.”

Hard harness is the strict pipeline rule inside the broader
[Harness](#harness).

See [PRODUCT](PRODUCT.md#hard-harness-product-meaning).

#### Harness

Langflower as a whole is the harness around the LLM — explicit graph,
operator controls, permissions, and [tools](#tools) — not a chat-only loop.

Do not confuse with the callable [Tools](#tools) surface alone.

See [PRODUCT](PRODUCT.md).

#### Workflow

The live graph in the editor: you edit it in memory and can execute it.
Saving under the [Workspace](#workspace) (`workflows/`) keeps and reloads it —
persistence is how you retain a workflow, not what defines one.

See [workflow-management](features/workflow-management.md),
[workflow-execution](features/workflow-execution.md).

#### Workspace

Langflower’s project data root: the `.langflower/` folder (workflows, config,
skills, custom nodes, runs). Your project source files live outside it.

See [CONFIG](CONFIG.md), [bootstrap-new-project](use-cases/bootstrap-new-project.md).

#### Skill

Instruction pack you attach to an LLM or Sub-Agent node. On disk under the
workspace: `skills/<id>/SKILL.md` (plus optional companion files).

See [LLM_NODES](LLM_NODES.md).

#### Permission floor

Project setting that caps what tools may do: allow, ask the operator, or deny.

See [CONFIG](CONFIG.md).

#### Bootstrap

First open (or Settings force-reseed) creates or refreshes the
[Workspace](#workspace) from the packaged skeleton.

See [getting-started](features/getting-started.md),
[bootstrap-new-project](use-cases/bootstrap-new-project.md).

#### Skeleton

Packaged starter content copied into a project on bootstrap (config, skills,
starter workflows, `my-nodes`, …). Starter workflows are **part of** the
skeleton seed — not a separate top-level product concept. A future Sample
workflows UI (Draft) would still draw from this seed for browse/import.

Today first-run may seed the full packaged workflow set; the Draft target is a
minimal seed plus explicit catalog import.

See [skeleton](features/skeleton.md), [use-cases/skeleton](use-cases/skeleton.md).

### Run lifecycle

Ordered operator controls on an active execution: **Run → Pause → Steer →
Stop**.

#### Run

Start one active execution of a workflow (only one at a time).

See [workflow-execution](features/workflow-execution.md).

#### Pause

Soft interrupt: the run stays alive; the agent waits for guidance (then
typically [Steer](#steer)). Not Stop and not Checkpoint.

See [workflow-execution](features/workflow-execution.md),
[run-interruption](use-cases/run-interruption.md).

#### Steer

Send operator text into a paused agent to redirect it.

See [workflow-execution](features/workflow-execution.md),
[run-interruption](use-cases/run-interruption.md).

#### Stop

Hard cancel: ends the run.

See [workflow-execution](features/workflow-execution.md),
[run-interruption](use-cases/run-interruption.md).

#### Recovery notice

Amber feed banner when the LLM provider fails recoverably (`Retrying…` with
attempt / last / next timers, or `Paused for Steer`). A **suspended** notice
opens the Steer composer; retry does not. Idle / dead-loop strategy:
[LLM_RECOVERY](LLM_RECOVERY.md).

See [feed-panel](features/feed-panel.md),
[run-interruption](use-cases/run-interruption.md) S6.

### Surfaces & durable controls (static)

UI panels and durable operator concepts — not the run state machine.

#### Feed

Right sidebar timeline of what the run is doing when nothing is selected on
the canvas. Selection swaps in the [Inspector](#inspector).

See [feed-panel](features/feed-panel.md).

#### Composer

Bottom input and actions strip for starting from Chat Input and answering
mid-run prompts (HITL, permission ask, steer).

See [feed-panel](features/feed-panel.md), [hitl-chat](features/hitl-chat.md).

#### HITL

Human-in-the-loop: the graph waits for your review or input on a human gate
(Review Gate, Review, HITL-marked inputs). Separate from
[Permission ask](#permission-ask) and from [Steer](#steer), even when they
share the composer area.

See [hitl-chat](features/hitl-chat.md).

#### Permission ask

Separate prompt to allow or deny a tool call. Not canvas HITL and not Steer.

See [hitl-chat](features/hitl-chat.md), [CONFIG](CONFIG.md).

#### Inspector

Right sidebar for the selected node’s settings, ports, and values. Replaces
the feed while something is selected.

See [inspector](features/inspector.md).

#### Checkpoint

Author-placed save point you can continue from later. Not the same as
[Pause](#pause) (soft interrupt) or [Detachable long run](#detachable-long-run)
(closing the browser).

See [workflow-execution](features/workflow-execution.md),
[resumable-checkpoint-jobs](use-cases/resumable-checkpoint-jobs.md).

#### Detachable long run

Close the UI while the server process keeps the run; reconnect later to live
or settled state. Not Pause and not Checkpoint.

See [detachable-long-run](use-cases/detachable-long-run.md).

### Agents & tools

#### Tools

Callable capabilities the LLM can invoke (project files, shell, web, pack
tools, MCP tools, …), gated by the [permission floor](#permission-floor).
Tools are the callable surface inside the [Harness](#harness).

See [CONFIG](CONFIG.md), [node-library](features/node-library.md).

#### Sub-Agent

Specialist agent node on the canvas that the main agent can spawn with
selected skills. Results return as tool results on dedicated ports — not as
HITL feedback.

See [PRODUCT](PRODUCT.md#sub-agent-spawn-target),
[agent-swarm](use-cases/agent-swarm.md).

#### MCP

External tool servers that contribute [tools](#tools) into an agent’s set
(in-product). Not the same as the developer Langflower MCP control plane
(see Part 2).

See [node-local-mcp](use-cases/node-local-mcp.md).

### Canvas & authoring

#### Node / edge / port

A **node** is a graph step. An **edge** (wire) connects ports. A **port** is a
typed input or output on a node; wires must be type-compatible, and a wire
wins over an inline literal.

See [node-library](features/node-library.md), [NODES](NODES.md).

#### Canvas

The visual graph editor surface where you place nodes and wires.

See [visual-workflow-editor](features/visual-workflow-editor.md).

#### Palette

Left-rail catalog of node types you can drag onto the canvas (built-ins and
custom packs).

See [node-library](features/node-library.md).

#### Cluster

A connected group of nodes. “Run from here” starts that group (not an
upstream-only subset).

See [workflow-execution](features/workflow-execution.md).

#### Role preset

Plan / Coder / Explorer styles on one LLM node type — not separate palette
“agent” types. Presets shape tools and permissions without rewriting skill
text.

See [LLM_NODES](LLM_NODES.md).

#### Custom node pack

Your own node types under the workspace (`nodes/<pack>/`), authored with the
same SDK as built-ins.

See [PRODUCT](PRODUCT.md#nodes-one-authoring-contract),
[node-library](features/node-library.md).

---

## Part 2 — For developers

Contributor vocabulary and **mechanics** for Part 1 terms. Do not restate
product blurbs — follow the Part 1 link, then the implementation note.

### Reactive model (critical)

Langflower execution is **reactive-only**: there is no separate batch engine.
Read this before RuntimeFacade / Runner / authoring terms below.

#### Reactive runtime

The in-process execution model in `@langflower/runtime`: a live graph of
typed ports whose values are `StatefulObservable` / `StatefulConnection`
streams. `RuntimeEditor` holds the graph; `RuntimeRunner` wires demand,
seeds ports, and drives start / resume / interrupt / telemetry. The server
session owns one `RuntimeFacade` (`editor` + `runner`) — it does not reimplement
execution under `packages/server`.

There is no idle-settle completion heuristic: a run ends on `stopsRun`, empty
graph, or interrupt. Interactive HITL / feedback graphs stay alive between
turns because of that explicit lifecycle.

See [EXECUTION_ARCHITECTURE](EXECUTION_ARCHITECTURE.md),
[REACTIVE_NODES](REACTIVE_NODES.md).

#### Reactive node

A node whose live behaviour is a `bind`-built graph of typed reactive ports
(inputs / outputs), not a one-shot function call. Authors use
`defineReactiveNode` (advanced RxJS path) or `defineNode` (sync/Promise
adapter over the same runtime). Definition-time `bind` is a **probe** for
port metadata (discarded); each canvas placement gets a fresh
`getInstance()` bind for the live ports. That instance (and any intentional
closures it holds) survives `done` / Stop / Start until the workflow is
reloaded, the node is rematerialized, or Langflower shuts down — not the same
as durable Checkpoint resume.

See [REACTIVE_NODES](REACTIVE_NODES.md) § Instance lifetime,
[HOW_TO_WRITE_REACTIVE_NODES](HOW_TO_WRITE_REACTIVE_NODES.md),
[NODES](NODES.md).

### Extending Part 1 terms (mechanics only)

#### Bootstrap / Skeleton

Product meaning: [Bootstrap](#bootstrap), [Skeleton](#skeleton).

Mechanics: `packages/server/src/bootstrap/project-bootstrap.service.ts`; seed
root `packages/server/skeleton/` (includes starter workflows).

#### Checkpoint

Product meaning: [Checkpoint](#checkpoint).

Mechanics: author boundary via `common-checkpoint` / `createCheckpoint`
metadata; continue-from picker. See
[EXECUTION_ARCHITECTURE](EXECUTION_ARCHITECTURE.md).

#### Cluster

Product meaning: [Cluster](#cluster).

Mechanics: weakly connected component; scopes `start` / `startNode` / cold
HITL. See [EXECUTION_ARCHITECTURE](EXECUTION_ARCHITECTURE.md).

#### Custom node pack

Product meaning: [Custom node pack](#custom-node-pack).

Mechanics: pack layout [ADR-030](ADR.md#adr-030--custom-node-pack-layout--npm-model);
discover/esbuild via `@langflower/compiler`; load split vs built-ins
[ADR-020](ADR.md#adr-020--built-in-vs-custom-node-loading).

#### Feed / execution feed

Product meaning: [Feed](#feed).

Mechanics: `executionFeed.snapshot` plus live `runner.*` projected into the
sidebar. See [feed-panel](features/feed-panel.md),
[EXECUTION_ARCHITECTURE](EXECUTION_ARCHITECTURE.md).

#### Harness

Product meaning: [Harness](#harness).

Mechanics: do **not** equate harness with `@langflower/tools` alone. That
package implements project I/O used as **tools** inside the product harness
(`create-project-harness`, injected on ExecutionContext).

#### HITL

Product meaning: [HITL](#hitl).

Mechanics: HITL-marked ports / Review Gate / Review / `config.hitl`;
`runner.hitl` path. Distinct from permission asks and `steerControl`. See
[EXECUTION_ARCHITECTURE](EXECUTION_ARCHITECTURE.md).

#### MCP (in-run)

Product meaning: [MCP](#mcp).

Mechanics: `ToolHandle` / `McpHandle` wiring; system vs node-local MCP.
Injected in `build-execution-context`. Distinct from
[Langflower MCP](#langflower-mcp).

#### Permission ask

Product meaning: [Permission ask](#permission-ask).

Mechanics: `runner.permission.ask` / reply; pending asks store on the server.

#### Permission floor

Product meaning: [Permission floor](#permission-floor).

Mechanics: merged deny/ask/allow against project config; gate in
`@langflower/tools`. See [CONFIG](CONFIG.md).

#### Role preset

Product meaning: [Role preset](#role-preset).

Mechanics: `packages/common-nodes/src/ai/features/llm-role-preset.ts`; overlay in
`build-execution-context` materializes tool permissions without rewriting
skill text.

#### Run / Pause / Steer / Stop

Product meaning: [Run lifecycle](#run-lifecycle).

Mechanics: [ADR-031](ADR.md#adr-031--stop-hard-cancel-vs-pause-soft-interrupt-vs-steer),
[ADR-032](ADR.md#adr-032--soft-pause-via-hidden-steercontrol-hitl-port);
lifecycle intents on `runner.*`; Pause/Steer use the hidden `steerControl`
HITL-class port.

#### Recovery notice

Product meaning: [Recovery notice](#recovery-notice).

Mechanics: `LlmRecoveryNotice` (`retry` | `suspended`) on the LLM `recovery`
port. Stuck stream / dead-loop strategy: [LLM_RECOVERY](LLM_RECOVERY.md).

#### Skill

Product meaning: [Skill](#skill).

Mechanics: catalog over WS; body loaded at run seed; frontmatter in
[LLM_NODES](LLM_NODES.md).

#### Sub-Agent

Product meaning: [Sub-Agent](#sub-agent).

Mechanics: [ADR-021](ADR.md#adr-021--sub-agent-registration--port-routed-spawn-nodeid-filter)
— canvas Sub-Agent node + one `subagent-registration` `ToolHandle`;
`invoke` runs the in-node loop. Deeper swarm / nesting still open in
product docs.

#### Tools

Product meaning: [Tools](#tools).

Mechanics: tool inventory / `ToolHandle`; builtins via
`create-project-harness` plus pack registrations and MCP; optional
`common-tool-collection` hub; injected on ExecutionContext.

#### Workspace

Product meaning: [Workspace](#workspace).

Mechanics: on-disk root `.langflower/` under the project; bootstrap seeds it
from `packages/server/skeleton/`.

#### Workflow

Product meaning: [Workflow](#workflow).

Mechanics: live graph owned by RuntimeEditor; identity and persist path =
filename stem under `.langflower/workflows/`
([ADR-029](ADR.md#adr-029--workflow-identity-is-the-filename-stem)).

### Runtime & protocol

#### Bridge

Server WebSocket attach layer (`attach-langflower-bridge`) that wires intents
and snapshots between UI and session/runtime. Not a second execution engine.
Same protocol idea spans `@langflower/websocket-bridge`, server `bridge/`, and
the UI bridge service.

See [EXECUTION_ARCHITECTURE](EXECUTION_ARCHITECTURE.md),
[ADR-012](ADR.md#adr-012--internal-websocket-bus-rest-for-bulk-escape-hatches).

#### Demand / seed

**Demand** activates lazy port subscriptions so the graph runs. **Seed**
pushes start values onto ports at start/resume.

See [EXECUTION_ARCHITECTURE](EXECUTION_ARCHITECTURE.md).

#### ExecutionContext

Per-run injected context: tools, permissions, LLM binds, caps. Host I/O is
composed on the server, not owned as domain inside the thin server package.

See [EXECUTION_ARCHITECTURE](EXECUTION_ARCHITECTURE.md).

#### Intent / fact / snapshot

Clients emit `*.requested` **intents**. The server broadcasts authoritative
**facts** and full-slice **snapshots**. Intents are not yet authoritative
state.

See [ADR-012](ADR.md#adr-012--internal-websocket-bus-rest-for-bulk-escape-hatches),
[REACTIVITY](REACTIVITY.md).

#### Internal WebSocket bus

Primary live protocol (`/ws`). REST is for bulk escape hatches only
([ADR-012](ADR.md#adr-012--internal-websocket-bus-rest-for-bulk-escape-hatches)).

#### Langflower MCP

Dev stdio control plane over the internal WS bus (Cursor agents). Not the
same as in-run [MCP](#mcp).

See [LANGFLOWER_MCP](LANGFLOWER_MCP.md),
[ADR-024](ADR.md#adr-024--dev-mcp-control-plane-over-internal-ws-bus).

#### Runner / RuntimeRunner

Owns demand wiring, start / resume / interrupt, status, and telemetry; WS
namespace `runner.*`.

See [EXECUTION_ARCHITECTURE](EXECUTION_ARCHITECTURE.md).

#### RuntimeEditor

In-memory executable graph (nodes, edges, ports, clusters). Locked while a
run is active.

See [EXECUTION_ARCHITECTURE](EXECUTION_ARCHITECTURE.md).

#### RuntimeFacade

Session-owned pair: `editor` (RuntimeEditor) + `runner` (RuntimeRunner). The
entry point to the [reactive runtime](#reactive-runtime) for one session.

See [EXECUTION_ARCHITECTURE](EXECUTION_ARCHITECTURE.md).

#### Session

`LangflowerSession`: process-side owner of the active workflow document and
one RuntimeFacade.

See [NAVIGATION](NAVIGATION.md) (session state owner).

### Node authoring

#### `defineNode` / `defineReactiveNode`

Author factories in `@langflower/node-sdk` for a [reactive node](#reactive-node):
sync/Promise path vs RxJS / `StatefulObservable` path. Both run on the
[reactive runtime](#reactive-runtime).

See [HOW_TO_WRITE_REACTIVE_NODES](HOW_TO_WRITE_REACTIVE_NODES.md),
[NODES](NODES.md), [REACTIVE_NODES](REACTIVE_NODES.md).

#### StatefulObservable

Hot typed port streams (including an error lane) used by the
[reactive runtime](#reactive-runtime) — not raw Subjects. Port status is part
of the stream: inactive / loading / value / error.

See [HOW_TO_WRITE_REACTIVE_NODES](HOW_TO_WRITE_REACTIVE_NODES.md),
[REACTIVE_NODES](REACTIVE_NODES.md).

#### ToolHandle

Wire payload that registers a callable tool into an agent’s inventory.
Optional hub: `common-tool-collection` (ADR-035).

See [NODES](NODES.md), package `@langflower/node-sdk`.

#### `uiSchema` / params

`uiSchema` is the static inspector panel schema. `params` are runtime panel
values on the node instance.

See [NODES](NODES.md), [inspector](features/inspector.md).

### Packages

One-line roles (DAG lives in [NAVIGATION](NAVIGATION.md)). Package
`@langflower/tools` ≠ product term [Harness](#harness).

| Package                        | Role                                                          |
| ------------------------------ | ------------------------------------------------------------- |
| `@langflower/shared`           | Protocol / config / workflow / checkpoint types — no I/O      |
| `@langflower/node-sdk`         | Author factories and port contracts                           |
| `@langflower/runtime`          | Editor graph + runner                                         |
| `@langflower/tools`            | Project I/O: builtins, permissions, crawl, MCP clients        |
| `@langflower/common-nodes`     | Built-in node catalog                                         |
| `@langflower/websocket-bridge` | Typed WS client/server transport                              |
| `@langflower/server`           | Thin Express + bridge + session                               |
| `@langflower/ui`               | Angular editor + folds                                        |
| `@langflower/cli`              | CLI workspace package; published product is root `langflower` |
| `@langflower/compiler`         | Discover / esbuild custom packs under `.langflower/nodes/`    |
| `@langflower/eval`             | Fixture packs and fail-closed regression gate                 |
| `@langflower/mcp`              | Dev MCP stdio → live WS bridge                                |

### Docs & readiness vocabulary

#### Catalog Status

Node existence in the catalog: `done` / `stub` / `planned`. Means the node
shape exists — **not** that a product use case is runnable.

See [node-library](features/node-library.md).

#### Package Status

Implementation maturity of packages/capabilities in [STATUS](STATUS.md).
Separate from use-case Status.

#### TBD

Long-horizon undecided goals and tradeoffs. Not the near-term TODO / epic
queue.

See [TBD](TBD.md).

#### Use-case Status

Scenario readiness: Authorable → Mock-testable → **Implementable** (real LLM

- tools). Source of truth: [use-cases/README](use-cases/README.md). Catalog
  `done` ≠ use-case `Implementable`.

### Coding principles (short)

Pointers only — full rules in [PRINCIPLES](PRINCIPLES.md) and
[REACTIVITY](REACTIVITY.md).

#### Edge effect

Named I/O after a pure fold (WS, FS, canvas mutation).

#### Package / Slice / Unit / Kernel

Feature-sliced structure: build boundary, domain capability, colocated
cluster, non-feature platform.

See [PRINCIPLES](PRINCIPLES.md#feature-sliced-structure).

#### Result

Expected failure as a value (`{ ok: true | false }`), not a throw for normal
control flow.

See [PRINCIPLES](PRINCIPLES.md#functional-error-handling).

#### Scan fold

Pure `(state, action) → state` reducer; one concern per fold. Do not hide
reduction in `subscribe` / `tap` / Angular `effect`.

See [REACTIVITY](REACTIVITY.md).

#### Tagged action

Closed union that normalizes bridge/local events for a fold.

#### Thin server

`@langflower/server` stays transport, composition, and secrets. Domain I/O
belongs in `@langflower/tools`; node implementations in `common-nodes`.

See [PRINCIPLES](PRINCIPLES.md#thin-server--do-not-grow-domain-here).
