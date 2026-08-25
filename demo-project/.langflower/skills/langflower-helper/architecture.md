# Langflower architecture — trust and transparency

High-level facts for “how it works / why trust it”. Not a package DAG. Prefer
this file over inventing infrastructure.

## What it is

- Local, **folder-scoped reactive node graph**. The LLM is a node, not the
  product.
- The **workflow graph** is the pipeline law (hard harness): stages and edges
  are authored; the model does not freely skip QA/review/gates outside the
  graph.

## Layers (user-facing)

1. CLI — `langflower start` (default port **4010**)
2. Local **server** — owns runtime, project I/O under `.langflower/`
3. **WebSocket bus** — control plane between server and editor
4. Angular **editor** — canvas, feed, inspector, Settings, composer

Project product data for Langflower lives under **`.langflower/`**.

## WS bus (shared contracts)

- UI and server speak the **same typed event contracts** (shared
  `langflowerWsConfig` / co-versioned protocol).
- Client sends **intents** such as `runner.*.requested`,
  `workflow.*.requested`.
- Server emits authoritative **snapshots and facts** (e.g.
  `workflow.current.snapshot`, `runner.*`, `executionFeed`, …).
- No parallel “UI-only” DTO protocol for the main control plane; not a hidden
  REST RPC for runner/workflow orchestration.
- Shared contracts keep editor and runtime aligned and inspectable.

## Server-first state / thin UI

- Authoritative workflow, runner, and feed state live on the **server**.
- The editor is a **stateless thin client**: on connect it is hydrated with
  **initial snapshots**, then stays in sync by **event sourcing** over the WS
  bus (folding server facts into local projections — not the source of truth).
- **Closing or reopening a browser tab does not stop a running workflow** while
  `langflower start` / the server process stays up. Reconnect → fresh snapshots
    - continued facts.
- Soft **Pause**, Hard **Stop**, and checkpoint discard are **explicit** runner
  controls — do **not** equate “tab closed” with Stop. Process kill / reboot is
  different again (see Knowledge base §7).

## Execution model

- Nodes and edges run on a **reactive runtime**: ports are live streams. A node
  may receive and emit **at any time** while the run is alive — not a single
  batch “call node → return once”.
- Canvas node instances stay alive across **Stop / done / Start** while the
  same workflow is loaded. Authors may **intentionally** keep in-memory
  internal state across runs until the user **loads another workflow** or
  **shuts down Langflower**. That is not durable Checkpoint resume after
  process restart.
- **HITL loops** (Review Gate, feedback ports, composer Start/Send) are normal
  **internal waiting state of nodes**, not a separate product “interrupt the
  engine” mechanism.
- LLM provider idle **aborts** the in-flight request, then default
  **autokick** (exponential backoff, full stored messages + kick user
  turn). Dead-loop aborts the same way but waits **`retryBaseDelayMs`**
  (not idle backoff) before that replay. HTTP 429 / 5xx / network use the
  short transient budget, then join the idle autokick wait **without** a
  kick turn or penalty bump. `'retry'` notices on the `recovery` port stay
  in the feed after reasoning/draft, tick locally on the visit tail, and
  do **not** open Steer. Autokick off or a finite cap exhausted keep the
  node alive for **Steer / Resume** (`'suspended'`).
  Partial draft text is telemetry, not committed history.
  Authentication/configuration failures are terminal. Generic reload of any
  failed non-LLM node is not yet shipped.
- Also on the bus: runner start / resume / interrupt intents, `permission.ask`,
  and related facts.

## Agents on the canvas

- LLM / agent nodes use **skills** and harness tools as wired in the graph.
- **Sub-Agent** is an **explicit canvas node** for control and observability
  (own toolLog/response). Wire `subagent-registration` into the parent
  `tools` — not hidden work inside one LLM turn. The announced tool is
  `{name}(subagent)` (`toolId` slug `Name_subagent`). Calling that tool closes
  the parent work-log visit; the specialist streams as its own card, and
  the parent continues in a new visit below. Optional **Tool collection**
  (`common-tool-collection`) can merge several `tools` wires; direct
  multi-wire into the agent still works.
- **Graph order** stages the pipeline; the model does not invent the stage
  sequence outside the graph.
- Project memory / wiki create is **queue-driven**: index with harness `glob`,
  persist work units under `.langflower/memory/history/work-queue.md`, then
  serial Sub-Agent survey/write (`kb-create` pattern). Memory tools are wired
  packs (no permission ask). Do not equate “wiki” with embedding search.

## Extensibility

- Custom nodes use the same **`@langflower/node-sdk`** path as built-ins.
- **TypeScript** is first-class; `tsc` / IDE types act as compile-time gates.
  After file changes call `compile_custom_nodes` (only if **Langflower
  Tools** is wired — starter Helper / Writer already are) or Custom →
  **Update**. Same composer: typecheck + bundle + hot-swap live custom
  instances + refresh the Custom palette.
  Stop is not required for already-placed custom types.
  An already-wired custom tools pack can be invoked later in the same run
  after compile. Do not auto-place or auto-wire a new type mid-run.
- Plain JS / Go / Python are not the authoring path. Sandboxed arbitrary
  user-node execution is **not** shipped. Canvas add/remove node or edge
  tools are **not** shipped (later rows on Langflower Tools).

## What stays local

- No required cloud account for Langflower itself.
- Secrets via config / `{env:VAR}`; Settings does not reveal a saved API key.
- Provider calls leave the machine when the user configures a remote provider —
  that is expected LLM traffic, not a Langflower cloud login wall.

## Honesty boundary

- Product Status can be **Partial** / Missing / Draft for some use-cases.
- This file is a **trust-oriented summary**, not a promise that every use-case
  is Implementable with a real LLM.
- If a detail is not here and not in the helper Knowledge base → **not in my
  facts**.
