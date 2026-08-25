# Langflower

> **Disclaimer:** Langflower is currently in internal testing. Anyone can
> download and try it, but some functions may not be stable.

## Key concept: everything is a node

Langflower is not built around the LLM as a first-class citizen. The core
abstraction is a **reactive node**: several typed inputs, several typed
outputs. Each port acts independently — a node can receive on one input
and emit on one output at any time, without waiting for the rest. The
runtime wires those nodes into a workflow.

That is enough for complex processing chains — including loops and
conditions.

The trick is the same rule applied to models. Because ports fire on their
own, an LLM agent is just another reactive node: prompt and tools in;
response out; streaming tool log, reasoning, and draft as extra outputs
that can update while the run continues. All LLM-specific logic stays as
that node's internal state. It does not leak through the rest of the app.

## Open possibilities

Because every unit of work is a node, Langflower is not pinned to one
product shape — coding harness, chat harness, or any other fixed loop.
Workflows stay flexible. With the right wiring they fit the job.

Need a chat? Wire user input, an agent, and HITL feedback. Agent-to-agent
dialogue is two agents connected together. Coding is the same graph plus
file-ops tools. Tired of “I’m done” while the code still does not compile?
Write a custom review-gate node. The agent never gets a path around it.

## Hard harness

The sequence is the workflow topology. That is how Langflower orchestrates
complex work: QA, review, and code checks sit on the graph, so agents
cannot skip them. A well-configured workflow forces high-quality output —
the model does not get to declare itself finished.

**Not another chat harness. A local node graph.**

### Keep everything local

Langflower runs on your machine and does not expose your project as a
hosted product. Files stay where they are. You can reproduce what mature
cloud tools offer — at home, or on a closed network with internal LLM
providers.

### Scoped to a folder

You start from a folder. Data, custom nodes, and workflows are scoped to
that workspace. Open the folder, and the graph, files, and run belong
together.

### Extensible even now

This is still an early version, but Langflower already supports custom
nodes and custom node packs. Share and reuse workflows and nodes the same
way you share the rest of the project.

![Langflower starter workflow](https://raw.githubusercontent.com/earthdmitriy/langflower/master/docs/img/starter.png)

## How it works

1. Start Langflower with a project folder.
2. Open a workflow on the canvas, or create one for the task.
3. Run it and watch agents, tools, checks, and file changes move through
   visible stages.
4. Approve, reject, or add feedback when the workflow asks for a human
   decision.
5. Find the resulting files and data in the same workspace.

## Under the hood

The core is a reactive runtime that wires nodes together. The **node SDK**
is the public contract: any node that follows it can run on that runtime.
**Common nodes** is the built-in catalog. It uses the same SDK as custom
node packs.

The **server** composes those pieces, compiles user-defined nodes, and owns
the live run. The **UI** is a thin browser client. It listens to WebSocket
events from the server; it does not own the workflow. Close the tab while a
long run continues. Reopen it, and the server catches the UI up, so the
canvas stays in sync.

For a short builder-oriented picture, see
[How it works](https://github.com/earthdmitriy/langflower/blob/master/docs/public/how-it-works.md).

## Why Langflower

- **You stay in control.** Workflows can request approval before sensitive
  file edits or shell commands run.
- **Use the browser you already have.** Other harnesses pack a web UI into
  a built-in browser such as Electron. Langflower uses your existing
  browser, so you can close the tab, free those resources, and let the
  server keep the run; reopen it and the UI catches up.
- **Extend it when the defaults are not enough.** Langflower uses common
  agent primitives — **MCP** and **skills** — and lets you define **custom
  nodes** on top: processing in the graph, or custom tools for agents via
  the same **ToolHandle** contract as built-ins.

## How it compares

Versus chat-style harnesses (often an Electron shell around a model loop):
Langflower is a local node graph. The LLM is a node, not the product.
Order comes from topology, not from the model deciding it is done.
The UI is your existing browser, not a bundled one.

Versus cloud graph tools: the same idea of wiring nodes, but aimed at a
folder on your machine — home or a closed network with internal
providers — not at hosting a service or cloning ETL in the cloud.

## What it lacks

- **Chat sessions.** Node-internal state is the current architecture, so
  serializable chat-session mechanics are hard. Maybe later.
- **Image and video.** No asset management for multimodal models. Not yet.
- **No built-in IDE or git UI.** We are not reinventing those wheels. Use
  the editor and git tools you already have.

## Quick start

Requires **Node.js ≥ 22**.

One-shot OS installers (Node LTS if needed + global `langflower`):
[install/](install/) (`windows.ps1`, `linux.sh`, `macos.sh`).

```bash
npm install -g langflower
langflower
# or
langflower ./my-project
```

From this monorepo (dogfood snapshot, not a registry install):

```bash
npm run install-local
npx langflower
```

Langflower opens a local UI at `http://127.0.0.1:4010` (or `--port` / the port
in `.langflower/config.json`) for the selected folder. Use `-p` to run several
instances from different folders at once.

Full walkthrough: [Getting started](https://github.com/earthdmitriy/langflower/blob/master/docs/public/getting-started.md).

Maintainers (monorepo only): [docs/RELEASE.md](https://github.com/earthdmitriy/langflower/blob/master/docs/RELEASE.md),
[packages/cli/README.md](https://github.com/earthdmitriy/langflower/blob/master/packages/cli/README.md).

## Learn more

Shipped with the npm package under [`docs/public/`](https://github.com/earthdmitriy/langflower/tree/master/docs/public):

| Want to…                         | Start here                                                                                                 |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Install and first run            | [Getting started](https://github.com/earthdmitriy/langflower/blob/master/docs/public/getting-started.md)   |
| Understand the product           | [Product overview](https://github.com/earthdmitriy/langflower/blob/master/docs/public/product.md)          |
| Use the canvas and runs          | [Using the editor](https://github.com/earthdmitriy/langflower/blob/master/docs/public/using-the-editor.md) |
| Browse workflow ideas            | [Workflow ideas](https://github.com/earthdmitriy/langflower/blob/master/docs/public/workflows.md)          |
| Configure providers and keys     | [Configuration](https://github.com/earthdmitriy/langflower/blob/master/docs/public/configuration.md)       |
| Add MCP, skills, or custom nodes | [Extending](https://github.com/earthdmitriy/langflower/blob/master/docs/public/extending.md)               |
| Builder runtime picture          | [How it works](https://github.com/earthdmitriy/langflower/blob/master/docs/public/how-it-works.md)         |
