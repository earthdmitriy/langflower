---
kind: use-case
owner: docs
covers: []
status: current
---

# Agent swarm

**Status:** Available. Handover, fan-out, and fan-in run on a graph
drawn before Start. A topology the run grows or rewires by itself is not a
current promise.

## Value

Feel orchestration as **graph topology**: Main wires Explorer Sub-Agent
`tools` into Main `tools` and **invokes** the specialist (ADR-021). The
Sub-Agent is an ordinary agent with its own provider/model/role — then Main
resumes. Handover is that pass. Fan-out and fan-in are a drawn split and a
merge back. A topology the run builds itself is not a current promise.

## UX scenarios

### S1 — Start the Agent swarm demo

**Who:** Developer with a brief that needs a repo scout before a follow-up pass.

**Want:** Spawn an Explorer specialist from the graph — not one agent pretending
to be a team in a single thread.

**Do:** Configure a real LLM (e.g. LM Studio / `openai` in
`.langflower/langflower.jsonc`), start the demo project, load workflow
**Agent swarm** (`agent-swarm`), and **Run**.

**Expect:**

- Run MUST exercise Brief → Main → Sub-Agent Explorer → Preview (not a
  single-node self-role-switch turn).
- In the [feed](../features/feed-panel.md), Main and Explorer MUST appear as
  **distinct node-labeled** activity. Main’s invoke / resume turns and Explorer’s
  scout turn MUST both be attributable without reading raw node ids.
- [Workflow execution](../features/workflow-execution.md) MUST show Main vs
  Explorer activity on the canvas for the same run.

### S2 — Main MUST call Explorer on one `tools` wire

**Who:** Same developer watching the first specialist call.

**Want:** Specialist topology on the canvas (one inventory edge) — not an
off-screen manager.

**Do:** Let Main call the Explorer specialist tool; observe Explorer
`subagent-registration` → Main `tools`.

**Expect:**

- Sub-Agent MUST be a `common-sub-agent` node with `subagent-registration`
  wired into Main `tools` (ADR-021).
- Main MUST invoke Explorer as a tool — MUST NOT complete the scout as
  in-LLM-only role-play with no Sub-Agent node.
- Explorer `invoke` MUST resume Main as a normal tool result.

### S3 — Explorer runs under its own chat config

**Who:** Same developer during the specialist pass.

**Want:** The scout is a distinct agent node with its own role / provider /
model — not Main restating an “Explorer:” persona in one prompt, and not a
separate body LLM behind hub ports.

**Do:** Let Explorer accept `invoke({ task })`, run in-node chat, return a
string to Main.

**Expect:**

- Explorer MUST be `common-sub-agent` with its own Inspector chat config
  (`rolePreset: explorer` in the demo; CI may use `scriptedToolTurns`).
- MUST NOT require `item` / `bodyResult` body-handoff edges.
- In the feed, Explorer rows MUST stay labeled as the Sub-Agent node (not
  attributed to Main).

### S4 — Main answers after the Sub-Agent result

**Who:** Same developer after Explorer returns.

**Want:** Main uses the Sub-Agent result, then finishes into Preview.

**Do:** Wait for Main `response` → Preview `text`.

**Expect:**

- After the Explorer tool result, Main MUST emit a final `response` into Preview.
- Preview MUST show Main’s final answer (`Swarm done`).
- Feed MUST show Main’s post-spawn answer as Main activity — not as a
  continuation of the Explorer block.

### S5 — Re-run the same spawn topology

**Who:** Developer repeating the pass on the same project.

**Want:** The same Sub-Agent spawn path is re-runnable — not a one-off chat
prompt.

**Do:** Re-run **Agent swarm**.

**Expect:**

- Re-running MUST exercise the same Brief → Main → Sub-Agent → Preview
  structure again, including a real spawn (MUST spawn again — not skip to a
  cached single-thread answer).

## UI specs

| Spec                                                    | Scenarios covered                                                                                                                                                                                                                              |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Feed panel](../features/feed-panel.md)                 | [S1](#s1--start-the-agent-swarm-demo), [S2](#s2--main-must-call-explorer-on-one-tools-wire), [S3](#s3--explorer-runs-under-its-own-chat-config), [S4](#s4--main-answers-after-the-sub-agent-result), [S5](#s5--re-run-the-same-spawn-topology) |
| [Workflow execution](../features/workflow-execution.md) | [S1](#s1--start-the-agent-swarm-demo), [S2](#s2--main-must-call-explorer-on-one-tools-wire), [S3](#s3--explorer-runs-under-its-own-chat-config), [S5](#s5--re-run-the-same-spawn-topology)                                                     |

## Runtime requirements

| Need                                                                  | Why (scenario)                                                                                             | Today                    |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------ |
| `common-sub-agent` `subagent-registration` → parent `tools` (ADR-021) | On-canvas specialist ([S2](#s2--main-must-call-explorer-on-one-tools-wire))                                | Landed (epic 41 stage 2) |
| Sub-Agent in-node chat + own role/provider/model                      | Distinct specialist ([S3](#s3--explorer-runs-under-its-own-chat-config))                                   | Landed                   |
| Main + Sub-Agent chat configs                                         | End-user spawn ([S1](#s1--start-the-agent-swarm-demo), [S4](#s4--main-answers-after-the-sub-agent-result)) | Landed                   |

## Workflow shape

Matches `demo-project/.langflower/workflows/agent-swarm.json`:

```mermaid
flowchart LR
  Brief[Brief]
  Main[MainLLM]
  Sub[SubAgent]
  Fin[Preview]

  Brief --> Main
  Sub -->|subagent-registration| Main
  Main --> Fin
```

Fan-out and fan-in on nodes that are already on the canvas are Available
([research-fanout-merge](research-fanout-merge.md), static Docs / Risks /
Alternatives). A specialist set that appears during the run is not a
current promise.

## Status

**Available.** Handover, fan-out, and fan-in run on nodes drawn before
Start. Dynamic swarm topology is not a current promise.

- **Handover** — Available. One agent passes a task to the next
  specialist and continues from the result. Sub-Agent `subagent-registration`
  → parent `tools`, and a stage edge between nodes drawn ahead of time, are
  that pattern.
- **Fan-out and fan-in** — Available. A drawn split to several branches
  and a merge back into one result. Static fan-out and Loop map-collect are
  that pattern. Branch quality is the user's graph and prompts.
- **Dynamic swarm topology** — not a current promise. The run does not add,
  remove, or rewire specialists that are not already nodes on the canvas.
  Draw those nodes before Start.

### Missing parts

None.

### Workarounds

None. Draw the handover, fan-out, and fan-in edges before Start.
