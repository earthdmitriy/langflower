---
kind: product
owner: docs
covers: []
status: current
---

# Implementation Status

Legend: **done** · **partial** · **stub** (NODE.md / placeholder only) · **planned**

**Product purpose:** [PRODUCT.md](PRODUCT.md).

**Roadmap:** [use-cases/README.md](use-cases/README.md) (Status gaps —
Partial → Available; north star coding-agent) ·
TODO/EPICS/README.md (`docs/_work/TODO/EPICS/README.md`) (active queue: see file) ·
[features/README.md](features/README.md) (UI / capability contracts) ·
DONE/EPICS/README.md (`docs/_archive/DONE/EPICS/README.md`) (completed epics archive **00–46**) ·
DONE/LLM-NODES/llm-nodes-README.md (`docs/_archive/DONE/LLM-NODES/llm-nodes-README.md`) (LLM foundation 1–6).

Do **not** use historical Stage 1 / 2 / 3 labels for planning — see PRODUCT.md.

**Product readiness (end-user scenarios):** [use-cases/README.md](use-cases/README.md) —
docs use **Value → UX scenarios → UI specs → Runtime → Status**.
**Available** means the scenario's capabilities are in the product. The
user assembles the graph, prompts, and layout. **Ready** means the
scenario needs no extra configuration: the product already does it
(the seed, Settings, Stop / Pause, the work log, close-tab, session
Continue). Both were covered by a live OpenAI-compatible run
(maintainer, 2026-10-17). Sample graph quality is user configuration.
Catalog `done` ≠ use-case Available or Ready. Persona / multi-role-approval identity UC
**removed** (epic 15); multi-gate HITL =
[hitl-chat](features/hitl-chat.md) tabs.

**Live provider:** Default `verify` uses a deterministic LLM stand-in and a
fixture MCP echo server. A real model is expensive and not deterministic, so
those tests are the suite, not an open capability. A maintainer run on
2026-10-17 confirmed tool calls, idle / dead-loop / 5xx recovery, Pause →
Steer, several tabs, and working MCP nodes. Checklist:
[TESTING.md — Live OpenAI-compatible + MCP](../guides/TESTING.md#live-openai-compatible--mcp-tool-calling).

**Runtime catalog source of truth:**
[`packages/common-nodes/src/catalog.ts`](../../packages/common-nodes/src/catalog.ts).

Last aligned with use-cases README (2026-10-17).

## Acceptance criteria

| #   | Criterion                             | Status   | Key files                                                                                                                                              |
| --- | ------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Web server starts, UI opens           | **done** | Server starts and the UI opens. The node catalog stays in the published start chunk: connect emits `palette.snapshot` before the canvas can draw nodes |
| 2   | Nodes created/connected/deleted in UI | **done** | ngDiagram canvas, palette, WS node list. No missing behavior named                                                                                     |
| 3   | Configs in `.langflower`              | **done** | project + Settings UI + global layer (epic 18); [settings-panel](use-cases/settings-panel.md) **Ready**                                                |
| 4   | Workflows stored as JSON              | **done** | `workflow.service.ts`, `workflow.*` WS events                                                                                                          |
| 5   | Load/edit/delete workflows            | **done** | toolbar, workflow-store, `workflow.*` bus events. No missing behavior named                                                                            |
| 6   | Reload nodes button                   | **done** | Custom hot-swap is done (Update + `compile_custom_nodes`). System `palette.reload.requested` is unchanged and is not a promised reload button          |
| 7   | Palette compile errors                | **done** | `customPalette.snapshot.errors` + pack `COMPILATION_ERRORS.md`                                                                                         |
| 8   | Project directory via CLI             | **done** | `start-command.ts`, `lf-project-dir`                                                                                                                   |
| 9   | Inline primitive inputs on node body  | **done** | `app/components/lf-inline-field.component.ts`, `lf-node.component.ts`                                                                                  |

## By package

Per-package status is in [status-by-package.md](status-by-package.md).

## Tooling — **done**

- Monorepo build scripts (`build/`)
- Prettier + ESLint
- Full `build-all` passes
- Test strategy documented — [TESTING.md](../guides/TESTING.md)
- Vitest wired — `npm run test`, `build/test.mjs`

## Execution (WS runner) — **done** (graph basics)

Common-node workflow execution via the WebSocket runner bus. See
[architecture/EXECUTION_ARCHITECTURE.md](../architecture/EXECUTION_ARCHITECTURE.md).

| Area                                      | Status   | Path                                                                                                                                                            |
| ----------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Batch / reactive runner                   | **done** | `LangflowerSession` + `@langflower/runtime` `RuntimeRunner` (`wire-runner-handlers.ts`)                                                                         |
| Durable checkpoints + resume (Epic 14+20) | **done** | Workflow-session points + Continue from; auto off; no old checkpoint-file reader; [resumable-checkpoint-jobs](use-cases/resumable-checkpoint-jobs.md) **Ready** |
| UI work log + canvas chrome (node + wire) | **done** | Chrome **done**; feed shows reasoning, intermediate text, and tool calls on a live provider — [grok-feed](use-cases/grok-feed.md) **Ready**                     |
| Detachable run (close browser, reopen)    | **done** | Close the browser tab; the server keeps the run — [detachable-long-run](use-cases/detachable-long-run.md) **Ready**                                             |
| Integration tests                         | **done** | `tests/integration/ws/execute-*.ws.test.ts`                                                                                                                     |

## Product docs (use-cases + features)

Source of truth for **end-user** Status: [use-cases/README.md](use-cases/README.md).
Feature contracts: [features/README.md](features/README.md).

### Use-case Status (summary)

| Status        | Scenarios                                                                                                                                                                                                                              |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ready**     | skeleton (seed), bootstrap-new-project, settings-panel, run-interruption, detachable-long-run, resumable-checkpoint-jobs, grok-feed                                                                                                    |
| **Available** | coding-agent, node-local-mcp, prompt-refining, article-writing, permission-escalation-ops, adversarial-red-team, eval-regression-gate, skill-refining, router-edge-hub, agent-swarm, research-fanout-merge, plan-refine-code-review-qa |
| **Partial**   | _(none)_                                                                                                                                                                                                                               |
| **Draft**     | _(none)_                                                                                                                                                                                                                               |
| **Blocked**   | _(none)_                                                                                                                                                                                                                               |
| **Removed**   | multi-role-approval (persona identity — epic 15; multi-gate → hitl-chat); project-kb / kb-contradiction (ADR-033); obsidian-kb deferred                                                                                                |

Honesty notes (2026-10-17 operator proof). How to read a gap — only the
TODO-able rows are product gaps — is canonical in
[use-cases § How to read a gap](use-cases/README.md#how-to-read-a-gap).

TODO-able gaps:

None.

Do not file: user prompts and layout (including Router density), dynamic
swarm topology, nested workflows, TBD entries, serial Loop versus concurrent
fixed nodes, encrypted secrets, a universal knowledge base (memory tools +
`hello-embed`), a node error killing the graph (`error$` stays alive; retry
is in the failing node), or browser E2E of the canvas projection. A stale
index label is not the use-case body.

- **coding-agent** — capabilities Available. Outcome quality is the
  user's graph and prompts.
- **eval-regression-gate** / **skill-refining** — pack runner and
  stop-on-regression are Available. Pack contents and a dedicated refine
  graph are user configuration.
- **permission-escalation-ops** / **adversarial-red-team** /
  **prompt-refining** / **article-writing** — Available.
  Sample editorial or critique quality is user configuration.
  **grok-feed** is Ready: the work log shows reasoning, intermediate
  text, and tool calls without a special graph.
- **resumable-checkpoint-jobs** — Ready. Session points. HITL / Memory
  inside the point payload stay out of the bar. Auto checkpoints stay off.
- **settings-panel** — Ready. Gear, project and global Save, write-only
  keys, and named secrets. Hand-edit stays the escape hatch.
- **detachable-long-run** — Ready. Close the browser tab. An open launcher
  window reminds you that work is in progress.
- **agent-swarm** — handover, fan-out, and fan-in are Available on a
  graph drawn before Start. Dynamic topology is not a current promise.
- **router-edge-hub** — channels are independent. A value on `ch` stays on
  `ch`. The hub is Available: the user wires the channels.
- **router-edge-hub** — channels are independent. A value on `ch` stays on
  `ch`.

### Feature contracts (UI / config)

| Feature                                                                                                                                                                | Status                     | Notes                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| [feed-panel](features/feed-panel.md)                                                                                                                                   | **done**                   | Reasoning, intermediate text, and tool calls visible on a live provider ([grok-feed](use-cases/grok-feed.md) **Ready**)         |
| [inspector](features/inspector.md)                                                                                                                                     | **done** (selection aside) | Post-Save LLM option rebind landed (epic 18)                                                                                    |
| [hitl-chat](features/hitl-chat.md)                                                                                                                                     | **done**                   | Multi-gate tabs + soft-Pause Steer; live Pause → Steer confirmed 2026-10-17 ([run-interruption](use-cases/run-interruption.md)) |
| [workflow-execution](features/workflow-execution.md)                                                                                                                   | **done**                   | Hard Stop, soft Pause / Steer, canvas stage ([run-interruption](use-cases/run-interruption.md) **Ready**)                       |
| [project-configuration](features/project-configuration.md)                                                                                                             | **done**                   | Hand-edit + Settings dual path; [settings-panel](use-cases/settings-panel.md) **Ready**                                         |
| [settings-panel](features/settings-panel.md)                                                                                                                           | **done**                   | Gear aside; project/global; write-only keys; named secrets                                                                      |
| [getting-started](features/getting-started.md) / [visual-workflow-editor](features/visual-workflow-editor.md) / [workflow-management](features/workflow-management.md) | **partial**–**done**       | Unchanged capability surface; see feature files                                                                                 |
| [node-library](features/node-library.md)                                                                                                                               | catalog SoT                | Shipped = `catalog.ts` rows above — not every NODE.md stub                                                                      |

## Common nodes — runtime catalog

The runtime catalog is in [status-common-nodes.md](status-common-nodes.md).

## Out of scope (deferred)

Sandboxed user-node execution and embedding the canvas in a native
webview are tracked as long-horizon goals in TBD.md (`docs/_work/TBD.md`) (not the
near-term epic queue). The thin Slint CLI supervisor is **not** that
shell ([ADR-038](../adr/038-launcher-is-a-cli-supervisor.md)). Tauri
is not the intended launcher path (tried; WebView + large exe).

When extending stubs, keep existing file paths — do not create parallel implementations.
