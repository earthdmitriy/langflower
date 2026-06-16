# TODO — active plans

Queued implementation plans. **Completed** plans live under
[`docs/DONE/`](../DONE/README.md).

| Area                            | Location                                                |
| ------------------------------- | ------------------------------------------------------- |
| **Active epic 37**              | [TODO/EPICS](EPICS/README.md)                           |
| Epics 00–36 (landed / archived) | [DONE/EPICS](../DONE/EPICS/README.md)                   |
| LLM phases 1–6 (landed)         | [DONE/LLM-NODES](../DONE/LLM-NODES/llm-nodes-README.md) |
| Canvas UI (landed)              | [DONE/UI](../DONE/UI/README.md)                         |

## Rules

1. One epic = one file under [`EPICS/`](EPICS/README.md).
2. Flip use-case Status (Partial → Implementable, Draft → Partial, …) only
   after epic acceptance criteria are green and
   `node build/tools/agent-run.mjs verify` (or the epic’s stated gate) passes.
3. When an epic lands, **move** its file to [`DONE/EPICS/`](../DONE/EPICS/README.md)
   and update both indexes — do not leave a parallel copy in TODO.

Product Status source of truth: [use-cases/README.md](../use-cases/README.md).

Long-horizon goals (not near-term epics): [TBD.md](../TBD.md) — do not queue
TBD items here until the horizon shortens.
