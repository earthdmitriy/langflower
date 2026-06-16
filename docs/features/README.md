# Feature docs

One file per **user-facing** feature — what Langflower delivers to the person
building a workflow, not how a subsystem is wired internally. Product purpose:
[docs/PRODUCT.md](../PRODUCT.md). For end-to-end product scenarios (coding
agent, bootstrap, KB wiki, refine loops, …) and whether they can run today,
see [docs/use-cases/](../use-cases/README.md).

For subsystem /
technical reference docs (execution internals, canvas integration pitfalls,
node authoring SDK, …), see the links each file's **Implementation Details**
section points to. The one exception is
[node-library.md](node-library.md): it also carries the full built-in node
catalog (ports, security model, rollout status) inline below its
Implementation Details, since that reference has no separate home.

## Doc structure

Every file in this folder follows the same order:

1. **Goal** — the user-facing value in 1-3 sentences.
2. **Core Principles** — the non-negotiable rules/constraints that shape the
   feature (what must always be true, regardless of implementation).
3. **Feature Details** — what the user sees and does: flows, states, edge
   cases. No file paths, no code.
4. **Implementation Details** — where it lives in code, and links to the
   deeper technical docs for subsystem depth.

Read top to bottom; stop once you have enough context. The first two sections
are enough to understand _what_ Langflower promises the user — read the last
two only when you need to change code.

## Index

| Doc                                                    | Feature                                                                                  |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| [getting-started.md](getting-started.md)               | Install the CLI, launch a project, open the editor                                       |
| [skeleton.md](skeleton.md)                             | Minimal first-run seed content + Sample workflows catalog import (**Draft**)             |
| [visual-workflow-editor.md](visual-workflow-editor.md) | Compose LLM chains visually on the canvas                                                |
| [node-library.md](node-library.md)                     | Built-in nodes — target catalog + ports; shipped = `catalog.ts` / [STATUS](../STATUS.md) |
| [../LLM_NODES.md](../LLM_NODES.md)                     | LLM foundation phases 1–6 — disclaimer, roles-as-config, streaming                       |
| [workflow-execution.md](workflow-execution.md)         | Run a workflow and watch it work in real time, incl. how a run starts                    |
| [feed-panel.md](feed-panel.md)                         | Sidebar chat mirror of graph telemetry (work log + composer)                             |
| [inspector.md](inspector.md)                           | Selected-node params in the sidebar (swaps out the feed)                                 |
| [hitl-chat.md](hitl-chat.md)                           | Workflow hands control to the user mid-run — steer, approve, or chat                     |
| [workflow-management.md](workflow-management.md)       | Create, save, load, rename, delete workflows                                             |
| [project-configuration.md](project-configuration.md)   | Configure LLM/embedding providers and permissions                                        |
| [settings-panel.md](settings-panel.md)                 | Edit project/global config in UI (gear → right aside; Draft)                             |
