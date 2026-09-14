# Langflower

> **Disclaimer:** Langflower is currently in internal testing. Anyone can
> download and try it, but some functions may not be stable.

Langflower is a local visual workflow for a project folder: a node graph
that runs agents, tools, checks, and human gates on your machine. You
author the pipeline on a canvas in the browser you already have. The LLM
is a node in that graph, not the product — the topology you wire decides
what happens next. Data, custom nodes, and workflows stay in that folder.

**Not another chat harness. A local node graph.**

The unit of work is a **reactive node**: typed inputs, typed outputs.
Each port fires on its own — a node can emit on one output without
waiting for the rest, so the node chooses the path. That is enough for
cycles and conditional branches, not only a straight chain. An LLM agent
is the same kind of node — prompt and tools in, response out. Coding,
chat, agent-to-agent dialogue, and custom gates are the same idea: pick
the graph, not a fixed loop.

![Langflower starter workflow](https://raw.githubusercontent.com/earthdmitriy/langflower/master/docs/img/starter.png)

The default **starter** workflow: an onboarding helper plus a Writer
sub-agent for workflows and custom nodes.

![Langflower dev workflow](https://raw.githubusercontent.com/earthdmitriy/langflower/master/docs/img/lf_dev.png)

**Langflower dev** — the workflow used to develop Langflower itself.
Memory tools, ts-scan (MCP), and custom **LF Dev Tools** merge in a tool
collection and fan out to the agents. The prompt passes **lf-review-gate**
first (format, typecheck, tests) so Plan starts from a green tree. A
human review gate accepts the plan, then Coder works; the result must
pass lf-review-gate again, then a human review gate.

## Why Langflower

- **The graph is the harness.** QA, review, build, and tests sit on the
  topology, so the agent cannot skip them or declare itself finished. A
  review-gate has no path around it.
- **Safe tools, not a general shell.** Wrap format, build, and unit tests
  as custom nodes that expose a **ToolHandle**. You do not need a general
  bash tool that could accidentally wipe all data from your disk. If a
  command must stay open-ended, the workflow can still ask for approval
  first.
- **Your browser, not a bundled one.** Close the tab and free those
  resources; the server keeps the run. Reopen it, and the UI catches up.

Versus chat-style harnesses (OpenCode-like): order comes from the graph,
not from the model deciding it is done. Versus cloud graph tools
(Langflow, n8n): the same idea of wiring nodes, aimed at a folder on
your machine — home or a closed network with internal providers — not at
hosting a service.

**MCP** and **skills** work as usual. Custom nodes sit on top of the same
**ToolHandle** contract as built-ins.

## Quick start

Requires **Node.js ≥ 22**. Live agent runs need an OpenAI-compatible
provider in Settings (API keys via `{env:VAR_NAME}`). Simple nodes and
the Fake LLM work without one.

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

## How it works

1. Start Langflower with a project folder.
2. Open a workflow on the canvas, or create one for the task.
3. Run it and watch agents, tools, checks, and file changes move through
   visible stages.
4. Approve, reject, or add feedback when the workflow asks for a human
   decision.
5. Find the resulting files and data in the same workspace.

## What it lacks

- **Chat sessions.** You cannot save a chat and reopen it tomorrow.
  Agent state lives inside the node for now. Maybe later.
- **Image and video.** No asset management for multimodal models. Not yet.
- **No built-in IDE or git UI.** We are not reinventing those wheels. Use
  the editor and git tools you already have.

## Under the hood

The core is a reactive runtime. The **node SDK** is the public contract:
any node that follows it can run on that runtime. **Common nodes** is the
built-in catalog. It uses the same SDK as custom node packs.

The **server** compiles user-defined nodes and owns the live run. The
**UI** is a thin browser client over WebSocket; it does not own the
workflow.

For a short builder-oriented picture, see
[How it works](https://github.com/earthdmitriy/langflower/blob/master/docs/public/how-it-works.md).

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
