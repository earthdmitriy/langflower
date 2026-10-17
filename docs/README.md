---
kind: index
owner: docs
covers: []
status: current
---

# Docs router

Start here. Pick the layer whose question the doc answers, then follow a route.
Moved docs already live at the linked path. A parenthetical note remains
where the file has not moved yet.

## Layer map

One-line placement rule: put the doc in the layer whose question it answers.

| Layer           | Placement rule                         | Update trigger                      |
| --------------- | -------------------------------------- | ----------------------------------- |
| `product/`      | What does it do, for whom?             | Behaviour or scope changes          |
| `architecture/` | Why is it shaped this way?             | Boundary / flow / principle changes |
| `reference/`    | How does subsystem X work?             | Subsystem or config/API changes     |
| `guides/`       | How do I do task Y?                    | Procedure or tool changes           |
| `adr/`          | Why did we decide Z?                   | New or superseded decision          |
| `bugs/`         | What broke and what flaw?              | Reproduced non-trivial bug          |
| `_work/`        | What is queued / in flight?            | Planning                            |
| `_archive/`     | What happened before?                  | Never edited; only added to         |
| `assets/`       | Pictures and manuals shipped with npm? | Public manual or image changes      |

`product/`, `architecture/`, `reference/`, and `guides/` do not link into
the work tree. From outside the archive tree, only this router and the TODO
index may link into the archive. Those indexes are
[`docs/_work/TODO/README.md`](_work/TODO/README.md) and
[`docs/_archive/DONE/README.md`](_archive/DONE/README.md).

Package-local docs stay beside the code they describe. That includes
`packages/*/AGENTS.md`, `packages/*/README.md`, `NODE.md`,
`packages/ui/docs/*`, `packages/runtime/spec.md`, and `launcher/docs/**`.
They are registered below and will carry frontmatter. They are not moved into
`docs/`.

## Question routes

| Question                                                    | Document                                                                                                                                      |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| What is Langflower, and who is it for?                      | [`docs/product/PRODUCT.md`](product/PRODUCT.md)                                                                                               |
| What do the terms mean?                                     | [`docs/product/GLOSSARY.md`](product/GLOSSARY.md)                                                                                             |
| What is implemented, partial, or stubbed?                   | [`docs/product/STATUS.md`](product/STATUS.md). Gap reading: [`use-cases` § How to read a gap](product/use-cases/README.md#how-to-read-a-gap)  |
| Which user-facing feature specs exist?                      | [`docs/product/features/README.md`](product/features/README.md)                                                                               |
| What does the inspector show for the selected node?         | [`docs/product/features/inspector.md`](product/features/inspector.md)                                                                         |
| How do I run a workflow and see the active node?            | [`docs/product/features/workflow-execution.md`](product/features/workflow-execution.md)                                                       |
| Which end-to-end scenarios exist, and what is their status? | [`docs/product/use-cases/README.md`](product/use-cases/README.md)                                                                             |
| What is the north-star coding-agent scenario?               | [`docs/product/use-cases/coding-agent.md`](product/use-cases/coding-agent.md)                                                                 |
| What does the packaged skeleton seed contain?               | [`docs/product/use-cases/skeleton.md`](product/use-cases/skeleton.md)                                                                         |
| What coding rules are non-negotiable?                       | [`docs/architecture/PRINCIPLES.md`](architecture/PRINCIPLES.md) (stays `docs/architecture/PRINCIPLES.md`)                                     |
| How do startup, the API, and system flows work?             | [`docs/architecture/ARCHITECTURE.md`](architecture/ARCHITECTURE.md) (stays `docs/architecture/ARCHITECTURE.md`)                               |
| What are the RxJS fold and subscription rules?              | [`docs/architecture/REACTIVITY.md`](architecture/REACTIVITY.md) (stays `docs/architecture/REACTIVITY.md`)                                     |
| How does a node definition become a running graph?          | [`docs/architecture/EXECUTION_ARCHITECTURE.md`](architecture/EXECUTION_ARCHITECTURE.md) (stays `docs/architecture/EXECUTION_ARCHITECTURE.md`) |
| Where are the extension seams?                              | [`docs/architecture/EXTENSION_POINT.md`](architecture/EXTENSION_POINT.md) (stays `docs/architecture/EXTENSION_POINT.md`)                      |
| Where does a change belong in the package graph?            | [`docs/architecture/NAVIGATION.md`](architecture/NAVIGATION.md) (task table: [navigation-tasks.md](architecture/navigation-tasks.md))         |
| Why did we decide Z?                                        | [`docs/adr/README.md`](adr/README.md)                                                                                                         |
| What ngDiagram timing constraint should I design around?    | [`docs/architecture/ui/NG_DIAGRAM.md`](architecture/ui/NG_DIAGRAM.md)                                                                         |
| Why does the work log use a measured window?                | [`docs/architecture/ui/VIRTUAL_SCROLL.md`](architecture/ui/VIRTUAL_SCROLL.md)                                                                 |
| How do workflow sessions, head, and points work?            | [`docs/reference/SESSIONS.md`](reference/SESSIONS.md)                                                                                         |
| How does stuck-stream and dead-loop recovery work?          | [`docs/reference/LLM_RECOVERY.md`](reference/LLM_RECOVERY.md)                                                                                 |
| How do embeddings differ from chat completions?             | [`docs/reference/EMBEDDING.md`](reference/EMBEDDING.md)                                                                                       |
| How is `langflower.jsonc` configured?                       | [`docs/reference/CONFIG.md`](reference/CONFIG.md)                                                                                             |
| What are the built-in node folder conventions?              | [`docs/reference/NODES.md`](reference/NODES.md)                                                                                               |
| How do LLM nodes handle secrets, skills, and sessions?      | [`docs/reference/LLM_NODES.md`](reference/LLM_NODES.md)                                                                                       |
| What is the default agent system prompt?                    | [`docs/reference/SYSTEM_PROMPT.md`](reference/SYSTEM_PROMPT.md)                                                                               |
| How does a Cursor agent drive a live Langflower instance?   | [`docs/reference/LANGFLOWER_MCP.md`](reference/LANGFLOWER_MCP.md)                                                                             |
| How do reactive nodes bind, live, and demand work?          | [`docs/reference/REACTIVE_NODES.md`](reference/REACTIVE_NODES.md)                                                                             |
| How do I write a reactive node?                             | [`docs/guides/how-to-write-reactive-nodes.md`](guides/how-to-write-reactive-nodes.md)                                                         |
| How do I run unit, transport, and integration tests?        | [`docs/guides/TESTING.md`](guides/TESTING.md)                                                                                                 |
| How do I cut a CLI, SDK, or launcher release?               | [`docs/guides/RELEASE.md`](guides/RELEASE.md)                                                                                                 |
| What must a refactor shrink before it starts?               | [`docs/guides/REFACTORING.md`](guides/REFACTORING.md)                                                                                         |
| How do I write, place, and freshen a doc?                   | [`docs/guides/writing-docs.md`](guides/writing-docs.md) (stays `docs/guides/writing-docs.md`)                                                 |
| What broke, and what design flaw did it expose?             | [`docs/bugs/README.md`](bugs/README.md)                                                                                                       |
| Which epics are queued?                                     | [`docs/_work/TODO/README.md`](_work/TODO/README.md)                                                                                           |
| What counts as an epic, and what counts as a task?          | [`docs/_work/TODO/README.md`](_work/TODO/README.md#epic-or-task)                                                                              |
| Where is the epic file index?                               | [`docs/_work/TODO/EPICS/README.md`](_work/TODO/EPICS/README.md)                                                                               |
| Where are the small product tasks?                          | [`docs/_work/TODO/TASKS/README.md`](_work/TODO/TASKS/README.md)                                                                               |
| What cleanup is in flight?                                  | [`docs/_work/WIP/README.md`](_work/WIP/README.md)                                                                                             |
| Which review notes are still open?                          | [`docs/_work/TO_REVIEW.md`](_work/TO_REVIEW.md)                                                                                               |
| Which long-horizon tradeoffs are still unresolved?          | [`docs/_work/TBD.md`](_work/TBD.md)                                                                                                           |
| Which plans have already landed?                            | [`docs/_archive/DONE/README.md`](_archive/DONE/README.md)                                                                                     |
| Where is the code-regression summary?                       | [`docs/_archive/code-regression/SUMMARY.md`](_archive/code-regression/SUMMARY.md)                                                             |
| Where is the agent-honesty probe write-up?                  | [`docs/_archive/agent-honesty-probe/RESULTS.md`](_archive/agent-honesty-probe/RESULTS.md)                                                     |
| Where are the canvas pitfalls?                              | [`packages/ui/docs/DIAGRAM_CANVAS.md`](../packages/ui/docs/DIAGRAM_CANVAS.md) (stays beside the UI package)                                   |
| What does the npm product page say?                         | [`docs/assets/public/product.md`](assets/public/product.md)                                                                                   |
| Where is the runtime package spec?                          | [`packages/runtime/spec.md`](../packages/runtime/spec.md) (stays beside the runtime package)                                                  |
| Where are the README screenshot notes?                      | [`docs/assets/img/presentation.md`](assets/img/presentation.md)                                                                               |

## Package-local registry

Starter; docs-gen replaces this block later.

<!-- package-local-registry:start -->
<!-- generated by docs-gen; do not edit -->

| Path                                                            | What it covers                                           |
| --------------------------------------------------------------- | -------------------------------------------------------- |
| `launcher/AGENTS.md`                                            | langflower-launcher                                      |
| `launcher/README.md`                                            | Langflower launcher                                      |
| `launcher/docs/README.md`                                       | Langflower launcher — author guide                       |
| `launcher/docs/architecture.md`                                 | Architecture                                             |
| `launcher/docs/build-and-release.md`                            | Build, dogfood, and release                              |
| `launcher/docs/rust-primer.md`                                  | Rust primer for this crate                               |
| `launcher/docs/source-map.md`                                   | Source map                                               |
| `launcher/docs/testing.md`                                      | Testing the launcher                                     |
| `launcher/docs/window.md`                                       | Window (Slint)                                           |
| `packages/cli/AGENTS.md`                                        | @langflower/cli                                          |
| `packages/cli/README.md`                                        | @langflower/cli                                          |
| `packages/common-nodes/AGENTS.md`                               | @langflower/common-nodes                                 |
| `packages/common-nodes/src/ai/NODE.md`                          | AI category                                              |
| `packages/common-nodes/src/ai/nodes/critique/NODE.md`           | Critique                                                 |
| `packages/common-nodes/src/ai/nodes/fake-llm/NODE.md`           | Fake LLM                                                 |
| `packages/common-nodes/src/ai/nodes/openai-llm/NODE.md`         | OpenAI-compatible LLM                                    |
| `packages/common-nodes/src/ai/nodes/review/NODE.md`             | Review                                                   |
| `packages/common-nodes/src/ai/nodes/sub-agent/NODE.md`          | Sub-Agent                                                |
| `packages/common-nodes/src/crawl/crawl-tools/NODE.md`           | Crawl Tools                                              |
| `packages/common-nodes/src/crawl/crawl/NODE.md`                 | Crawl                                                    |
| `packages/common-nodes/src/crawl/extract-links/NODE.md`         | Extract Links                                            |
| `packages/common-nodes/src/crawl/fetch-url/NODE.md`             | Fetch URL                                                |
| `packages/common-nodes/src/crawl/save-page/NODE.md`             | Save Page                                                |
| `packages/common-nodes/src/embeddings/embed-provider/NODE.md`   | Embed provider                                           |
| `packages/common-nodes/src/embeddings/embed-similarity/NODE.md` | Embed similarity                                         |
| `packages/common-nodes/src/embeddings/embed-text/NODE.md`       | Embed text                                               |
| `packages/common-nodes/src/flow/checkpoint/NODE.md`             | Checkpoint                                               |
| `packages/common-nodes/src/flow/delay/NODE.md`                  | Delay                                                    |
| `packages/common-nodes/src/flow/loop/NODE.md`                   | Loop                                                     |
| `packages/common-nodes/src/flow/merge/NODE.md`                  | Merge                                                    |
| `packages/common-nodes/src/flow/repeat/NODE.md`                 | Repeat                                                   |
| `packages/common-nodes/src/flow/router/NODE.md`                 | Router                                                   |
| `packages/common-nodes/src/hitl/chat-input/NODE.md`             | Chat Input                                               |
| `packages/common-nodes/src/hitl/chat-loop/NODE.md`              | Chat Loop                                                |
| `packages/common-nodes/src/hitl/review-gate/NODE.md`            | Review Gate                                              |
| `packages/common-nodes/src/langflower-tools/NODE.md`            | Langflower Tools                                         |
| `packages/common-nodes/src/logic/assert/NODE.md`                | Assert                                                   |
| `packages/common-nodes/src/logic/compare/NODE.md`               | Compare                                                  |
| `packages/common-nodes/src/logic/gate/NODE.md`                  | Gate                                                     |
| `packages/common-nodes/src/logic/if/NODE.md`                    | If                                                       |
| `packages/common-nodes/src/logic/switch/NODE.md`                | Switch                                                   |
| `packages/common-nodes/src/mcp/mcp-http/NODE.md`                | MCP http                                                 |
| `packages/common-nodes/src/mcp/mcp-stdio/NODE.md`               | MCP stdio                                                |
| `packages/common-nodes/src/memory/memory-tools/NODE.md`         | Memory Tools                                             |
| `packages/common-nodes/src/output/finish/NODE.md`               | Finish                                                   |
| `packages/common-nodes/src/output/hint/NODE.md`                 | Hint                                                     |
| `packages/common-nodes/src/output/preview/NODE.md`              | Preview                                                  |
| `packages/common-nodes/src/output/tool-inspect/NODE.md`         | Tool inspect                                             |
| `packages/common-nodes/src/primitives/boolean/NODE.md`          | Boolean                                                  |
| `packages/common-nodes/src/primitives/number/NODE.md`           | Number                                                   |
| `packages/common-nodes/src/primitives/string-multiline/NODE.md` | String (multiline)                                       |
| `packages/common-nodes/src/primitives/string/NODE.md`           | String                                                   |
| `packages/common-nodes/src/text/append-file/NODE.md`            | Append File                                              |
| `packages/common-nodes/src/text/concat/NODE.md`                 | Concat                                                   |
| `packages/common-nodes/src/text/read-file/NODE.md`              | Read File                                                |
| `packages/common-nodes/src/text/split-paced/NODE.md`            | Split (paced)                                            |
| `packages/common-nodes/src/text/write-file/NODE.md`             | Write File                                               |
| `packages/common-nodes/src/tools/tool-collection/NODE.md`       | Tool collection                                          |
| `packages/common-nodes/src/tools/tool-invoke/NODE.md`           | Tool invoke                                              |
| `packages/compiler/AGENTS.md`                                   | @langflower/compiler                                     |
| `packages/eval/AGENTS.md`                                       | @langflower/eval                                         |
| `packages/langflower-mcp/AGENTS.md`                             | @langflower/mcp                                          |
| `packages/node-sdk/AGENTS.md`                                   | @langflower/node-sdk                                     |
| `packages/node-sdk/README.md`                                   | @langflower/node-sdk                                     |
| `packages/runtime/AGENTS.md`                                    | @langflower/runtime                                      |
| `packages/runtime/spec.md`                                      | Runtime editor/runner specification                      |
| `packages/server/AGENTS.md`                                     | @langflower/server                                       |
| `packages/server/README.md`                                     | @langflower/server                                       |
| `packages/server/src/bootstrap/spec.md`                         | Specification: Bootstrap full skeleton + Settings reseed |
| `packages/shared/AGENTS.md`                                     | @langflower/shared                                       |
| `packages/shared/README.md`                                     | @langflower/shared                                       |
| `packages/tools/AGENTS.md`                                      | @langflower/tools                                        |
| `packages/ui/AGENTS.md`                                         | @langflower/ui                                           |
| `packages/ui/README.md`                                         | @langflower/ui                                           |
| `packages/ui/docs/DIAGRAM_CANVAS.md`                            | ngDiagram canvas — context & pitfalls                    |
| `packages/ui/docs/THEMES.md`                                    | Themes (UI)                                              |
| `packages/ui/docs/TYPOGRAPHY.md`                                | Typography (UI)                                          |
| `packages/ui/docs/diagram-canvas-incidents.md`                  | Incident log (problems & fixes)                          |
| `packages/websocket-bridge/AGENTS.md`                           | @langflower/websocket-bridge                             |
| `packages/websocket-bridge/README.md`                           | @langflower/websocket-bridge                             |

<!-- package-local-registry:end -->

`launcher/AGENTS.md` stays beside the crate. Package `AGENTS.md`, per-node
`NODE.md`, and package `README.md` files stay beside the code. `docs-gen`
lists them in the registry above.

## What the docs-boundaries tests prove

`tests/unit/docs-boundaries/` reminds an agent to update the doc that covers a
change. A green run means someone looked at the matching doc, or recorded why
no doc change was needed. It does not prove the prose is correct. The contract
is [docs/guides/writing-docs.md#freshness](guides/writing-docs.md#freshness).
