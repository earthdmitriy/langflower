> **Historical bootstrap / Stage-1 spec.** Product purpose, goals, and roadmap
> live in [`docs/PRODUCT.md`](docs/PRODUCT.md) and
> [`docs/use-cases/`](docs/use-cases/README.md). Do **not** plan work from
> “Stage 1 / 2 / 3” labels in this file. Prefer
> [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), ADRs, and use-case Status for
> current truth. Sections below may lag (e.g. Execute greyed out, project dir
> UI-only, `defineNode` examples).

## Bootstrap Specification – Stage 1 (archive)

This document describes an early architecture, project structure, and
user-project layout for Langflower as a locally-run web application that stores
configuration in the user’s project folder (_opencode-style_ directory
convention). Kept for historical detail; superseded for product intent by
PRODUCT.md.

---

### 1. Global Tool Installation

The application is distributed as an npm package `langflower`. After installation, a CLI command `langflower` becomes available globally.

```bash
npm install -g langflower
```

The CLI provides a single command to launch the tool:

```bash
langflower start [project-dir]
```

- If `project-dir` is not specified, the current working directory is used.
- The tool starts an HTTP server (default port 4010) and automatically opens the UI in the system browser.
- The server remains running until the user terminates the process (Ctrl+C).

---

### 2. User Project Directory Structure

Inside the chosen project directory, the tool creates and manages a hidden folder named `.langflower`.  
This folder contains all user‑specific configuration, custom nodes, and saved workflows. The user never needs to edit these files manually, though they may author custom node packages (see §4).

```
<project-root>/
├── .langflower/
│   ├── config.json              ← global tool settings (port, API endpoints, etc.)
│   ├── nodes/                   ← custom node packs (one folder per pack)
│   │   ├── my-nodes/            ← default seed pack ([ADR-030](docs/ADR.md#adr-030--custom-node-pack-layout--npm-model))
│   │   │   ├── package.json     ← peerDeps: @langflower/node-sdk; author runs npm i
│   │   │   ├── tsconfig.json    ← IDE highlight
│   │   │   ├── README.md        ← humans + agents
│   │   │   └── review-gate.ts   ← export default defineReactiveNode({…})  ok|fail
│   │   └── <user-pack>/         ← optional sibling packs (own package.json)
│   │       ├── package.json
│   │       └── *.ts             ← export default (no required index.ts)
│   ├── workflows/               ← saved workflow graphs
│   │   ├── my-workflow.json
│   │   └── another.json
│   ├── .cache/                  ← compiled bundles of node packs (compiler)
│   │   └── nodes/
│   │       ├── <hash1>.mjs
│   │       └── <hash2>.mjs
│   └── instructions.md          ← README explaining how to create custom nodes
└── ...                           ← the user’s actual project files
```

**Important:**

- `.langflower` is completely self‑contained; the user’s existing project files are never modified.
- The folder should be added to `.gitignore` if the user wishes to version‑control their project without the tool’s internal data.

---

### 3. Server and UI

#### 3.1 Backend (Node.js, TypeScript)

The server is a single‑process Node.js application written in TypeScript. It serves:

- Static files for the Angular frontend (compiled into the package, served from a built‑in directory).
- A **WebSocket** endpoint — **default transport** for UI↔server: commands, small payloads, and **server‑push notifications**.
- A **minimal REST** surface — **only for large payloads** (full workflow graph upload/download).

#### 3.1.1 Communication model

**WebSocket is the default.** On editor load the UI opens a persistent WebSocket to the
shared transport defined by `@langflower/shared/langflower` (`/ws`, default port
`4010`). Interactions use typed event messages: clients emit `*.requested` intents,
and the backend pushes `*.delta`, snapshot, telemetry, and lifecycle facts to all
connected clients without polling.

**REST is for bulk data only** — endpoints that transfer entire workflow JSON graphs
or other large bodies. Do not add REST routes for operations that fit in a WebSocket
message (lists, toggles, reload signals, execution control, notifications).

| Transport     | Use for                                     | Examples                                                                                                    |
| ------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **WebSocket** | Intents, queries, snapshots, live telemetry | `editor.addNode.requested`, `runner.start.requested`, `palette.reload.requested`, `workflow.list.requested` |
| **REST**      | Large request/response bodies if needed     | Bulk workflow transfer only when payload size justifies leaving the WebSocket bus                           |

**Push notifications (server → UI):** registry refreshed, workflow list changed,
config updated, execution progress/logs, errors, toasts. UI services subscribe via
RxJS streams fed by the WebSocket client — not repeated `GET` polling.

**Threshold:** if a payload is routinely “full workflow graph” size, use REST; otherwise
WebSocket. The canonical bus registry lives in
`packages/shared/src/langflower-bus-config.ts`. Runtime APIs intentionally define
many payload shapes via `Parameters<>` / `ReturnType<>` so runtime contract changes
break server/UI compilation immediately instead of drifting behind adapter DTOs.

**Startup sequence:**

1. Parse CLI arguments; determine project directory.
2. If `.langflower` does not exist, create the directory structure, write
   defaults, and (target epic 33) copy the `nodes/my-nodes` seed from
   `packages/server/skeleton/` plus instructions. Author runs `npm install`
   inside packs — server never auto-installs.
3. **Target (epic 32):** `@langflower/compiler` scans `.langflower/nodes/<pack>/`
   for `export default` on `*.ts` / `*.tsx`, esbuild-bundles (cache under
   `.langflower/.cache/nodes/`), merges custom defs into palette/runtime.
   **Today:** palette and resolve are common-nodes / system catalog only.
4. Start Express server on the configured port (default 4010).
5. Start WebSocket server on the same HTTP server.
6. Open the browser to `http://localhost:4010` (UI connects WebSocket immediately after load).

**WebSocket (default — intents + authoritative facts):**

| Direction   | Method / event              | Purpose                                    |
| ----------- | --------------------------- | ------------------------------------------ |
| intent →    | `editor.addNode.requested`  | Add a node to the session graph            |
| fact ←      | `editor.addNode.delta`      | Authoritative add-node outcome (broadcast) |
| intent →    | `runner.start.requested`    | Run the current session graph              |
| telemetry ← | `runner.output-emitted`     | Runtime output port signal                 |
| snapshot ←  | `session.state.snapshot`    | Full reconnect/cold-start projection       |
| intent →    | `palette.reload.requested`  | Refresh node palette                       |
| snapshot ←  | `palette.snapshot`          | Authoritative palette catalog              |
| intent →    | `workflow.list.requested`   | Request persisted workflow catalog         |
| snapshot ←  | `workflow.list.snapshot`    | Authoritative workflow catalog             |
| snapshot ←  | `workflow.current.snapshot` | Active workflow document + dirty flag      |

Messages do not use per-command correlation ids. Several browser tabs may share
one server session; **state snapshots are broadcast** so every tab applies the
same authoritative slices without asking which tab caused a change.

**State sync model:**

| Domain                     | Reconnect                                            | Live                                                            |
| -------------------------- | ---------------------------------------------------- | --------------------------------------------------------------- |
| Session, workflow, palette | full **snapshot** (replace projection)               | full snapshot broadcasts                                        |
| Runtime on graph           | `executionFeed` snapshot in `session.state.snapshot` | **event-sourcing** — new `runner.*` / `RuntimeRunnerEvent` only |

Reconnect order: `session.state.snapshot` → `session.ready` → `palette.snapshot`.

The UI **replaces** projection from snapshots and **appends** runtime events — it
does not treat server pushes as RPC replies to “my last click”.

**REST (bulk escape hatch only):**

No REST route is the default for workflow/editor operations. Add REST only when a
future feature proves payload size or browser tooling requires leaving the
WebSocket bus, and update ADR-012 first.

#### 3.2 Frontend (Angular + ngDiagram)

The UI is a single‑page application built with Angular and [ngDiagram](https://www.ngdiagram.dev) for the visual node editor.

**Transport:** opens **WebSocket on init** (primary). Server interaction goes through
a WebSocket gateway service (RxJS observables for authoritative facts). `HttpClient`
is reserved for future bulk escape hatches explicitly approved by ADR-012.

**Layout:**

- Left panel: node palette (list of available nodes, grouped by category). Each node can be dragged onto the canvas.
- Central canvas: interactive graph editor (ngDiagram). Allows placing node instances, drawing connections, deleting nodes/edges, panning, zooming.
- Right panel (or bottom): properties panel for the selected node (showing generated controls from `uiSchema` fields with `placement: 'panel'` or default).
- Top toolbar: buttons for “Load workflow”, “Save workflow”, “New workflow”, “Delete workflow”, “Execute” (greyed out in Stage 1), “Reload nodes”, “Bootstrap new node”, and a project directory indicator.

**Inline inputs on nodes (primitive data):**

Simple values (`string`, `number`, `boolean`) can be entered **directly on the node body** in the canvas, not only in the properties panel or via wires.

Two sources render on-node editors:

1. **Input ports** — each input port whose `DataType` is `string`, `number`, or `boolean` gets an inline control on the node by default (`PortDescriptor.inline` defaults to enabled). Set `inline: false` on a port to hide the on-node editor (wire-only). Ports with `multi: true` are wire-only in Stage 1 (one logical port, dynamic slots in `data.multiInputSlots`; executor receives `T[]`).
2. **`uiSchema` fields** — primitive fields may set `placement: 'inline'` to render on the node; otherwise they appear in the properties panel (`placement: 'panel'` is the default).

**Rules:**

- If an edge is connected to an input port, the inline control for that port is **disabled** (greyed out); the wired value wins at execution.
- If no edge is connected, the value from the on-node control is used (`data.inputs[portName]`).
- Types `json`, `llm-message`, `stream`, and `any` are **never** inline on the node — use connections or the properties panel.
- Inline edits update the workflow graph immediately (same persistence as `data.params`).

**Behaviour:**

- **Dragging a node** from the palette onto the canvas creates a new instance of that node type (with default name, generated ID).
- **Connecting ports**: the user can drag from an output handle to an input handle. The UI validates data‑type compatibility (based on port types) and prevents invalid connections.
- **Selecting a node** shows its panel `uiSchema` fields in the properties panel; inline fields and port values are edited on the node body. All changes are stored in the workflow graph.
- **Workflow management** — snapshot-only, multi-tab safe:
    - **Why not RPC replies:** Tab A saves; Tab B must not receive an orphan
      `workflow.saved` and wonder _which_ workflow changed. Server pushes full
      **state slices** to all tabs instead of per-command acknowledgements.
    - **Flow:** intent → server executes → broadcast snapshot(s). Tabs apply
      snapshots; they do not match replies to their own commands.
    - **Catalog** — `workflow.list.snapshot` (metadata rows, no graphs). Replace
      the whole catalog projection on each push.
    - **Current workflow** — `workflow.current.snapshot`
      (`activeWorkflow` + `currentStatus`). Replace atomically on each push.
    - **Save** — `workflow.saveCurrent.requested`; on success server broadcasts
      `workflow.current.snapshot` (`pristine`) and `workflow.list.snapshot`.
    - **Rename** — `workflow.renameCurrent.requested`; server broadcasts
      `workflow.current.snapshot` (`dirty` until save).
    - **Load** — `workflow.load.requested`; server broadcasts
      `workflow.current.snapshot` (unchanged document if load blocked or missing).
    - **Delete** — `workflow.delete.requested`; on success server broadcasts
      `workflow.list.snapshot` and `workflow.current.snapshot` when the active
      workflow was cleared.
    - On connect, both slices also appear in `session.state.snapshot`.
- **Reload nodes** sends WebSocket `palette.reload.requested`; palette updates from
  `palette.snapshot` or `palette.compilationError`.
- **Project directory**: the currently active directory is shown in the toolbar. The user cannot change it in‑UI during Stage 1; they must restart the CLI with a different path.

**Connection validation:**
Each port has a `WireType` (string, number, boolean, json, llm-message, stream, any).  
Validation rule: source port type must equal target port type, or either must be `any`, or `json` accepts any of the primitive types. This logic is implemented in the frontend and enforced in the graph editor’s connection callback.

Here is special `WireType: "dynamic"` - it allow any input wire, but can be bypassed to output port making it inheriting input wire type. Example of such node: delay

**No authentication** – the tool runs locally, and the server binds to `localhost` only.

---

### 4. Custom Nodes System

Custom nodes are **packs** under `.langflower/nodes/<pack>/`. Default seed pack
id: **`my-nodes`**. Contract: [ADR-030](docs/ADR.md#adr-030--custom-node-pack-layout--npm-model).

Each pack has its own `package.json` (peer `@langflower/node-sdk`). There is
**no** required `index.ts`: each `*.ts` / `*.tsx` may `export default` a node
definition or an array. Authors import from `@langflower/node-sdk` directly
(not a generated root `nodes/types.ts`). Prefer **`defineNode`**; use
`defineReactiveNode` for exclusive multi-output branches / RxJS streams.

Example:

```typescript
// .langflower/nodes/my-nodes/review-gate.ts
import { defineReactiveNode } from '@langflower/node-sdk';
import { EMPTY, mergeMap, of } from 'rxjs';

export default defineReactiveNode({
	type: 'my-review-gate',
	displayName: 'Review Gate (npm test)',
	uiSchema: [] as const,
	bind(ctx, { makeInput, configureOutput, combineInputs }) {
		const trigger = makeInput<unknown>('trigger', {
			dynamic: true,
			required: true,
			defaultValue: null,
		});
		const result$ = combineInputs([trigger, ctx], ([_t, ec]) => ({
			projectDir: String(ec.projectDir ?? ''),
		})).pipeValue(
			mergeMap(async ({ projectDir }) => {
				/* run npm test → { ok: true } | { ok: false, detail } */
				return { ok: true as const };
			}),
		);
		const ok$ = result$.pipeValue(
			mergeMap((r) => (r.ok ? of(true) : EMPTY)),
		);
		const fail$ = result$.pipeValue(
			mergeMap((r) => (r.ok ? EMPTY : of(r.detail))),
		);
		return {
			inputs: [trigger],
			outputs: [
				configureOutput('ok', ok$, { wireType: 'boolean' }),
				configureOutput('fail', fail$, { wireType: 'string' }),
			],
		};
	},
});
```

Prefer **`defineNode`** for simple sync/Promise nodes. Use
`defineReactiveNode` when exclusive multi-output branches must emit
independently (this seed).

Key points:

- Port metadata comes from the definition (`inputs` / `outputs` / `bind`
  probe) — not from a TypeScript Compiler API scan of `execute`.
- Author runs `npm install` inside the pack; Langflower never auto-installs.
- Author npm deps are allowed in pack `dependencies`; the future
  `@langflower/compiler` (epic 32) esbuild-bundles them ([ADR-007](docs/ADR.md#adr-007--esbuild-for-custom-node-packages)).
- Reactive packs also peer `rxjs` + `@rx-evo/stateful-observable`.
- Until the compiler ships, packs are **authoring drafts only** (palette /
  runtime remain common-nodes / system catalog).

---

### 5. Workflow Storage Format

Workflows are stored as JSON files in `.langflower/workflows/`. Each file represents a complete graph.

Structure:

```json
{
	"id": "uuid",
	"name": "My workflow",
	"createdAt": "2026-06-16T...",
	"updatedAt": "2026-06-16T...",
	"nodes": [
		{
			"id": "node-1",
			"type": "my-openai",
			"position": { "x": 100, "y": 200 },
			"data": {
				"label": "OpenAI Call",
				"params": {
					"temperature": 0.7
				},
				"inputs": {
					"prompt": "Write a haiku about code"
				}
			}
		}
	],
	"edges": [
		{
			"id": "edge-1",
			"source": "node-1",
			"sourceHandle": "completion",
			"target": "node-2",
			"targetHandle": "prompt"
		}
	]
}
```

- `type` references the node definition’s `type` field (must be registered).
- `data.params` holds values for `uiSchema` fields (panel and inline).
- `data.inputs` holds inline values for **unconnected** input ports (`string` / `number` / `boolean`). Omitted keys mean “no literal set”.
- Edges store the connected handle names, which correspond to port names.

---

### 6. Acceptance Criteria Fulfillment

| Criterion                                                             | How it is met                                                                                           |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1. Web server starts, UI opens in browser                             | CLI `langflower start` launches Express serving Angular app, opens `http://localhost:4010`              |
| 2. Nodes can be created/connected/deleted in UI                       | ngDiagram editor supports drag‑from‑palette, drawing edges, and delete key/context menu                 |
| 3. Configs stored in `.langflower`                                    | `config.json` on disk; UI reads/writes via WebSocket `config.get` / `config.patch`                      |
| 4. Connected nodes form a workflow, stored in `.langflower/workflows` | Save via WebSocket `workflow.saveCurrent.requested`; files written under `.langflower/workflows/`       |
| 5. Workflows can be loaded/edited/deleted                             | Load/list via WebSocket `workflow.*` events; toolbar actions                                            |
| 6. UI button to reload nodes                                          | WebSocket `palette.reload.requested`; `palette.snapshot` updates palette                                |
| 7. User can recover from custom node compile errors                   | WebSocket `palette.compilationError` reports compile failures                                           |
| 8. User can select project directory                                  | CLI argument `langflower start <path>`; UI displays the active directory                                |
| 9. Primitive data editable on node body                               | Inline controls for string/number/boolean ports; optional inline `uiSchema`; wired port disables inline |

---

### 7. Technology Stack (Stage 1)

- **Runtime:** Node.js ≥ 22.22.3 (required by Angular 22 CLI)
- **Language:** TypeScript (strict)
- **CLI:** `commander` for argument parsing, `open` for launching browser
- **Backend:** `express` (static + bulk REST), `ws` (default UI transport, push)
- **Frontend:** Angular 22 with `ng-diagram` graph editor, **WebSocket gateway (RxJS)**, native controls with **@angular/aria**, **Tailwind CSS** utilities (`packages/ui/src/styles.scss`)
- **Bundling (server-side):** `esbuild` for compiling custom node packages
- **Packaging:** distributed as an npm package with a `bin` entry; does **not** require Electron for Stage 1

---

### 8. Open Questions for Future Stages

- Execution engine, sandboxing (Worker threads / isolated-vm).
- Desktop packaging (Electron/Tauri).
- More sophisticated data‑type compatibility (implicit conversions).
- Custom frontend components for nodes (web components).
