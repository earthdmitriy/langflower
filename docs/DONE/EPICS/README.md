# Epics — use-case readiness roadmap (completed)

**Archived** under [`docs/DONE/`](../README.md). Epics **00–38** and **40** are
landed. Active queue: see [`docs/TODO/EPICS/`](../../TODO/EPICS/README.md)
(epic **39** — `ai/` layout).
Further work also follows use-case Missing parts
and [`docs/code-regression/`](../../code-regression/SUMMARY.md) Critical
findings.

LLM phases 1–6
([../LLM-NODES/llm-nodes-README.md](../LLM-NODES/llm-nodes-README.md)) are the
text-only chat foundation. These epics delivered **agent runtime** and the
building blocks that moved use-cases out of many `Blocked` states.

Historical rule (kept for reading old AC): one epic = one file; flip use-case
Status only after `verify`.

## Status today

| Layer                        | State                                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------------- |
| LLM foundation (phases 1–6)  | Done — [LLM-NODES](../LLM-NODES/llm-nodes-README.md)                                      |
| Agent runtime (epics 00–25)  | **Landed** (07 Memory deferred; MCP optional; 17–25 product)                              |
| Custom-nodes SDK (29–33, 40) | **29–33, 40 landed**                                                                      |
| Use-cases                    | Many **Partial**; none **Implementable** yet — see [use-cases](../../use-cases/README.md) |

## Order

```text
00 doc-truth
        │
        ▼
01 tool-loop-builtins          ← critical path
        │
        ├─► 02 runtime-permissions
        ├─► 03 review-node
        └─► 04 role-tool-profiles
                │
                ▼
05 partial-pilots              ← landed (first Partial use-cases)
        │
        ├─► 06 hard-harness-logic
        ├─► 07 swarm-primitives    ← landed (Loop / Sub-Agent)
        ├─► 08 adversarial-multi-llm
        └─► 09 eval-regression-gate  ← landed (fixture pack + CLI gate)
                │
                ├─► 10 kb-pipeline ──► 11 obsidian-kb
                └─► 12 crawl-research
                        │
                        ├─► 13 chat-input
                        ├─► 14 checkpoints-resume  ← draft (auto off)
                        ├─► 15 multi-role-hitl
                        └─► 16 mcp-optional
```

## Index

| #   | File                                                                                   | Wave  | Goal                                                                                          |
| --- | -------------------------------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------- |
| 00  | [00-doc-truth.md](00-doc-truth.md)                                                     | 0     | **done** — Align STATUS / node-library / AGENTS with catalog + use-cases                      |
| 01  | [01-tool-loop-builtins.md](01-tool-loop-builtins.md)                                   | 1     | **landed** — Tool-call loop + `@langflower/tools` builtins `read`…`bash`                      |
| 02  | [02-runtime-permissions.md](02-runtime-permissions.md)                                 | 1     | **landed** — ask / deny / escalate (≠ allowlist UI)                                           |
| 03  | [03-review-node.md](03-review-node.md)                                                 | 1     | **landed** — Review node (`accept` / `feedback` → ports)                                      |
| 04  | [04-role-tool-profiles.md](04-role-tool-profiles.md)                                   | 1     | **landed** — Plan/Coder/Explorer tool+permission profiles                                     |
| 05  | [05-partial-pilots.md](05-partial-pilots.md)                                           | 1     | **landed** — First Partial use-cases + demo workflows                                         |
| 06  | [06-hard-harness-logic.md](06-hard-harness-logic.md)                                   | 2     | **landed** — Assert / IF / Switch / Compare / Gate                                            |
| 07  | [07-swarm-primitives.md](07-swarm-primitives.md)                                       | 2     | **landed** — Loop / Sub-Agent (external map-collect; Memory deferred)                         |
| 08  | [08-adversarial-multi-llm.md](08-adversarial-multi-llm.md)                             | 2     | **landed** — Two real agents + durable feedback + Review/HITL accept                          |
| 09  | [09-eval-regression-gate.md](09-eval-regression-gate.md)                               | 2     | **landed** — Fixtures, scoring, stop-on-regression                                            |
| 10  | [10-kb-pipeline.md](10-kb-pipeline.md)                                                 | 3     | **landed** — Ingest / Embed / Search / List / Delete                                          |
| 11  | [11-obsidian-kb.md](11-obsidian-kb.md)                                                 | 3     | **landed** — Vault outside root, wikilinks / MOC                                              |
| 12  | [12-crawl-research.md](12-crawl-research.md)                                           | 3     | **landed** — Crawl nodes in catalog + research merge path                                     |
| 13  | [13-chat-input.md](13-chat-input.md)                                                   | 4     | **landed** — `common-chat-input` + multi-turn UX                                              |
| 14  | [14-checkpoints-resume.md](14-checkpoints-resume.md)                                   | 4     | **infra** — store/resume; product = [20](20-explicit-checkpoints.md)                          |
| 15  | [15-multi-role-hitl.md](15-multi-role-hitl.md)                                         | 4     | **removed** — persona identity layer dropped; multi-gate HITL remains                         |
| 16  | [16-mcp-optional.md](16-mcp-optional.md)                                               | 4     | **landed** — MCP client/invoke as extension only                                              |
| 17  | [17-grok-feed-chat-density.md](17-grok-feed-chat-density.md)                           | 5     | **landed** — chat-dense feed projection; grok-feed Partial                                    |
| 18  | [18-settings-panel.md](18-settings-panel.md)                                           | 5     | **landed** — gear Settings aside + global merge; settings-panel Partial                       |
| 19  | [19-detachable-long-run.md](19-detachable-long-run.md)                                 | 5     | **landed** — reconnect chrome + CLI settle; detachable Partial                                |
| 20  | [20-explicit-checkpoints.md](20-explicit-checkpoints.md)                               | 5     | **landed** — explicit checkpoint + picker; resumable-checkpoint Partial                       |
| 21  | [21-coding-agent-full-demo.md](21-coding-agent-full-demo.md)                           | 5     | **landed** — coding-agent.json + Fake CI; Partial (real-LLM open)                             |
| 22  | [22-research-fanout-synth-hitl.md](22-research-fanout-synth-hitl.md)                   | 5     | **landed** — synth + conflict Review; S4 deferred; Partial                                    |
| 23  | [23-eval-live-runcase.md](23-eval-live-runcase.md)                                     | 5     | **landed** — Fake primary runCase; replay optional; Partial                                   |
| 24  | [24-permission-escalation-demo.md](24-permission-escalation-demo.md)                   | 5     | **landed** — staged explore→write→bash demo; Partial                                          |
| 25  | [25-kb-contradiction-curation.md](25-kb-contradiction-curation.md)                     | 5     | **landed** — dedupe/contradict/apply demo; Partial                                            |
| 26  | [26-code-regression-crawl-html-barrel.md](26-code-regression-crawl-html-barrel.md)     | CR    | **landed** — remove forbidden `crawl/html` barrel                                             |
| 27  | [27-code-regression-delay-console-log.md](27-code-regression-delay-console-log.md)     | CR    | **landed** — remove Delay debug `console.log` tap                                             |
| 28  | [28-code-regression-server-index-barrel.md](28-code-regression-server-index-barrel.md) | CR    | **landed** — remove server package-root `index.ts` barrel                                     |
| 29  | [29-define-node-slim-sdk.md](29-define-node-slim-sdk.md)                               | CN    | **landed** — `defineNode` + slim SDK; base EC + `LlmExecutionCaps`                            |
| 30  | [30-rename-node-sdk.md](30-rename-node-sdk.md)                                         | CN    | **landed** — `@langflower/node-definitions` → `@langflower/node-sdk`                          |
| 31  | [31-custom-nodes-my-nodes-contract.md](31-custom-nodes-my-nodes-contract.md)           | CN    | **landed** — `my-nodes` pack layout + ADR-030 + skeleton draft                                |
| 32  | [32-langflower-compiler.md](32-langflower-compiler.md)                                 | CN    | **landed** — `@langflower/compiler` + `customPalette` bus + fail-loud `COMPILATION_ERRORS.md` |
| 33  | [33-bootstrap-skeleton-my-nodes.md](33-bootstrap-skeleton-my-nodes.md)                 | CN    | **landed** — bootstrap copies skeleton minimum (`starter` + skills + `my-nodes`)              |
| 34  | [34-feed-timeline-visual-contract.md](34-feed-timeline-visual-contract.md)             | UI    | **landed** — feed draft/tool segments + streaming chrome                                      |
| 35  | [35-composer-shell-layout-contract.md](35-composer-shell-layout-contract.md)           | UI    | **landed** — composer shell (no labels / pills / tabs-only-2+)                                |
| 36  | [36-stop-pause-steer-controls.md](36-stop-pause-steer-controls.md)                     | UI+RT | **landed** — rose Stop + amber Pause/`steerControl` (ADR-031/032)                             |
| 37  | [37-deterministic-feed-fold.md](37-deterministic-feed-fold.md)                         | UI    | **landed** — TDD `feed-folding` nested fold; live work-log switch is a follow-up              |
| 38  | [38-llm-autokick.md](38-llm-autokick.md)                                               | LLM   | **landed** — default autokick, dead-loop, HTTP join, pinned feed retry banner                 |
| 40  | [40-custom-node-recompile-reload.md](40-custom-node-recompile-reload.md)               | CN    | **landed** — stable cache, hot-swap, `compile_custom_nodes`, same-turn `getTools`             |

## Contracts

Cross-cutting product contracts (not numbered epics; do not enter the
dependency DAG):

| File                                                       | Contract                                              |
| ---------------------------------------------------------- | ----------------------------------------------------- |
| [MECHANICS-tool-execution.md](MECHANICS-tool-execution.md) | Option 3 — internal tool loop vs external graph ports |

## Product locks (do not reopen)

- One LLM node type + **role presets** — not separate `common-agent-*` palette types.
- Partial pilots / Review / skill-refining via `read` — **after** epic 01.
- MCP never substitutes for built-in default tools.
- Shell/bash: default-deny or strong UX nudge for agent instances.
- **Tool execution = Option 3** — internal loop for builtins (and MCP tools
  mapped into the same inventory); external graph ports only for control /
  topology / typed contracts (Review, `feedback` handoff, Sub-Agent / Loop).
  Normative criteria: [MECHANICS-tool-execution.md](MECHANICS-tool-execution.md).
- **Sub-Agent spawn (target)** — registration via extended `tool-registration`,
  spawn tool → dedicated main **output**, result → dedicated main **input**
  (not HITL/`feedback`) as tool result; single spawn out + `nodeId` filter;
  skills sequential per Sub-Agent node.
  [ADR-021](../../ADR.md#adr-021--sub-agent-registration--port-routed-spawn-nodeid-filter).
- **Sub-Agent layers** — swarm spawn default **serial** (local LLM); nested =
  recursive registration ports; same-model MC via Loop; cross-model ensemble
  **pending**.
  [ADR-022](../../ADR.md#adr-022--sub-agent-layers-swarm-nested-monte-carlo).
- **UX rule:** canvas shows topology and contracts; feed (+ `toolLog`) shows
  in-step world changes (`permission.ask` stays in feed, not per-call edges).
- Builtins never require per-call `toolCall` / `toolResult` canvas edges.
- **Read-class vs mutating** — non-mutating tools (`read`, `glob`, `grep`, …
  search-like) may take optional agent `postProcess: (res: string) => string`;
  mutating tools and `bash` do not. Patterns:
  [MECHANICS-tool-execution.md](MECHANICS-tool-execution.md#file-ops-patterns-normative-for-epic-01).
- No third-party harness pack as product API — **`@langflower/tools`** owns
  tool ids/schemas/handlers; server only binds `ExecutionContext.harness`.
- Domain/custom tools attach **`registration.handler`** (import configs from
  tools); no closed harness `toolId` registry ([ADR-019](../../ADR.md#adr-019--tool-handlers-on-registration-not-harness-toolid-registry)).
- Builtin tools are a **separate package** (`packages/tools`) — not grown as
  permanent bodies under `packages/server` or `@langflower/runtime`.

## Related

- [MECHANICS-tool-execution.md](MECHANICS-tool-execution.md) — internal vs external tool execution + file-ops patterns
- [docs/use-cases/README.md](../../use-cases/README.md) — Status bar + agent prerequisites
- [../LLM-NODES/llm-nodes-README.md](../LLM-NODES/llm-nodes-README.md) — phases 1–6 + phase 7 sketch
- [docs/LLM_NODES.md](../../LLM_NODES.md) — foundation semantics
- [docs/TODO/README.md](../../TODO/README.md) — active plans (empty unless new work queued)
