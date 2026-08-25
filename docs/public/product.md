# Product overview

Langflower is not built around the LLM as a first-class citizen. The core
abstraction is a **reactive node**: several typed inputs, several typed
outputs. Each port acts independently — a node can receive on one input
and emit on one output at any time, without waiting for the rest. The
runtime wires those nodes into a workflow.

Because ports fire on their own, an LLM agent is just another node: prompt
and tools in; response out; streaming tool log, reasoning, and draft as
extra outputs. LLM-specific logic stays inside that node. It does not leak
through the rest of the app.

**Not another chat harness. A local node graph.**

Langflower runs on your machine, scoped to a folder you open. Data, custom
nodes, and workflows live there. You can reproduce what mature cloud tools
offer at home, or on a closed network with internal LLM providers.

The sequence is the workflow topology (a **hard harness**). QA, review, and
code checks sit on the graph, so agents cannot skip them. Coding, chat,
agent-to-agent dialogue, and custom gates are the same idea: wire nodes.

## Who it is for

Anyone with a local folder and a process they want on a graph. Coding in a
repo is one scenario among others — writing, research fan-out, knowledge
bases, and custom pipelines. Browse [workflow ideas](workflows.md).

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

## Learn more

- [Getting started](getting-started.md)
- [Workflow ideas](workflows.md)
- [How it works (builders)](how-it-works.md)
