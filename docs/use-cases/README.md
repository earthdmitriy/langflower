# Use cases

End-to-end **product scenarios** for Langflower — what a person is trying to
accomplish, how the workflow graph looks (when applicable), and whether it can
run today. These are not feature specs or ADRs.

**Product purpose / goal:** [PRODUCT.md](../PRODUCT.md). **North star:**
[coding-agent](coding-agent.md) — **Implementable** only for the **full**
multi-loop pipeline (basic Plan→Coder is smoke/CI, not the claim).

For capability reference (nodes, HITL, execution), start at
[docs/features/](../features/README.md). Completed capability epics:
[docs/DONE/EPICS/](../DONE/EPICS/README.md).

## Doc structure

Every file in this folder follows the same order. **Customer value is the
source of truth**; lower layers only serve it.

1. **Value** — what the client gets / feels (mood included); one clause for
   what this is _not_
2. **UX scenarios** — `S1…Sn` as Who / Want / Do / Expect (projection of Value;
   the acceptance bar)
3. **UI specs** — table of [`docs/features/`](../features/) docs × scenario
   ids (do not re-spec UI here)
4. **Runtime requirements** — minimal server/runtime needs tied to scenarios
   (≤6 rows). Acid test: if we never build it, which Expect dies? Prefer UI
   projection of existing events over new server surface — otherwise runtime
   becomes an unsupported monster
5. **Workflow shape** _(optional)_ — mermaid / wiring when the graph _is_ the
   value; omit for non-graph UCs
6. **Status** — `Implementable` | `Partial` | `Draft` | `Blocked`, with
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
   `bash`) via `ExecutionContext.harness` (epic 01).
3. **Runtime `permission.ask`** — Allow/Deny in feed/composer (epic 02).
4. **LLM Review** — `common-review` port-routed `accept`/`feedback` (epic 03).
5. **Role tool profiles** — Plan/Coder/Explorer presets (epic 04).
6. **Partial pilots** — demo workflows + CI fake paths (epic 05).
7. **Swarm primitives** — `common-loop` / `common-sub-agent` interim
   map-collect (epic 07). Sub-Agent **registration+spawn** is target
   ([ADR-021](../ADR.md#adr-021--sub-agent-registration--port-routed-spawn-nodeid-filter)).

Also landed (not wave-1 prerequisites, but available): hard harness (06),
Memory + KB + Obsidian helpers + crawl (10–12), eval gate (09), multi-gate
HITL (composer tabs; epic 15 persona layer removed — see hitl-chat),
node-local MCP ([node-local-mcp](node-local-mcp.md)) — **Partial** (connect
failure UX open).
Checkpoints (14+20) are **Partial** — explicit boundaries + picker; auto path
off.
Feed chat mirror ([grok-feed](grok-feed.md) scenarios →
[feed-panel](../features/feed-panel.md)) is **Partial** (epic 17) — chat-dense
projection + HITL user bubbles; live-provider mood optional for Implementable.
Detachable long run / CLI completion line
([detachable-long-run](detachable-long-run.md)) is **Partial** (epic 19) —
session survives browser close; reconnect chrome/gate + CLI settle lines
landed.

Still open for product Status: coding-agent **real-LLM** Expects (demo + Fake
CI landed — epic 21; smoke stays `basic-coder`), bootstrap gaps per UC Missing
parts, Sub-Agent beyond L0 spawn, and other per-use-case Missing parts.

### Status layers

| Layer                        | Meaning                                                                |
| ---------------------------- | ---------------------------------------------------------------------- |
| **Authorable**               | Graph can be assembled in the editor from existing nodes               |
| **Mock-testable**            | Chain can be exercised with mock LLM in integration tests              |
| **Implementable (end-user)** | User runs the scenario with a real LLM + registered tools — Status bar |

## Status summary

Active implementation queue for Status gaps:
[docs/TODO/EPICS/](../TODO/EPICS/README.md) (**45** queued — global KV secrets).
Further gaps = use-case Missing parts (esp. real-LLM Implementable bars).

| Status        | Scenarios                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Implementable | _(none today)_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Partial       | [bootstrap-new-project](bootstrap-new-project.md), [prompt-refining](prompt-refining.md), [article-writing](article-writing.md), [coding-agent](coding-agent.md), [plan-refine-code-review-qa](plan-refine-code-review-qa.md), [adversarial-red-team](adversarial-red-team.md), [agent-swarm](agent-swarm.md), [research-fanout-merge](research-fanout-merge.md), [eval-regression-gate](eval-regression-gate.md), [skill-refining](skill-refining.md), [grok-feed](grok-feed.md), [settings-panel](settings-panel.md), [detachable-long-run](detachable-long-run.md), [resumable-checkpoint-jobs](resumable-checkpoint-jobs.md), [permission-escalation-ops](permission-escalation-ops.md), [router-edge-hub](router-edge-hub.md), [node-local-mcp](node-local-mcp.md), [run-interruption](run-interruption.md) |
| Draft         | [skeleton](skeleton.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Blocked       | _(none today)_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

## Index

### Product entry

| Doc                                                  | Focus                                                                                                                                   |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| [bootstrap-new-project.md](bootstrap-new-project.md) | Empty / unconfigured folder → `.langflower` + coding seed + provider setup                                                              |
| [skeleton.md](skeleton.md)                           | Packaged `dist/skeleton/` + minimal first seed; extras via Sample workflows catalog (**Draft**)                                         |
| [settings-panel.md](settings-panel.md)               | Configure providers/models/keys in UI — project + global; gear replaces right panel (**Partial** — epic 18; KV secrets landed, epic 45) |

### Core scenarios

| Doc                                                            | Focus                                                                                                                                              |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| [coding-agent.md](coding-agent.md)                             | Multi-loop coding pipeline (full = target); smoke = `basic-coder` (Plan⇄HITL→Coder⇄HITL→Finish)                                                    |
| [skill-refining.md](skill-refining.md)                         | Iterate a skill/instruction `.md` against fixtures                                                                                                 |
| [article-writing.md](article-writing.md)                       | Topic → draft file → tone/fact HITL → revise (research = extend later)                                                                             |
| [agent-swarm.md](agent-swarm.md)                               | L0 Sub-Agent spawn on canvas (Main→Explorer); fan-out → research-fanout-merge                                                                      |
| [plan-refine-code-review-qa.md](plan-refine-code-review-qa.md) | Plan → assert → refine → implement → review → QA                                                                                                   |
| [skill-refining.md](skill-refining.md)                         | Refine a skill file with eval + harness                                                                                                            |
| ~~[project-kb.md](project-kb.md)~~                             | **Superseded** by markdown memory ([ADR-033](../ADR.md#adr-033--markdown-memory-tools-no-embedding-as-base)); skeleton `kb-create` / `kb-navigate` |
| ~~[obsidian-kb.md](obsidian-kb.md)~~                           | **Deferred** — [TBD-007](../TBD.md#tbd-007--obsidian-vault-helpers)                                                                                |
| [prompt-refining.md](prompt-refining.md)                       | Draft → QA → improve loop; output is a text prompt file                                                                                            |

### Canvas / graph organisation

| Doc                                      | Focus                                                           |
| ---------------------------------------- | --------------------------------------------------------------- |
| [router-edge-hub.md](router-edge-hub.md) | Router as edge hub: short wires in complex graphs (**Partial**) |

### Gaps vs common chat harnesses

| Doc                                                              | Focus                                                                                                |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| [eval-regression-gate.md](eval-regression-gate.md)               | Golden / fixture suite with scoring and stop-on-regression                                           |
| [research-fanout-merge.md](research-fanout-merge.md)             | Loop map-collect → synth + conflict Review (**Partial** — epic 22; S4 deferred)                      |
| [permission-escalation-ops.md](permission-escalation-ops.md)     | Staged explore → write → bash (**Partial** — epic 24; real-LLM open)                                 |
| [adversarial-red-team.md](adversarial-red-team.md)               | Two conflict models: agree-then-Review vs Review-each-round (**Partial**)                            |
| ~~[kb-contradiction-curation.md](kb-contradiction-curation.md)~~ | **Removed** with vector KB (ADR-033)                                                                 |
| [resumable-checkpoint-jobs.md](resumable-checkpoint-jobs.md)     | Explicit checkpoint boundaries + picker resume (**Partial** — epic 20)                               |
| [grok-feed.md](grok-feed.md)                                     | User scenarios validating chat-mirrored graph feed (**Partial** — epic 17)                           |
| [run-interruption.md](run-interruption.md)                       | Hard Stop vs soft Pause (`steerControl`, ADR-032) (**Partial** — DONE 34–36; real-LLM bars open)     |
| [detachable-long-run.md](detachable-long-run.md)                 | Close browser mid-run (process stays up); reopen live/settled; CLI settle (**Partial** — epic 19)    |
| [node-local-mcp.md](node-local-mcp.md)                           | Wire + system MCP handles; S5/S6 connect fail; HTTP auth headers; graph inspect/invoke (**Partial**) |

## Candidates (backlog)

Not written yet: Socratic teaching coach, incident triage playbook, localization
pipeline.

Long-horizon platform goals (sandbox, desktop shell, multi-tenant, true
Loop concurrency) are **not** use-case candidates — see [TBD.md](../TBD.md).
