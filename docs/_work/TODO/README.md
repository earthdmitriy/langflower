---
kind: index
owner: docs
covers: []
status: current
---

# TODO — active plans

Queued implementation plans. **Completed** plans live under
[`docs/_archive/DONE/`](../../_archive/DONE/README.md).

| Area                    | Location                                                            |
| ----------------------- | ------------------------------------------------------------------- |
| **Active epics**        | [TODO/EPICS](EPICS/README.md) (none queued; **00–50** landed)       |
| **Tasks**               | [TODO/TASKS](TASKS/README.md) (none queued)                         |
| Epics 00–50 (landed)    | [DONE/EPICS](../../_archive/DONE/EPICS/README.md)                   |
| LLM phases 1–6 (landed) | [DONE/LLM-NODES](../../_archive/DONE/LLM-NODES/llm-nodes-README.md) |
| Canvas UI (landed)      | [DONE/UI](../../_archive/DONE/UI/README.md)                         |

## Rules

1. One epic = one file under [`EPICS/`](EPICS/README.md).
2. Flip use-case Status (Partial → Available, or Ready when the scenario
   needs no extra configuration; Draft → Partial, …) only
   after epic acceptance criteria are green and
   `node build/tools/agent-run.mjs verify` (or the epic’s stated gate) passes.
3. When an epic lands, **move** its file to [`DONE/EPICS/`](../../_archive/DONE/EPICS/README.md)
   and update both indexes — do not leave a parallel copy in TODO.
4. One task = one file under [`TASKS/`](TASKS/README.md). When it lands,
   delete the file and clear the matching use-case or STATUS row. Do not
   archive it under DONE/EPICS and do not give it a number.

## Epic or task

File the work by what it changes.

| Kind            | File it when                                                                                                                                                  | Where it lives                                                                                  | When it lands                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Epic**        | It introduces or reshapes a product layer: a new mechanism, a package boundary, or a protocol. The orchestrator runs it (context, implement, review, verify). | Numbered file in [`EPICS/`](EPICS/README.md), with Goal, In scope, Out of scope, and Acceptance | Move the file to DONE/EPICS and update both indexes. Flip use-case Status only after acceptance and the verify gate |
| **Task**        | It is one behavior on a mechanism that already ships. A Partial use-case row is a task when the missing part is that behavior                                 | One file in [`TASKS/`](TASKS/README.md). No number, no Depends on, no orchestrator pipeline     | Delete the file and clear the use-case or STATUS row                                                                |
| **Queued note** | It is a sketch that is not scheduled                                                                                                                          | A file next to this index, listed below                                                         | Promote it to a task or an epic when the work is scheduled, or delete it                                            |
| **TBD**         | There is no current promise                                                                                                                                   | [TBD.md](../TBD.md)                                                                             | A use case takes it, and the new row is then a task or an epic                                                      |

Landed epics that match the first row: workflow sessions (49), global KV
secrets (45), the Slint launcher (46), self-describing feed frames (47),
declared node capabilities (48).

Tasks that match the second row: none queued. A landed example was the
empty-provider port text, which now points at Settings.

A code-regression Critical finding follows the same test. A new slice becomes
an epic. One behavior on a shipped mechanism becomes a task.

Product Status source of truth: [use-cases/README.md](../../product/use-cases/README.md).

Long-horizon goals (not near-term epics): [TBD.md](../TBD.md) — do not queue
TBD items here until the horizon shortens.

## Queued notes

| Note                    | File                                   |
| ----------------------- | -------------------------------------- |
| Edge and port highlight | [edge-highlight.md](edge-highlight.md) |
| Wiring helper           | [wiring-helper.md](wiring-helper.md)   |
| JSON feed preview       | [json-feed.md](json-feed.md)           |
| Wait tool               | [wait-tool.md](wait-tool.md)           |
| Logo prompts            | [TBD/logo.md](TBD/logo.md)             |
| Rerank                  | [TBD/rerank.md](TBD/rerank.md)         |
