---
kind: index
owner: docs
covers: []
status: current
---

# Epics — use-case readiness queue (active)

**Active** under [`docs/_work/TODO/`](../README.md). Epics **00–51** are
archived in [`docs/_archive/DONE/EPICS/`](../../../_archive/DONE/EPICS/README.md).
The numbered queue is empty. A file in this folder with no `NN-` prefix
is **unscheduled**. It stays in this folder until a number is assigned
and it is added to Order.
Unscheduled: [External harness CLI](external-harness-cli.md),
[Eval kit](eval-kit.md). Epic 51 (multimodal) landed — see
[DONE](../../../_archive/DONE/EPICS/51-multimodal.md).
A file belongs here only when it meets
[Epic or task](../README.md#epic-or-task): a new mechanism, package
boundary, or protocol. One behavior on a shipped mechanism is a
[task](../TASKS/README.md).

Further product work also comes from
`docs/_archive/code-regression/SUMMARY.md`. A Critical finding becomes a
numbered epic only when it is a new slice. A one-behavior finding becomes
a task.

Do **not** re-open epic 15.

## Status today

| Layer                       | State                                                                                                            |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Agent runtime (epics 00–25) | Archived in DONE                                                                                                 |
| Code-regression epics       | **26–28 landed** — next from SUMMARY (`docs/_archive/code-regression/SUMMARY.md`)                                |
| Custom-nodes SDK            | **29–33, 40 landed** (defineNode → compiler → bootstrap → reload)                                                |
| Feed / interrupt / composer | **34–36 landed** (feed segments, composer shell, Stop/Pause/Steer)                                               |
| Deterministic feed fold     | **37 landed** — live work-log is `ExecutionFeedService` / `feedRows$`                                            |
| LLM autokick / dead-loop    | **38 landed** — default autokick + HTTP join + pinned feed banner                                                |
| common-nodes `ai/` layout   | **39 landed** — `ai/nodes/` vs `ai/features/`                                                                    |
| Embedding providers         | **42 landed** — Settings default + `EmbedHandle` catalog (not `common-kb-*` / not `ToolHandle`)                  |
| Custom node reload          | **40 landed** — hot-swap + compile tool (`docs/_archive/DONE/EPICS/40-custom-node-recompile-reload.md`)          |
| Uniform tool shape          | **41 landed** — MCP + Sub-Agent + optional Tool collection as `ToolHandle[]`                                     |
| Use-cases                   | See [use-cases](../../../product/use-cases/README.md) — TODO-able gaps vs do-not-file                            |
| Feed sanity                 | **43 landed** — UI hides unmarked / `'none'`; Finish `done`; Preview bubble + stable size                        |
| CLI / compiler startup      | **44 landed** — heartbeat, cache, product bundle (`docs/_archive/DONE/EPICS/44-startup-optimization.md`)         |
| Global KV secrets           | **45 landed** — workspace-hidden secrets + MCP HTTP headers (`docs/_archive/DONE/EPICS/45-global-kv-secrets.md`) |
| Desktop launcher            | **46 landed** — Slint supervisor + CI/release (`docs/_archive/DONE/EPICS/46-launcher.md`)                        |
| Feed frame authority        | **47 landed** — self-describing frames (`docs/_archive/DONE/EPICS/47-self-describing-feed-frames.md`)            |
| Node capabilities           | **48 landed** — `docs/_archive/DONE/EPICS/48-declared-node-capabilities.md`                                      |
| Workflow sessions           | **49 landed** — sessions (`docs/_archive/DONE/EPICS/49-sessions.md`) (tabs, node state hook, points, folded log) |

## Order

| #   | File                                                                                              | Status                                                                     |
| --- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 39  | 39-ai-package-restructure.md (`docs/_archive/DONE/EPICS/39-ai-package-restructure.md`)            | Landed — `ai/nodes/` + `ai/features/` named slices                         |
| 42  | 42-embedding-providers.md (`docs/_archive/DONE/EPICS/42-embedding-providers.md`)                  | Landed — Settings embedding default + `EmbedHandle` wire                   |
| 43  | 43-feed-sanity.md (`docs/_archive/DONE/EPICS/43-feed-sanity.md`)                                  | Landed — hide unmarked ports; Finish `done`; Preview bubble + stable size  |
| 44  | 44-startup-optimization.md (`docs/_archive/DONE/EPICS/44-startup-optimization.md`)                | **Landed** — heartbeat, incremental cache, product esbuild                 |
| 45  | 45-global-kv-secrets.md (`docs/_archive/DONE/EPICS/45-global-kv-secrets.md`)                      | **Landed** — Global KV secrets + MCP HTTP `headers`                        |
| 46  | 46-launcher.md (`docs/_archive/DONE/EPICS/46-launcher.md`)                                        | **Landed** — desktop launcher shell + release pipeline                     |
| 47  | 47-self-describing-feed-frames.md (`docs/_archive/DONE/EPICS/47-self-describing-feed-frames.md`)  | **Landed** — frames carry feed meta; fold drops catalog + rebuild state    |
| 48  | 48-declared-node-capabilities.md (`docs/_archive/DONE/EPICS/48-declared-node-capabilities.md`)    | **Landed** — `requires` on definitions; ctx built per declaration          |
| 50  | [50-knowledge-base-restructure.md](../../../_archive/DONE/EPICS/50-knowledge-base-restructure.md) | **Landed** — docs taxonomy, split ADR/bugs, archive, docs-boundaries tests |

Active queue: empty. Small tails live in
[TASKS](../TASKS/README.md), not here. Pack-visible host `chat` / `embed` stays
[TBD-012](../../TBD.md#tbd-012--pack-visible-host-chat--embed). Next:
code-regression Critical findings and remaining use-case Missing parts.

Roadmap context: palette normalize `docs/assets/palette.html` §7–8. Remaining
skeleton work: packaged `dist/skeleton` layout (S1) and Sample workflows
catalog UI (S3–S4).

## Out of this queue

- Sub-Agent L1+ / nested swarm — later epic when a UC Missing part demands it.
- Persona identity — **removed** (DONE/15).
- Real-LLM Available / Ready bars — per-use-case Missing parts
  ([TESTING.md live gap](../../../guides/TESTING.md#live-openai-compatible--mcp-tool-calling)).
- TBD-001 custom-node sandbox; Sample workflows catalog UI (skeleton S3–S4);
  auto `npm install` from server.
- TBD-010 OS-backed / encrypted secret storage (epic 45 is workspace-hidden
  plaintext only).
- TBD-011 live editing of a running workflow (graph stays locked; epic 40
  is hot-swap of **existing** tools wires only). Spike before any TODO epic.
- TBD-012 pack-visible host `chat` / `embed` (epic 48 keeps `requires`
  built-ins-only).
- Node → editor reentrancy (`requestLangflowerBus`, `getLiveWiredTools`) as
  explicit intents / ports — spike first; adjacent to TBD-011. Epic 48 only
  makes that dependency **declared**, not reshaped.
- Auto-place / auto-wire a newly compiled custom type onto the canvas mid-run
  (epic 40 landed; idle topology only; folded into TBD-011).
- Lazy OpenAI / undici / per-node catalog splits (out of epic 44).
