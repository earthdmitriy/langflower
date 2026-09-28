# Langflower

> **Disclaimer:** Langflower is currently in internal testing. Anyone can download and try it, but some functions may not be stable.

**AI workflows where the graph controls what happens next.**

Langflower is a local visual workflow for a project folder: a node graph that runs agents, tools, checks, and human gates on your machine.

You build the workflow on a canvas in the browser you already have. The LLM is a node in that graph, not the product — **the topology you wire decides what happens next.**

> **Not another chat harness. A local node graph.**

![Ask feeds an Agent; Chat loop sends feedback back into the Agent](https://raw.githubusercontent.com/earthdmitriy/langflower/master/docs/img/Hero.png)

A chat loop is just a graph.

Connect an agent, route its output, add feedback, and let the graph decide what happens next.

From there, the same graph can grow into multi-agent workflows, review gates, parallel work, coding agents, custom tools, and long-running processes.

---

## From a chat loop to real workflows

The basic loop is only the beginning.

### Agents can talk to agents

Agent-to-agent dialogue is just another graph pattern.

Connect one agent's output to another agent's input. Add feedback paths when the second agent needs to challenge or refine the first.

![Planner and Red Team agents with a feedback path between them](https://raw.githubusercontent.com/earthdmitriy/langflower/master/docs/img/plan-red-team.png)

There is no special "multi-agent mode".

**Agents communicate through the graph.**

---

### Add capabilities

Start with an agent. Then add the capabilities your workflow needs.

Skills, tools, and specialized sub-agents can become parts of the same graph.

![Crawl, Langflower, Memory, and MCP tools plus a sub-agent on one agent, with a chat loop and tool permissions open](https://raw.githubusercontent.com/earthdmitriy/langflower/master/docs/img/capabilities.png)

Tools live on the graph too. Wire a pack, an MCP server, or a sub-agent only to the agent that needs it.

The graph grows without changing the basic execution model.

---

### Put checks into the graph

Don't ask an agent to certify its own work.

Put the check in the graph.

![Agent response routed through a review gate, with feedback returning to the agent](https://raw.githubusercontent.com/earthdmitriy/langflower/master/docs/img/gate.png)

A check can:

- accept a result and continue;
- reject it;
- produce feedback;
- send the workflow back through another path.

The check is part of the topology, so there is no hidden path around it.

**A retry is a graph path.**

---

### Parallel work

Graphs don't have to be linear.

A workflow can fan out into several independent pieces of work and later merge their results.

![Question fanning out to Docs, Risks, and Alternatives, then merging through Concat](https://raw.githubusercontent.com/earthdmitriy/langflower/master/docs/img/fan-out.png)

**Parallel work is a graph, too.**

---

### Give each agent only the capabilities it needs

Don't give every agent every tool.

Give each stage the capabilities it needs.

![Plan wired to RO tools, then after Review a Coder wired to Write tools](https://raw.githubusercontent.com/earthdmitriy/langflower/master/docs/img/permission.png)

A planning agent can inspect a project without being allowed to modify it.

After a human review, the next stage can receive the capabilities required to make changes.

**Permissions can follow the graph.**

---

### A complete coding-agent workflow

The same primitives can be combined into a complete development workflow:

- planning;
- coding;
- review;
- tests;
- tools;
- memory;
- human approval;
- feedback;
- parallel work;
- controlled capabilities.

![Coding workflow from a goal through Planner, Red Team, Coder, QA, review, and Finish](https://raw.githubusercontent.com/earthdmitriy/langflower/master/docs/img/coding_agent.png)

The graph remains the same abstraction whether the workflow has three nodes or thirty.

---

# Watch the graph execute

The graph is not just where you design the workflow.

**It's where you watch it run.**

![Running Starter workflow: green and yellow edges beside the Work log](https://raw.githubusercontent.com/earthdmitriy/langflower/master/docs/img/feed.png)

### See execution on the graph

Langflower shows execution state directly on the canvas.

- **Green** — the node or connection has produced a result.
- **Yellow** — work is pending.
- **Gray** — the node or connection has not been activated yet.
- **Red** — an error occurred on the port.

Events also produce a short pulse animation on the node and port that handled them.

You can see the workflow executing instead of waiting for a final answer and trying to reconstruct what happened afterwards.

---

### Watch agent events

An agent does not have to produce only one final result.

Its output ports can represent different event streams:

- `reasoning`
- `draftResponse`
- `toolLog`
- `response`

As the agent runs, those events can appear in the Work log as they happen.

![Helper streaming reasoning in the Work log, with reasoning, draftResponse, toolLog, and response on the node](https://raw.githubusercontent.com/earthdmitriy/langflower/master/docs/img/events.png)

This makes intermediate work observable without turning it into a separate tracing system.

---

### Inspect any connection

Don't guess what a node received.

Inspect it.

Any connection can be routed through a Preview node to see the payload of the event flowing through it.

![Preview node showing the Langflower Tools payload, with the same value in the Work log](https://raw.githubusercontent.com/earthdmitriy/langflower/master/docs/img/inspect.png)

This is useful when building and debugging workflows:

**What did this node actually receive?**

**What did the previous node actually emit?**

The answer is visible on the graph.

---

### The Work log is connected to the graph

The Work log is not just a text stream detached from the canvas.

Hover an event in the Work log and Langflower highlights the node that produced the event.

![Work log research highlighted on the Fan-out branch that produced it](https://raw.githubusercontent.com/earthdmitriy/langflower/master/docs/img/highlight.png)

You can move from:

**graph → event → payload**

or from:

**event → source node**

without losing the context of the workflow.

---

# Why the graph works

The execution model is built around events rather than a single return value.

### Nodes emit events

Nodes don't just return results.

They emit events.

An agent can emit reasoning, a draft, a tool log, and a final response as separate events during one execution.

### Every output port is an independent event stream

Each output port is an RxJS `Observable`.

A node can emit through one port without waiting for its other ports.

That means a single execution can produce different kinds of events independently.

### Edges route events

An edge connects an output stream to an input.

The graph determines where an event goes next.

This makes the graph itself the control flow.

### The graph contains the loop

Langflower workflows are graphs, not just pipelines.

Cycles are first-class.

Feedback, retries, review loops, and iterative agent workflows can all be represented directly as graph paths.

You don't need a special retry mechanism when the workflow itself contains the path back to an earlier node.

### Humans are part of the graph

Review and approval don't have to live outside the workflow.

A human gate can receive a result, wait for a decision, and emit acceptance or feedback back into the graph.

---

# Extend Langflower

If the node you need doesn't exist, build it.

Langflower has a public TypeScript API for writing custom nodes.

### A typed extension boundary

The node API is designed to make the extension contract explicit.

If an extension point is public, its contract should be visible in the types.

Custom nodes use the same runtime model as built-in nodes.

**Reactive at runtime. Typed at the extension boundary. Diagnosable before execution.**

---

### Compile before you run

Langflower includes a compiler for custom nodes and diagnostics for problems found before execution.

This gives a custom-node workflow a straightforward development loop:

```text
write
  ↓
compile
  ↓
diagnostics
  ↓
fix
  ↓
use in workflow
```

The compiler is part of the development experience, not something you have to reverse-engineer after a runtime failure.

---

### Build reusable node packs

Custom nodes live in node packs inside the project.

```text
.langflower/
└── nodes/
    ├── my-tools/
    ├── company-tools/
    └── another-pack/
```

A node pack gives you a natural unit for developing and reusing a group of related capabilities.

**Build a capability once. Reuse it wherever the workflow needs it.**

---

### Built for coding agents

Langflower ships skills and instructions for coding agents that need to create or modify workflows and custom nodes.

An agent can:

1. inspect the project;
2. write a custom node;
3. compile it;
4. inspect diagnostics;
5. fix the implementation;
6. add it to a workflow.

The same environment can therefore be used by both humans and coding agents to extend the workflow system.

---

# Every project gets a starter environment

Langflower does not start with an empty canvas.

A project gets a `.langflower` environment containing workflows, nodes, skills, schemas, instructions, and configuration.

```text
.langflower/
├── instructions
├── workflows
├── nodes
├── skills
├── schemas
└── config
```

The exact contents can grow with the project.

The starter environment serves several purposes at once:

- a quick start;
- working examples;
- reference implementations;
- reusable custom nodes;
- context for coding agents;
- a place for project-specific workflows and capabilities.

**Langflower gives a project a working environment, not an empty canvas.**

---

# Tools and MCP

Tools are capabilities that can be connected to agents through the graph.

Built-in and custom nodes use the same `ToolHandle` contract.

MCP can provide additional tools without changing the workflow model.

This makes tools another graph-level capability:

> **The workflow decides which agent gets which capability.**

That also means tools can be controlled by the same permissions model used elsewhere in the workflow.

---

# Long-running workflows

The browser is a window into the workflow, not the workflow itself.

The Langflower server owns the live run.

You can close the browser tab while a workflow continues running, then open the UI again and reconnect to the running workflow.

This makes the same model useful for workflows that take longer than a single interactive conversation:

- long-running coding tasks;
- background jobs;
- resumable workflows;
- workflows that pause for human input;
- workflows that can be interrupted and continued.

The UI is there to observe and control the workflow.

It is not the workflow.

---

# Local architecture

Langflower is designed to run against a project folder on your machine.

```text
Browser
   │
 WebSocket
   │
Langflower server
   │
Project folder
```

The browser UI is a thin client over WebSocket.

The server owns:

- workflow execution;
- custom-node compilation;
- the live run;
- access to the project folder.

The workflow, custom nodes, and project data stay with the project.

There is no hosted workflow service required.

This also makes Langflower suitable for local environments and closed networks where the project and its providers need to stay on the machine or inside the network.

---

# Langflower builds Langflower

Langflower is developed using Langflower.

The project itself uses a workflow to coordinate planning, coding, review, tests, tools, and human gates.

![Langflower development workflow](https://raw.githubusercontent.com/earthdmitriy/langflower/master/docs/img/lf_dev.png)

The development workflow combines memory tools, MCP, custom Langflower development tools, review gates, and coding agents.

The point is simple:

**Langflower is not only a tool for building workflows. It is itself built as a workflow-driven system.**

---

# Desktop launcher

If you don't want to start Langflower from a terminal, use the desktop launcher.

![Langflower desktop launcher](https://raw.githubusercontent.com/earthdmitriy/langflower/master/docs/img/launcher.png)

Pick a project folder, start Langflower, and the editor opens in the browser you already have.

The launcher is designed to make local Langflower feel like a normal desktop application:

- choose a project folder;
- keep recent projects;
- start Langflower;
- open the UI again after closing the browser tab;
- run several project instances at once.

No bundled browser is required.

---

# Quick start

## Desktop launcher

Download the Windows or macOS launcher from [GitHub Releases](https://github.com/earthdmitriy/langflower/releases) (tags `launcher-v*`).

[![Launcher release](https://img.shields.io/github/v/release/earthdmitriy/langflower?filter=launcher-v%2A&label=launcher)](https://github.com/earthdmitriy/langflower/releases)

Unpack it and run:

```text
langflower-launcher.exe
```

on Windows, or:

```text
langflower-launcher
```

on macOS.

The launcher is portable and does not require an installation.

On first use, choose the project folder you want to work with.

---

## From a terminal

Install Langflower globally:

```bash
npm install -g langflower
```

Then run it:

```bash
langflower
```

Or start it for a specific project:

```bash
langflower ./my-project
```

From the Langflower monorepo:

```bash
npm run install-local
npx langflower
```

The CLI opens the local UI at:

```text
http://127.0.0.1:4010
```

You can change the port with `--port` or through `.langflower/config.json`.

Use `-p` to run multiple Langflower instances for different project folders at the same time.

---

## Bring your own model

Langflower does not host a model.

For live agent runs, configure an OpenAI-compatible provider in **Settings** and provide your API key.

You can also point the provider at an environment variable.

Simple nodes and the Fake LLM can be used without a model key.

---

# How it works

1. Start Langflower with a project folder.
2. Open an existing workflow or create one.
3. Run the workflow.
4. Watch events move through the visible graph.
5. Inspect event payloads when needed.
6. Approve, reject, or provide feedback when the workflow reaches a human gate.
7. Find the resulting files and data in the same project workspace.

---

# What it lacks

Langflower is intentionally still small, and some things are not implemented yet.

### Chat sessions

You cannot save a chat and reopen it tomorrow as a persistent conversation.

Agent state currently lives inside the node.

### Image and video

There is no asset-management layer for multimodal models yet.

### Built-in IDE or Git UI

Langflower is not trying to replace your editor or Git client.

Use the tools you already have for editing, reviewing, committing, and navigating the project.

---

# Learn more

- [Getting started](https://github.com/earthdmitriy/langflower/blob/master/docs/public/getting-started.md) — installation and first run
- [Product overview](https://github.com/earthdmitriy/langflower/blob/master/docs/public/product.md) — the product model and core concepts
- [Using the editor](https://github.com/earthdmitriy/langflower/blob/master/docs/public/using-the-editor.md) — canvas, workflows, and runs
- [Workflow ideas](https://github.com/earthdmitriy/langflower/blob/master/docs/public/workflows.md) — examples of workflows you can build
- [Configuration](https://github.com/earthdmitriy/langflower/blob/master/docs/public/configuration.md) — providers, keys, ports, and project configuration
- [Extending Langflower](https://github.com/earthdmitriy/langflower/blob/master/docs/public/extending.md) — custom nodes, node packs, MCP, and skills
- [How it works](https://github.com/earthdmitriy/langflower/blob/master/docs/public/how-it-works.md) — the builder/runtime architecture
- [Desktop launcher](https://github.com/earthdmitriy/langflower/blob/master/docs/public/launcher.md) — running Langflower without the CLI

---

## In one sentence

**Langflower turns an AI agent from a chat loop into a visible, inspectable workflow whose graph controls what happens next.**
