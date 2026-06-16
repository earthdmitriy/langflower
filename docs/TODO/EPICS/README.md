# Epics — use-case readiness queue (active)

**Active** under [`docs/TODO/`](../README.md). Epics **00–36** are archived in
[`docs/DONE/EPICS/`](../../DONE/EPICS/README.md) once landed.

Further product work also comes from
[`docs/code-regression/`](../../code-regression/SUMMARY.md) (orchestrator may
mint numbered epics from Critical findings).

Do **not** re-open epic 15.

## Status today

| Layer                       | State                                                                    |
| --------------------------- | ------------------------------------------------------------------------ |
| Agent runtime (epics 00–25) | Archived in DONE                                                         |
| Code-regression epics       | **26–28 landed** — next from [SUMMARY](../../code-regression/SUMMARY.md) |
| Custom-nodes SDK            | **29–33 landed** (defineNode → rename → contract → compiler → bootstrap) |
| Feed / interrupt / composer | **34–36 landed** (feed segments, composer shell, Stop/Pause/Steer)       |
| Deterministic feed fold     | **37 queued** — abstraction only; UI switch is a follow-up               |
| Use-cases                   | None Implementable — [use-cases](../../use-cases/README.md)              |

## Order

| #   | File                                                           | Status                                                 |
| --- | -------------------------------------------------------------- | ------------------------------------------------------ |
| 37  | [37-deterministic-feed-fold.md](37-deterministic-feed-fold.md) | Queued — TDD `feed-folding` feature; **no** UI wire-up |

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
- Switch live work-log to `feed-folding` — follow-up after epic 37 lands
  (see epic Out of scope / [feed-refactor.md](../feed-refactor.md)).
