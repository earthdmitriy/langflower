# Implementation Status

Legend: **done** · **partial** · **stub** (NODE.md / placeholder only) · **planned**

**Product purpose:** [PRODUCT.md](PRODUCT.md).

**Roadmap:** [use-cases/README.md](use-cases/README.md) (Status gaps —
Partial → Implementable; north star coding-agent) ·
[TODO/EPICS/README.md](TODO/EPICS/README.md) (active queue: see file) ·
[features/README.md](features/README.md) (UI / capability contracts) ·
[DONE/EPICS/README.md](DONE/EPICS/README.md) (completed epics archive **00–45**) ·
[DONE/LLM-NODES/llm-nodes-README.md](DONE/LLM-NODES/llm-nodes-README.md) (LLM foundation 1–6).

Do **not** use historical Stage 1 / 2 / 3 labels for planning — see PRODUCT.md.

**Product readiness (end-user scenarios):** [use-cases/README.md](use-cases/README.md) —
docs use **Value → UX scenarios → UI specs → Runtime → Status**. Agent runtime
epics **00–25** are archived in DONE; **no** use case is Implementable yet
(real-LLM / live-provider bars). Catalog `done` ≠ use-case Implementable.
Persona / multi-role-approval identity UC **removed** (epic 15); multi-gate HITL =
[hitl-chat](features/hitl-chat.md) tabs. Active queue:
[TODO/EPICS](TODO/EPICS/README.md) (see active queue).

**Live LLM / MCP verify gap:** CI uses Fake + scripted `tool_calls` only.
Maintainer has **no** OpenAI-compatible cloud API access right now — real model
tool + MCP invoke on MCP-wired nodes is **unproven**. Checklist:
[TESTING.md — Live OpenAI-compatible + MCP](TESTING.md#live-openai-compatible--mcp-tool-calling-gap).

**Runtime catalog source of truth:**
[`packages/common-nodes/src/catalog.ts`](../packages/common-nodes/src/catalog.ts).

Last aligned with `catalog.ts`, use-cases README, and features README
(2026-07-21).

## Acceptance criteria

| #   | Criterion                             | Status      | Key files                                                                                                                                              |
| --- | ------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Web server starts, UI opens           | **partial** | `cli/start-command.ts`, `server/create-server.ts` — published CLI concatenates start graph (~8 JS); catalog still eager in the start chunk             |
| 2   | Nodes created/connected/deleted in UI | **partial** | ngDiagram canvas, palette, WS node list                                                                                                                |
| 3   | Configs in `.langflower`              | **partial** | project + Settings UI + global layer (epic 18); [settings-panel](use-cases/settings-panel.md) **Partial**                                              |
| 4   | Workflows stored as JSON              | **done**    | `workflow.service.ts`, `workflow.*` WS events                                                                                                          |
| 5   | Load/edit/delete workflows            | **partial** | toolbar, workflow-store, `workflow.*` bus events                                                                                                       |
| 6   | Reload nodes button                   | **partial** | system: `palette.reload.requested` unchanged; custom: Update + Langflower Tools `compile_custom_nodes` (bus) + hot-swap + same-turn inventory **done** |
| 7   | Palette compile errors                | **done**    | `customPalette.snapshot.errors` + pack `COMPILATION_ERRORS.md`                                                                                         |
| 8   | Project directory via CLI             | **done**    | `start-command.ts`, `lf-project-dir`                                                                                                                   |
| 9   | Inline primitive inputs on node body  | **done**    | `node-inline-inputs`, `lf-node.component.ts`                                                                                                           |

## By package

### `@langflower/shared` — **partial**

| Area                    | Status      | Path                                                                                                                                                                        |
| ----------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DataType` union        | partial     | `types/data-type.ts`                                                                                                                                                        |
| Node / workflow types   | partial     | `types/node-definition.ts`, `workflow.ts`                                                                                                                                   |
| Config schema           | partial     | `types/config.ts`                                                                                                                                                           |
| `canConnectPorts`       | **done**    | `validators/connection-validator.ts`                                                                                                                                        |
| WebSocket bus registry  | **done**    | `langflower-bus-config.ts`, `langflower.ts`                                                                                                                                 |
| Defaults                | **done**    | `constants/defaults.ts`                                                                                                                                                     |
| Partial-run plan        | **planned** | `execution/partial-run-plan.ts` — not yet implemented; feed-panel Phase 1 derives partial-run trimming client-side (`packages/ui/src/app/features/sidebar/feed-section.ts`) |
| Langflower config (LLM) | **done**    | `types/langflower-config.ts`, `langflower.jsonc`                                                                                                                            |

### `@langflower/server` — **partial**

| Area                                 | Status      | Path                                                                                                                                                                                         |
| ------------------------------------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createServer`                       | **done**    | `create-server.ts`                                                                                                                                                                           |
| API routers                          | partial     | `api/workflows-router.ts` (bulk REST)                                                                                                                                                        |
| Node registry                        | **done**    | System via `PaletteService`; custom via `CustomPaletteService` + resolve merge                                                                                                               |
| Custom node compiler                 | **done**    | `@langflower/compiler` + `customPalette.*` bus; contract [ADR-030](ADR.md#adr-030--custom-node-pack-layout--npm-model)                                                                       |
| Workflow CRUD                        | **done**    | `workflow/workflow.service.ts`                                                                                                                                                               |
| Config service                       | **done**    | `config/`                                                                                                                                                                                    |
| Langflower config (project + global) | **done**    | `config/langflower-config.service.ts` — project `.langflower/langflower.jsonc` + OS user global merge (epic 18; ADR-002)                                                                     |
| Global user config + Settings UI     | **partial** | Gear aside + write-only keys + Project Bootstrap ([settings-panel](use-cases/settings-panel.md) **Partial**)                                                                                 |
| Workflow executor                    | **done**    | Runtime runner via bridge (`bridge/` + `@langflower/runtime`)                                                                                                                                |
| Project bootstrap                    | **partial** | `bootstrap/project-bootstrap.service.ts` — full skeleton on missing `.langflower/`; Settings force reseed; empty-provider opens Global Settings; fail-closed named-path run error still open |
| WebSocket                            | **done**    | `bridge/attach-langflower-bridge.ts` (+ `bridge/BRIDGE.md`)                                                                                                                                  |
| Session survives UI disconnect       | **done**    | Same process keeps run; [detachable-long-run](use-cases/detachable-long-run.md) S1                                                                                                           |
| Skeleton seed (`my-nodes` + samples) | **partial** | Full `packages/server/skeleton/` on first-run + Settings Bootstrap force; packaged `dist/skeleton` + catalog UI still open                                                                   |
| Harness sandbox                      | **partial** | `@langflower/tools` + thin `server/src/harness/` (permissions); epic 01/02                                                                                                                   |

### `@langflower/ui` — **partial**

| Area                            | Status      | Path                                                                                                                                                        |
| ------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Editor layout                   | **done**    | `features/editor/`                                                                                                                                          |
| ngDiagram canvas                | **done**    | `features/canvas/`, `diagram/`                                                                                                                              |
| Connection middleware           | **done**    | `diagram/connection-validation.middleware.ts`                                                                                                               |
| Workflow ↔ diagram map          | **done**    | `diagram/workflow-diagram.mapper.ts`                                                                                                                        |
| Inline node inputs              | **done**    | `features/canvas/node-inline-inputs.component.ts`                                                                                                           |
| Typography / theme              | **done**    | `docs/TYPOGRAPHY.md`, `src/theme/`                                                                                                                          |
| Palette                         | **done**    | `features/palette/`                                                                                                                                         |
| Topbar / workflow chrome        | **partial** | `features/topbar/` + Settings gear (epic 18)                                                                                                                |
| Right sidebar — feed (work log) | **partial** | `features/sidebar/` — chat-dense (epic 17) + hide unmarked (epic 43); [feed-panel](features/feed-panel.md), [grok-feed](use-cases/grok-feed.md) **Partial** |
| Right sidebar — inspector       | **done**    | `lf-inspector-panel` — selection swap + post-Save LLM option rebind (epic 18; [inspector](features/inspector.md))                                           |
| Right sidebar — Settings aside  | **partial** | Server-driven Settings; empty-provider Global open; [settings-panel](features/settings-panel.md)                                                            |
| WebSocket + execution           | **done**    | `langflower-bridge.service.ts`, `workflow-execution.service.ts`                                                                                             |
| WorkflowStore                   | **done**    | `services/workflow-store.service.ts`                                                                                                                        |

### `langflower` CLI — **done** (compose layer)

| Area                                     | Status   | Path                                                                                                                             |
| ---------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `langflower start`                       | **done** | `src/start-command.ts` — bootstrap + `createServer` + port/project logs + run-settle lines (epic 19)                             |
| Run settle stdout (“work done” / failed) | **done** | Epic 19 — [detachable-long-run](use-cases/detachable-long-run.md) S4                                                             |
| Commander wiring                         | **done** | `src/cli.ts` / `src/index.ts` (process entry, not a re-export barrel)                                                            |
| `langflower eval`                        | **done** | `src/eval-command.ts` — Fake primary `runCase` + optional `--replay` ([eval-regression-gate](use-cases/eval-regression-gate.md)) |

## Tooling — **done**

- Monorepo build scripts (`build/`)
- Prettier + ESLint
- Full `build-all` passes
- Test strategy documented — [TESTING.md](TESTING.md)
- Vitest wired — `npm run test`, `build/test.mjs`

## Execution (WS runner) — **done** (graph basics)

Common-node workflow execution via the WebSocket runner bus. See
[EXECUTION_ARCHITECTURE.md](EXECUTION_ARCHITECTURE.md).

| Area                                      | Status      | Path                                                                                                                                                        |
| ----------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Batch / reactive runner                   | **done**    | `LangflowerSession` + `@langflower/runtime` `RuntimeRunner` (`wire-runner-handlers.ts`)                                                                     |
| Durable checkpoints + resume (Epic 14+20) | **partial** | Explicit node + picker (epic 20); auto off; [resumable-checkpoint-jobs](use-cases/resumable-checkpoint-jobs.md) **Partial**                                 |
| UI work log + canvas chrome (node + wire) | **partial** | Chrome/execution folds **done**; feed chat-density **Partial** (epics 17 + 43) — [grok-feed](use-cases/grok-feed.md) / [feed-panel](features/feed-panel.md) |
| Detachable run (close browser, reopen)    | **partial** | Epic 19 — chrome/gate + CLI settle; [detachable-long-run](use-cases/detachable-long-run.md) **Partial**                                                     |
| Integration tests                         | **done**    | `tests/integration/ws/execute-*.ws.test.ts`                                                                                                                 |

## Product docs (use-cases + features)

Source of truth for **end-user** Status: [use-cases/README.md](use-cases/README.md).
Feature contracts: [features/README.md](features/README.md).

### Use-case Status (summary)

| Status            | Scenarios                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Implementable** | _(none)_                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Partial**       | bootstrap-new-project, coding-agent, plan-refine-code-review-qa, adversarial-red-team (agree-then-Review + Review-each-round demos), agent-swarm (L0 spawn), research-fanout-merge, article-writing, prompt-refining, skill-refining, eval-regression-gate, project-kb, obsidian-kb, grok-feed, settings-panel, detachable-long-run, resumable-checkpoint-jobs, permission-escalation-ops, kb-contradiction-curation |
| **Draft**         | _(none)_                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Blocked**       | _(none)_                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Removed**       | multi-role-approval (persona identity — epic 15; multi-gate → hitl-chat)                                                                                                                                                                                                                                                                                                                                             |

Honesty notes (epics 17–25 landed; Prefer Partial until live-LLM / manual smoke):

- **coding-agent** — `coding-agent.json` + Fake CI topology (epic 21). Smoke =
  `basic-coder` only — smoke ≠ Value. Real-LLM S1–S7 still open.
- **research-fanout-merge** — synth + Review past Preview (epic 22); S4 nested
  deferred.
- **eval-regression-gate** — CLI Fake primary `runCase`; `--replay` optional
  (epic 23).
- **permission-escalation-ops** — staged-ops demo + Allow/Deny (epic 24).
- **kb-contradiction-curation** — dedupe / contradict / apply nodes (epic 25).
- **resumable-checkpoint-jobs** — explicit `common-checkpoint` + picker
  (epic 20); auto checkpoints remain off.
- **settings-panel** / **detachable-long-run** / **grok-feed** — Partial
  (epics 18 / 19 / 17); Implementable needs maintainer smoke / live mood.
- **agent-swarm** = L0 Sub-Agent spawn; fan-out/merge → research-fanout-merge.
- **article-writing** demo spine = topic→draft file→HITL (research = extend later).

### Feature contracts (UI / config)

| Feature                                                                                                                                                                | Status                     | Notes                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [feed-panel](features/feed-panel.md)                                                                                                                                   | **partial**                | Chat-density + draft/tool segments (**DONE** epic 34); hide unmarked / `'none'` (**DONE** epic 43); composer shell (**DONE** epic 35); live-provider Implementable still open ([grok-feed](use-cases/grok-feed.md)) |
| [inspector](features/inspector.md)                                                                                                                                     | **done** (selection aside) | Post-Save LLM option rebind landed (epic 18)                                                                                                                                                                        |
| [hitl-chat](features/hitl-chat.md)                                                                                                                                     | **partial**                | Multi-gate tabs + soft-Pause Steer (**DONE** epic 36); shell layout no labels / tabs-only-2+ (**DONE** epic 35); real-LLM bars open                                                                                 |
| [workflow-execution](features/workflow-execution.md)                                                                                                                   | **partial**                | Hard Stop rose + soft Pause/`steerControl` (**DONE** epic 36, ADR-031/032); composer shell (**DONE** epic 35); [run-interruption](use-cases/run-interruption.md)                                                    |
| [project-configuration](features/project-configuration.md)                                                                                                             | **partial**                | Hand-edit + Settings dual path (epic 18); [settings-panel](use-cases/settings-panel.md) Partial                                                                                                                     |
| [settings-panel](features/settings-panel.md)                                                                                                                           | **partial**                | Server-driven gear aside; empty-provider Global open; project/global; write-only keys                                                                                                                               |
| [getting-started](features/getting-started.md) / [visual-workflow-editor](features/visual-workflow-editor.md) / [workflow-management](features/workflow-management.md) | **partial**–**done**       | Unchanged capability surface; see feature files                                                                                                                                                                     |
| [node-library](features/node-library.md)                                                                                                                               | catalog SoT                | Shipped = `catalog.ts` rows above — not every NODE.md stub                                                                                                                                                          |

## Common nodes — runtime catalog

Registered in [`catalog.ts`](../packages/common-nodes/src/catalog.ts) only.
Target / stub specs live as `NODE.md` under `packages/common-nodes/src/**` and
in [features/node-library.md](features/node-library.md) — **do not treat those as
shipped**.

| Node                      | Type                      | Status      | Notes                                                                                       |
| ------------------------- | ------------------------- | ----------- | ------------------------------------------------------------------------------------------- |
| String / Number / Boolean | `common-string`, …        | **done**    | Literals                                                                                    |
| String (multiline)        | `common-string-multiline` | **done**    | Literal textarea (`inline: 'text-multiline'`)                                               |
| Merge                     | `common-merge`            | **done**    | Flow                                                                                        |
| Delay                     | `common-delay`            | **done**    | Flow                                                                                        |
| Loop                      | `common-loop`             | **done**    | External map-collect for dynamic N (epic 07)                                                |
| Repeat                    | `common-repeat`           | **done**    | Flow — emit `value` N times (first ASAP, then on `trigger`), `index` (0-based), then `done` |
| Router                    | `common-router`           | **done**    | Reactive channels                                                                           |
| Preview                   | `common-preview`          | **done**    | Output                                                                                      |
| Finish                    | `common-finish`           | **done**    | `stopsRun`                                                                                  |
| Checkpoint                | `common-checkpoint`       | **done**    | Explicit durable boundary + picker resume (epic 20)                                         |
| Concat                    | `common-concat`           | **done**    | Text                                                                                        |
| Split (paced)             | `common-split-paced`      | **done**    | Text — one non-empty chunk per trigger (first ASAP), `index`, then `finish`                 |
| Read File                 | `common-read-file`        | **done**    | Text — `ctx.files` (relative-only, no permission ask)                                       |
| Write File                | `common-write-file`       | **done**    | Text — `ctx.files`                                                                          |
| Append File               | `common-append-file`      | **done**    | Text — `ctx.files` + delimiter                                                              |
| Review Gate               | `common-hitl-review-gate` | **done**    | Reactive HITL (approve / request-changes; multi-await OK)                                   |
| Fake LLM                  | `common-fake-llm`         | **done**    | Demo stream + scripted internal tool-loop                                                   |
| OpenAI-compatible LLM     | `common-openai-llm`       | **done**    | Reactive stream/tool loop; idle/5xx retry → Steer; role tool profiles                       |
| MCP stdio                 | `common-mcp-stdio`        | **done**    | Node-owned stdio MCP → `tools` (`ToolHandle[]`)                                             |
| MCP http                  | `common-mcp-http`         | **done**    | Node-owned HTTP MCP (+ optional launch) → `tools` (`ToolHandle[]`)                          |
| Review (LLM tools)        | `common-review`           | **done**    | Shared reactive loop + forced `accept`/`feedback` policy                                    |
| Critique (LLM tools)      | `common-critique`         | **done**    | Shared reactive loop + path-choice attack policy                                            |
| Sub-Agent                 | `common-sub-agent`        | **partial** | OUT `subagent-registration`; invoke in-node; L1+ open                                       |
| Chat Input                | `common-chat-input`       | **done**    | Composer cold-start entry (epic 13)                                                         |
| Assert                    | `common-assert`           | **done**    | Hard harness (epic 06)                                                                      |
| IF                        | `common-if`               | **done**    | Hard harness (epic 06)                                                                      |
| Gate                      | `common-gate`             | **done**    | Hard harness (epic 06)                                                                      |
| Compare                   | `common-compare`          | **done**    | Hard harness (epic 06)                                                                      |
| Switch                    | `common-switch`           | **done**    | Hard harness (epic 06); static `pass`/`fail`/`default` ports                                |
| Memory Tools              | `common-memory-tools`     | **done**    | ADR-033 — markdown tools under `.langflower/memory/`                                        |
| Embed text                | `common-embed-text`       | **done**    | Epic 42 — Settings default + compact preview; raw texts (no e5)                             |
| Embed similarity          | `common-embed-similarity` | **done**    | Epic 42 — cosine; no provider panel                                                         |
| Embed provider            | `common-embed-provider`   | **done**    | Epic 42 — `embed-handle` / `EmbedHandle` for pack consumers                                 |
| Tool collection           | `common-tool-collection`  | **done**    | Optional hub: combine `tools` → one `ToolHandle[]` (last-wins; ADR-035)                     |
| Fetch URL                 | `common-fetch-url`        | **done**    | Epic 12 — SSRF-guarded GET + HTML→text                                                      |
| Extract Links             | `common-extract-links`    | **done**    | Epic 12 — HTML → absolute links                                                             |
| Save Page                 | `common-save-page`        | **done**    | Epic 12 — persist under `.langflower/crawl/{runId}/`                                        |
| Crawl                     | `common-crawl`            | **done**    | Epic 12 — BFS depth/page caps + save                                                        |

### Not in catalog (often overstated as done elsewhere)

| Area                               | Types / path                                                                           | Status                                               | Track                                                                                                                          |
| ---------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Agent palette types                | `common-agent-*`                                                                       | **planned** (roles = LLM presets)                    | [EPICS](DONE/EPICS/README.md) 01/04                                                                                            |
| Text beyond Concat / file I/O      | Template, one-shot Split, …                                                            | **stub** / **planned**                               | node-library §7 — `common-split-paced` shipped; `common-split` (`parts[]`) still planned                                       |
| JSON helpers                       | Parse, Stringify, Set Fields                                                           | **stub** / **planned**                               | node-library §7                                                                                                                |
| Harness FS/shell nodes             | list/glob/grep/edit/bash as palette nodes                                              | **planned**                                          | Read/Write/Append File ship as Text via `ctx.files` (not harness ask)                                                          |
| Tool-loop + builtins               | invoke `read`…`bash` via `@langflower/tools`                                           | **done**                                             | epic 01                                                                                                                        |
| Project memory (markdown tools)    | `common-memory-tools` → `.langflower/memory/`                                          | **done**                                             | [ADR-033](ADR.md#adr-033--markdown-memory-tools-no-embedding-as-base); skeleton `kb-create` / `kb-navigate`                    |
| hello-embed sample pack            | skeleton `nodes/hello-embed` + `kb-ingest` / `kb-manual-search` / `kb-tool` / `kb-rag` | **done**                                             | markdown → sqlite (vectors + FTS5); hybrid RRF retrieve; pack tsconfig must allow `.ts` imports (`allowImportingTsExtensions`) |
| Vector KB pipeline / curation      | former `common-kb-*`                                                                   | **removed**                                          | superseded by ADR-033                                                                                                          |
| Obsidian vault helpers             | frontmatter / wikilinks / MOC                                                          | **deferred**                                         | [TBD-007](TBD.md#tbd-007--obsidian-vault-helpers)                                                                              |
| Crawl research nodes               | fetch/extract/crawl/save                                                               | **done**                                             | epic 12                                                                                                                        |
| Runtime `permission.ask` ladder    | feed Allow/Deny for **builtins** in tool loop                                          | **done**                                             | epic 02; wired packs/MCP skip ask (ADR-033)                                                                                    |
| Tools package + permission adapter | `@langflower/tools`, `server/src/harness/`                                             | **done**                                             | epics 01 / 02                                                                                                                  |
| MCP client / inventory map         | `@langflower/tools` mcp/, LLM `tools` port                                             | **done** (fixture/scripted); **live model unproven** | epic 16 / 41 stage 1; [TESTING live checklist](TESTING.md#live-openai-compatible--mcp-tool-calling-gap)                        |

## Out of scope (deferred)

Sandboxed user-node execution, Electron/Tauri — tracked as long-horizon
goals in [TBD.md](TBD.md) (not the near-term epic queue).

When extending stubs, keep existing file paths — do not create parallel implementations.
