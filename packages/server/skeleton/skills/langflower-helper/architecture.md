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

1. CLI — `langflower start` (default port **4010**). Optional **Slint
   launcher** can spawn several of these CLIs (one per project folder);
   it does not embed the editor.
2. Local **server** — owns runtime, project I/O under `.langflower/`
3. **WebSocket bus** — control plane between server and editor
4. Angular **editor** — canvas, feed, inspector, Settings, composer
   (system browser; not a WebView inside the launcher)

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
- Soft **Pause**, Hard **Stop**, and discarding a session point are
  **explicit** controls — do **not** equate “tab closed” with Stop. A
  workflow session (topbar tab) can continue after process kill. That is
  not the same as closing the browser while the process stays up (see
  Knowledge base §7).

## Execution model

- Nodes and edges run on a **reactive runtime**: ports are live streams. A node
  may receive and emit **at any time** while the run is alive — not a single
  batch “call node → return once”.
- Canvas node instances stay alive across **Stop / done / Start** while the
  same workflow is loaded. Authors may **intentionally** keep in-memory
  internal state across runs until the user **loads another workflow** or
  **shuts down Langflower**. In-memory closures still survive `done` until
  the node is rematerialized. They do not survive a process restart.
- A **workflow session** is a durable tab of one workflow, not the process
  `LangflowerSession`. The workflow is the parent: tabs are stored and
  listed under that workflow. While the tab is open the canvas shows the
  session graph snapshot; the workflow file stays the home. On disk the tab is
  `.langflower/sessions/<workflowId>/<label>.json` (`schemaVersion: 1`)
  plus `<label>.feed.jsonl`. The filename is the tab (`YYYY-MM-DD #N`).
  `sessionId` is the UUID inside the JSON. The JSON holds the graph,
  head `nodeStates`, and points (`runOffset` / `feedOffset`, not a copied
  feed). The feed log is one JSON value per line; the restored work log
  is the slice after the last run marker. The JSON is rewritten when the
  graph, node state, points, or identity change. Closed frames are
  appended after a short debounce. An open streaming frame stays in
  memory until it closes. Finish does not flush. Restart binds the newest
  session before the first feed. A Run with no tab writes one from the
  graph on screen. A Run continues the head. **Continue from…** rewinds
  to a point (truncates the feed to that offset and drops later points).
  **Reset** empties the feed and clears points; the tab and graph stay.
  OpenAI, Fake, Review, and Critique persist `{ history }` through the
  state hook (`persist$` + `restore` on the bind result, stored under the
  node id in `nodeStates`). Repeat persists `{ nextIndex, done, count }`
  after each slot that has already left the node. Sub-Agent has no hook:
  its result is a tool call on the parent agent's transcript. A custom
  node uses the same hook: emit the full JSON value, accept `null` or
  that JSON in `restore`. No session bound means nothing is written.
  **Reset session on input** is a node parameter (default off), not the
  hook. Tabs cannot be renamed. Any listed tab can be deleted, including one
  that is not open and a corrupt file.
  Switching workflows or sessions is refused while the graph is executing,
  and allowed during HITL or steering after the parked run stops. Old
  `.langflower/runs/**/checkpoint.json` files are not migrated.
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
  `askUser.ask`, and related facts.

## Agents on the canvas

- LLM / agent nodes use **skills** and harness tools as wired in the graph.
- **Sub-Agent** is an **explicit canvas node** for control and observability
  (own toolLog/response). Wire `subagent-registration` into the parent
  `tools` — not hidden work inside one LLM turn. The announced tool is
  `{name}(subagent)` (`toolId` slug `Name_subagent`). Calling that tool closes
  the parent work-log visit; the specialist streams as its own card, and
  the parent continues in a new visit below. Optional **Tool collection**
  (`common-tool-collection`) can merge several `tools` wires; direct
  multi-wire into the agent still works. **Tool invoke**
  (`common-tool-invoke`) calls one wired handle by `toolId` + JSON `args`
  with no LLM. **Tool inspect** (`common-tool-inspect`) dumps copy-paste
  `toolId` / example args / `inputSchema` from the same wire (optional
  inspect `toolId` filters the dump; Preview cannot take
  `tool-handle`). Extra empty canvas slots on
  `multi` ports (`feedback` merge, `tools` combine) and Router channels
  (`ch` / `ch@1`) are intentional fan-in — not cloned ports.
- **Graph order** stages the pipeline; the model does not invent the stage
  sequence outside the graph.
- Project memory / wiki create is **queue-driven**: index with harness `glob`,
  persist work units under `.langflower/memory/history/work-queue.md`, then
  serial Sub-Agent survey/write (`kb-create` pattern). Memory tools are wired
  packs (no permission ask). Do not equate “wiki” with embedding search.

## Extensibility

- Custom nodes use the same **`@langflower/node-sdk`** path as built-ins.
- **TypeScript** is first-class; `tsc` / IDE types act as compile-time gates.
  `langflower start` compiles packs. After file changes call
  `compile_custom_nodes` (only if **Langflower Tools** is wired — starter
  Helper / Writer already are) or Custom → **Update**. Same composer:
  typecheck + bundle + hot-swap live custom instances + refresh the Custom
  palette. Pack `from './x.ts'` needs `allowImportingTsExtensions` +
  `noEmit` in pack `tsconfig.json` or `tsc --noEmit` fails (hello-embed seed).
  Stop is not required for already-placed custom types.
  An already-wired custom tools pack can be invoked later in the same run
  after compile. Do not auto-place or auto-wire a new type mid-run.
  Tool handlers return short pass/fail text (not raw logs). Exclusive
  `ok`/`fail` gates: seed pulse is boolean `true` on `ok`; continue-the-graph
  gates passthrough `trigger` (`inferTypeFrom`). No shell Cap on public
  `ExecutionContext` yet.
- Plain JS / Go / Python are not the authoring path. Sandboxed arbitrary
  user-node execution is **not** shipped. Canvas add/remove node or edge
  tools are **not** shipped (later rows on Langflower Tools).

## What stays local

- No required cloud account for Langflower itself.
- Secrets via config / `{env:VAR}` or Settings → Global → Secrets
  (`langflower.secrets.json`); Settings does not reveal a saved API key or
  named secret value.
- Provider calls leave the machine when the user configures a remote provider —
  that is expected LLM traffic, not a Langflower cloud login wall.

## Honesty boundary

- Not every use case is Available or Ready. Sample-prompt quality is the user's
  graph, not a missing capability.
- With an OpenAI-compatible provider, daily use replaces an OpenCode-style
  harness for a multi-stage coding graph and for a chat loop whose result
  cannot be approved up front. Confirmed mechanisms: tool calls, HITL,
  custom `ok` / `fail` gates, a work log that shows reasoning and tool
  calls, closing the browser tab on a long run, and resume from a session
  point. An open launcher window reminds you that work is in progress.
- If a detail is not here and not in the helper Knowledge base → **not in my
  facts**.
- Langflower repository docs (not copied into a user project):
  `docs/product/features/README.md`, `docs/product/use-cases/README.md`,
  `docs/reference/SESSIONS.md`, `docs/adr/README.md`, `docs/bugs/README.md`.
  Planning notes are `docs/_work/TODO/README.md`. Frozen history is
  `docs/_archive/DONE/README.md`.
