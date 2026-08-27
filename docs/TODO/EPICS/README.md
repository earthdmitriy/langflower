# Epics — use-case readiness queue (active)

**Active** under [`docs/TODO/`](../README.md). Epics **00–43** are
archived in [`docs/DONE/EPICS/`](../../DONE/EPICS/README.md) once landed.
This queue is empty of numbered epics.

Further product work also comes from
[`docs/code-regression/`](../../code-regression/SUMMARY.md) (orchestrator may
mint numbered epics from Critical findings).

Do **not** re-open epic 15.

## Status today

| Layer                       | State                                                                                           |
| --------------------------- | ----------------------------------------------------------------------------------------------- |
| Agent runtime (epics 00–25) | Archived in DONE                                                                                |
| Code-regression epics       | **26–28 landed** — next from [SUMMARY](../../code-regression/SUMMARY.md)                        |
| Custom-nodes SDK            | **29–33, 40 landed** (defineNode → compiler → bootstrap → reload)                               |
| Feed / interrupt / composer | **34–36 landed** (feed segments, composer shell, Stop/Pause/Steer)                              |
| Deterministic feed fold     | **37 landed** — abstraction only; UI switch is a follow-up                                      |
| LLM autokick / dead-loop    | **38 landed** — default autokick + HTTP join + pinned feed banner                               |
| common-nodes `ai/` layout   | **39 landed** — `ai/nodes/` vs `ai/features/`                                                   |
| Embedding providers         | **42 landed** — Settings default + `EmbedHandle` catalog (not `common-kb-*` / not `ToolHandle`) |
| Custom node reload          | **40 landed** — [hot-swap + compile tool](../../DONE/EPICS/40-custom-node-recompile-reload.md)  |
| Uniform tool shape          | **41 landed** — MCP + Sub-Agent + optional Tool collection as `ToolHandle[]`                    |
| Use-cases                   | None Implementable — [use-cases](../../use-cases/README.md)                                     |
| Feed sanity                 | **43 landed** — UI hides unmarked / `'none'`; Finish `done`; Preview bubble + stable size       |

## Order

| #   | File                                                                          | Status                                                                    |
| --- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 39  | [39-ai-package-restructure.md](../../DONE/EPICS/39-ai-package-restructure.md) | Landed — `ai/nodes/` + `ai/features/` named slices                        |
| 42  | [42-embedding-providers.md](../../DONE/EPICS/42-embedding-providers.md)       | Landed — Settings embedding default + `EmbedHandle` wire                  |
| 43  | [43-feed-sanity.md](../../DONE/EPICS/43-feed-sanity.md)                       | Landed — hide unmarked ports; Finish `done`; Preview bubble + stable size |

Next: code-regression Critical findings and remaining use-case Missing parts.

Roadmap context: palette normalize `docs/palette.html` §7–8. Remaining
skeleton work: packaged `dist/skeleton` layout (S1) and Sample workflows
catalog UI (S3–S4).

## Out of this queue

- Sub-Agent L1+ / nested swarm — later epic when a UC Missing part demands it.
- Persona identity — **removed** (DONE/15).
- Real-LLM Implementable bars — per-use-case Missing parts
  ([TESTING.md live gap](../../TESTING.md#live-openai-compatible--mcp-tool-calling-gap)).
- TBD-001 custom-node sandbox; Sample workflows catalog UI (skeleton S3–S4);
  auto `npm install` from server.
- Auto-place / auto-wire a newly compiled custom type onto the canvas mid-run
  (epic 40 landed; idle topology only).
- Switch live work-log to `feed-folding` — follow-up after epic 37
  (see [37 Out of scope](../../DONE/EPICS/37-deterministic-feed-fold.md) /
  [feed-refactor.md](../feed-refactor.md)).
