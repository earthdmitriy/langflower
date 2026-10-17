---
kind: adr
owner: docs
covers: []
status: current
id: ADR-022
supersedes: []
superseded-by: []
package: docs
---

## ADR-022 — Sub-Agent layers: swarm, nested, Monte Carlo

**Status:** accepted (partial) · **Date:** 2026-07-20 · **Depends on:**
[ADR-021](./021-sub-agent-registration-port-routed-spawn-nodeid-filter.md)

**Context:** After locking registration + port-routed spawn (ADR-021), we need a
clear extension ladder for **agent swarm**, **nested subagents**, and
**Monte Carlo–style** repeated trials — without a second spawn system or
hidden in-LLM managers. Local LLM hardware is often the bottleneck, so default
parallelism must stay conservative.

**Alternatives considered:**

- **Parallel-by-default swarm** — better for cloud multi-key setups; wastes
  little on a single local GPU/CPU where N streams share one bottleneck.
- **Nested workflow files for nesting** — true isolation; far future (ADR-021).
- **Cross-model bake-off as N Sub-Agents** — same task, own provider/model each
  (locked below); not Loop Monte Carlo.
- **Separate spawn runtime for Monte Carlo** — duplicates Loop; rejected.

**Decision (locked):**

| Layer  | Name                     | Rule                                                                                                                                                            |
| ------ | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **L0** | ADR-021                  | Canvas Sub-Agent + one `tools` `ToolHandle`; `invoke` runs in-node loop; skills enum on the handle; serial per node                                             |
| **L1** | Swarm                    | Multiple Sub-Agent nodes → one parent `tools` combine. Default invoke concurrency: **serial**. Opt-in **`parallel-by-nodeId`** later, **low priority** (cloud). |
| **L2** | Nested                   | Child Sub-Agent OUT `subagent-registration` → parent Sub-Agent IN `tools`. Nesting is call ownership on a **flat** canvas, not a subgraph file. Depth cap TBD.  |
| **L3** | Monte Carlo (same model) | Prefer **Loop** + trial envelope (`trialId` / `seed` in payload) + reduce/score on the graph. Same specialist template; dynamic N without cloning nodes.        |
| **L∞** | Nested workflow file     | Far future (unchanged).                                                                                                                                         |

**Implementation order (guidance):** L0 → L1 (`serial` only first) → L3 trial
fields on Loop path → L2 depth enforcement → L∞.

**Cross-model bake-off (locked)**

**Status:** accepted · **Date:** 2026-07-23

**Decision:** run the **same task** on **separate models/providers** by placing
**N Sub-Agent nodes** on the canvas — each with its own `providerId` / `model` /
`contextSize` / compaction. Parent registers all of them and spawns as needed.
Do **not** invent a second topology (`Loop.items` of `{ provider, model }`) for
model compare; Loop remains the same-model Monte Carlo (L3) path.

**Pending decision — cross-model ensemble**

**Status:** superseded by bake-off lock above (kept for history of open questions).

**Intent (was parked):** run the **same task** on **separate models/providers**
(bake-off / ensemble), not only N× same-model seed trials.

**Former open questions (resolved by N Sub-Agents):**

- Variation axis: models only vs trials × models matrix.
- Topology: `Loop.items` of `{ provider, model }` vs one Sub-Agent/LLM node per
  model on the canvas vs hybrid.
- Who sets the model set / N: author-only vs orchestrator tool vs both with caps.

Classic same-model Monte Carlo via Loop (L3) remains the planned repeated-trial
path.

**Tradeoffs accepted:**

- (+) One spawn contract scales to swarm/nested/MC without new mythologies.
- (+) Serial default matches local LLM reality; cloud parallel stays optional.
- (−) True parallel swarm waits for opt-in + `callId`.
- (−) Bake-off is author-wired N Sub-Agents (no auto ensemble reduce yet).

**Consequences:**

- MECHANICS (`docs/_archive/DONE/EPICS/MECHANICS-tool-execution.md#sub-agent-layers-swarm-nested-monte-carlo`)
  mirrors this ladder.
- [PRODUCT.md](../product/PRODUCT.md) summarizes layers + bake-off.
- Revisit ensemble **reduce/score** UX when a concrete use case needs automatic
  cross-model merge (topology stays N Sub-Agents).

---
