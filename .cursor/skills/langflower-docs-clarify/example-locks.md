# Example: clarification → locks → docs

Illustrative outcome of a multi-round session (not a second source of truth —
prefer live `docs/PRODUCT.md` / ADRs).

## Round themes (order that worked)

1. Product identity (vs OpenCode / Langflow) + primary user
2. Roadmap frame (drop Stages → use-case Status)
3. Bootstrap intent (seed coding workflow; folder picker deferred)
4. Implementable bar (full coding-agent only)
5. Sub-Agent ports / spawn / result (English)
6. Layers: swarm concurrency, nested, Monte Carlo; cross-model pending

## Sample lock table

| Topic                      | Decision                                                                 |
| -------------------------- | ------------------------------------------------------------------------ |
| Product                    | Local coding agent on a visual graph; hard harness; easy bootstrap       |
| Primary user               | Developer on their repo; multi-LLM/KB later                              |
| Roadmap                    | Partial → Implementable use cases; no Stage 1/2/3 planning               |
| Coding-agent Implementable | Full multi-loop only; basic Plan→Coder = smoke                           |
| Demo naming                | `basic-coder.json` = smoke (done); new `coding-agent.json` = full (todo) |
| Folder picker              | Deferred TODO                                                            |
| Sub-Agent L0               | Registration + spawn out + `nodeId` filter; result ≠ feedback            |
| Swarm concurrency          | Default serial (local LLM HW); parallel-by-nodeId low priority           |
| Nested                     | Recursive registration ports; workflow file far future                   |
| Monte Carlo                | Same-model via Loop; cross-model ensemble **pending** in ADR             |

## Doc targets used

- `docs/PRODUCT.md`
- `docs/ADR.md` — ADR-021 (spawn), ADR-022 (layers + pending)
- `docs/DONE/EPICS/MECHANICS-tool-execution.md`
- `docs/use-cases/coding-agent.md`, `bootstrap-new-project.md`
- `packages/common-nodes/src/ai/sub-agent/NODE.md`
