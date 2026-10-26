---
kind: index
owner: docs
covers: []
status: current
---

# Use cases

End-to-end **product scenarios** for Langflower — what a person is trying to
accomplish, how the workflow graph looks (when applicable), and whether it can
run today. These are not feature specs or ADRs.

**Product purpose / goal:** [PRODUCT.md](../PRODUCT.md). **North star:**
[coding-agent](coding-agent.md) — **Available** as product capabilities
(tools, HITL, feedback, review, a second LLM node). The sample graph and
its prompts are user configuration, not the status bar.

For capability reference (nodes, HITL, execution), start at
[docs/product/features/](../features/README.md). Completed capability epics:
docs/_archive/DONE/EPICS/ (`docs/_archive/DONE/EPICS/README.md`).

## Doc structure

Every file in this folder follows the same order. **Customer value is the
source of truth**; lower layers only serve it.

1. **Value** — what the client gets / feels (mood included); one clause for
   what this is _not_
2. **UX scenarios** — `S1…Sn` as Who / Want / Do / Expect (projection of Value;
   the acceptance bar)
3. **UI specs** — table of [`docs/product/features/`](../features) docs × scenario
   ids (do not re-spec UI here)
4. **Runtime requirements** — minimal server/runtime needs tied to scenarios
   (≤6 rows). Acid test: if we never build it, which Expect dies? Prefer UI
   projection of existing events over new server surface — otherwise runtime
   becomes an unsupported monster
5. **Workflow shape** _(optional)_ — mermaid / wiring when the graph _is_ the
   value; omit for non-graph UCs
6. **Status** — `Available` | `Ready` | `Partial` | `Draft` | `Blocked`, with
   **Missing parts** (cite `Sn` + `UI`|`Runtime`), optional **Workarounds**,
   demo/CI paths

Multi-gate HITL (several open gates / tabs) is a [hitl-chat](../features/hitl-chat.md)
capability — **not** a separate use case. Epic 15 persona / identity hats were
removed; role separation = graph structure, not SSO simulation.

## Agent runtime prerequisites

End-user Status uses a stricter bar than the node catalog. Catalog `done` means
the node exists in the palette / runtime shape — **not** that an agent use case
is runnable with a real model and tools.

Wave-1 agent runtime (epics **01–05**) landed:

1. **Real LLM provider path** on agent nodes (`common-openai-llm` + providers in
   `langflower.jsonc`).
2. **Tool registration mechanics** — internal tool loop + `@langflower/tools`
   builtins (`read` / `glob` / `grep` / `edit` / `write` / `create` / `delete` /
   `move` / `bash` / `ask_user`) via `ExecutionContext.harness` (epic 01).
3. **Runtime `permission.ask`** — Allow/Deny in feed/composer (epic 02).
4. **LLM Review** — `common-review` port-routed `accept`/`feedback` (epic 03).
5. **Role tool profiles** — Plan/Coder/Explorer presets (epic 04).
6. **Partial pilots** — demo workflows + integration coverage (epic 05).
7. **Swarm primitives** — `common-loop` / `common-sub-agent` interim
   map-collect (epic 07). Sub-Agent **registration+spawn** is target
   ([ADR-021](../../adr/021-sub-agent-registration-port-routed-spawn-nodeid-filter.md)).

Also landed (not wave-1 prerequisites, but available): hard harness (06),
Memory + KB + Obsidian helpers + crawl (10–12), eval gate (09), multi-gate
HITL (composer tabs; epic 15 persona layer removed — see hitl-chat),
node-local MCP ([node-local-mcp](node-local-mcp.md)) — **Available**
(stdio / HTTP nodes, system servers, connect errors, inspect / invoke).
Checkpoints (14+20) are **Ready** as workflow-session points;
auto path stays off. Old checkpoint files are not read.
Feed chat mirror ([grok-feed](grok-feed.md) scenarios →
[feed-panel](../features/feed-panel.md)) is **Ready** — reasoning,
intermediate text, and tool calls are visible on a live provider.
Detachable long run
([detachable-long-run](detachable-long-run.md)) is **Ready** —
close the browser tab on a long run; the server keeps going. An open
launcher window reminds you that work is in progress.

## How to read a gap

Only the rows under **TODO-able gaps** are product gaps. A Missing parts row
outside that list is not a TODO. User configuration, a horizon item, and a
superseded file are not defects. Sample-prompt quality is not an open gap.
A TODO-able row is a task (`docs/_work/TODO/TASKS/`) unless the missing
part is a new product layer. That rule is
`docs/_work/TODO/README.md#epic-or-task`.
Handover, fan-out, fan-in, and independent Router channels are
Available. Settings is Ready.

### TODO-able gaps

None.

### Do not file

- Prompts, edges, and how dense a Router layout looks. `Missing parts: None`
  plus user configuration or user layout is not a gap.
- Dynamic swarm topology, nested workflow files, and every TBD entry
  (`docs/_work/TBD.md`). No current promise, no TODO. A TBD entry is not a
  Missing part until a use case takes it.
- Serial `common-loop` and the default Sub-Agent invoke. Separate LLM nodes
  that share one upstream value run at the same time.
- A hard format / typecheck / test check. Dogfood `lf-review-gate` (`ok`
  continues, `fail` returns text to the agent) and the seed `review-gate`.
- A universal knowledge base. Memory is `common-memory-tools`. Embeddings
  are the `hello-embed` constructor (`kb-ingest`, `kb-rag`, and the other
  sample graphs), not a host corpus
  ([ADR-033](../../adr/033-markdown-memory-tools-no-embedding-as-base.md)).
- Encrypted secret storage. Named secrets live in the user-global file so
  repository file tools cannot read them.
- A node error taking the graph down. The error stays on `error$` and the
  stream stays alive. Retry belongs to the node that failed (LLM autokick).
  Reloading an arbitrary other node is TBD-008, not a fragility bug.
- Browser E2E of the canvas. The canvas is a projection of the server
  snapshot. It is not the source of truth.
- Lazy-splitting the built-in catalog out of the CLI start chunk. Connect
  emits `palette.snapshot` before the canvas can draw a node. Epic 44 left
  that split out of scope. It does not move first paint.
- A stale index label (`partial`, `deferred`, "Tauri", "epic 45 queued").
  Read the use-case body.
- A **partial** row in the STATUS acceptance-criteria table. That is not a
  scenario unless the same row is listed under TODO-able gaps.

### Status layers

| Layer                  | Meaning                                                                                                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Authorable**         | Graph can be assembled in the editor from existing nodes                                                                                                                                                                             |
| **Mock-testable**      | Chain can be exercised with mock LLM in integration tests                                                                                                                                                                            |
| **Capability**         | A shipped mechanism: node, port, tool loop, HITL, custom node, `ok` / `fail` gate, recovery, feed, canvas chrome. This can be a product gap                                                                                          |
| **User configuration** | Edges, system prompts, which scripts a gate wraps, which ToolHandles a pack exposes. Specific to the repository. A sample workflow is an example, not the acceptance contract                                                        |
| **Available**          | Every capability the scenario needs is in the product, covered by a live OpenAI-compatible run. The user assembles the graph, prompts, and layout. A row that only demands “the sample prompts did a good job” is not a Missing part |
| **Ready**              | The scenario needs no extra configuration. The product already does it, and a live OpenAI-compatible run covered it                                                                                                                  |

## Status summary

Active epic queue: docs/_work/TODO/EPICS/
(`docs/_work/TODO/EPICS/README.md`) is empty. The task queue in
`docs/_work/TODO/TASKS/` is empty. Epic 45 (global KV secrets)
is archived. Further gaps are the
[TODO-able gaps](#todo-able-gaps) above — a product capability, not
sample-prompt quality.

| Status    | Scenarios                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ready     | [skeleton](skeleton.md), [bootstrap-new-project](bootstrap-new-project.md), [settings-panel](settings-panel.md), [run-interruption](run-interruption.md), [detachable-long-run](detachable-long-run.md), [resumable-checkpoint-jobs](resumable-checkpoint-jobs.md), [grok-feed](grok-feed.md)                                                                                                                                                                                                                                              |
| Available | [coding-agent](coding-agent.md), [node-local-mcp](node-local-mcp.md), [prompt-refining](prompt-refining.md), [article-writing](article-writing.md), [permission-escalation-ops](permission-escalation-ops.md), [adversarial-red-team](adversarial-red-team.md), [eval-regression-gate](eval-regression-gate.md), [skill-refining](skill-refining.md), [router-edge-hub](router-edge-hub.md), [agent-swarm](agent-swarm.md), [research-fanout-merge](research-fanout-merge.md), [plan-refine-code-review-qa](plan-refine-code-review-qa.md) |
| Partial   | [turn-attachments](turn-attachments.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Draft     | _(none today)_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Blocked   | _(none today)_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

## Index

### Product entry

| Doc                                                  | Focus                                                                                                                  |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| [bootstrap-new-project.md](bootstrap-new-project.md) | Empty / unconfigured folder → `.langflower` + coding seed + provider setup                                             |
| [skeleton.md](skeleton.md)                           | Seed SoT is `packages/server/skeleton/` (**Ready**). Sample-workflows catalog UI is an optional tail, not the seed bar |
| [settings-panel.md](settings-panel.md)               | Configure providers/models/keys in UI — project + global; gear replaces right panel (**Ready**)                        |

### Core scenarios

| Doc                                                            | Focus                                                                                                                                                  |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [coding-agent.md](coding-agent.md)                             | Multi-loop coding capabilities (**Available**); sample graph and prompts are user configuration; smoke = `basic-coder`                                 |
| [turn-attachments.md](turn-attachments.md)                     | Attach png, jpeg, gif, webp, wav, mp3, or pdf on a chat turn, or stage the same files from `read` (**Partial** — no live vision check, no browser e2e) |
| [skill-refining.md](skill-refining.md)                         | Iterate a skill/instruction `.md` against a fixture pack (**Available**)                                                                               |
| [article-writing.md](article-writing.md)                       | Topic → draft file → tone/fact HITL → revise (research = extend later)                                                                                 |
| [agent-swarm.md](agent-swarm.md)                               | Handover, fan-out, and fan-in on a graph drawn before Start (**Available**). Dynamic topology is not a current promise                                 |
| [plan-refine-code-review-qa.md](plan-refine-code-review-qa.md) | Plan → assert → refine → implement → review → QA                                                                                                       |
| [skill-refining.md](skill-refining.md)                         | Refine a skill file with eval + harness (**Available**)                                                                                                |
| ~~[project-kb.md](project-kb.md)~~                             | **Superseded** by markdown memory ([ADR-033](../../adr/033-markdown-memory-tools-no-embedding-as-base.md)); skeleton `kb-create` / `kb-navigate`       |
| ~~[obsidian-kb.md](obsidian-kb.md)~~                           | **Deferred** — TBD-007 (`docs/_work/TBD.md#tbd-007--obsidian-vault-helpers`)                                                                           |
| [prompt-refining.md](prompt-refining.md)                       | Draft → QA → improve loop; output is a text prompt file                                                                                                |

### Canvas / graph organisation

| Doc                                      | Focus                                            |
| ---------------------------------------- | ------------------------------------------------ |
| [router-edge-hub.md](router-edge-hub.md) | Router channels stay independent (**Available**) |

### Gaps vs common chat harnesses

| Doc                                                              | Focus                                                                                                                                                   |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [eval-regression-gate.md](eval-regression-gate.md)               | Golden / fixture suite with scoring and stop-on-regression (**Available**)                                                                              |
| [research-fanout-merge.md](research-fanout-merge.md)             | Loop map-collect → synth + conflict Review (**Available** — `rerunItems` replaces matching slots; the demo feedback edge still revises the synthesizer) |
| [permission-escalation-ops.md](permission-escalation-ops.md)     | Staged explore → write → bash (**Available** — `permission.ask` live; stage graph is user configuration)                                                |
| [adversarial-red-team.md](adversarial-red-team.md)               | Two conflict models: agree-then-Review vs Review-each-round (**Available** — critique quality is the prompt)                                            |
| ~~[kb-contradiction-curation.md](kb-contradiction-curation.md)~~ | **Removed** with vector KB (ADR-033)                                                                                                                    |
| [resumable-checkpoint-jobs.md](resumable-checkpoint-jobs.md)     | Resume from a workflow-session point (**Ready**). Auto every-node checkpoints stay off                                                                  |
| [grok-feed.md](grok-feed.md)                                     | Work log shows reasoning, intermediate text, and tool calls (**Ready** — 2026-10-17)                                                                    |
| [run-interruption.md](run-interruption.md)                       | Hard Stop, soft Pause / Steer, idle / dead-loop / 5xx recovery (**Ready**)                                                                              |
| [detachable-long-run.md](detachable-long-run.md)                 | Close the browser tab on a long run; server keeps going (**Ready**)                                                                                     |
| [node-local-mcp.md](node-local-mcp.md)                           | MCP stdio / HTTP nodes, system servers, inspect / invoke (**Available**)                                                                                |

## Candidates (backlog)

Not written yet: Socratic teaching coach, incident triage playbook, localization
pipeline.

Long-horizon platform goals (sandbox, desktop shell, multi-tenant, true
Loop concurrency) are **not** use-case candidates — see TBD.md (`docs/_work/TBD.md`).
