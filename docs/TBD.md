# TBD — long-term goals

Horizon for goals that need **complex implementation** or **hard tradeoffs**
and are **not** near-term work. This file exists to keep that horizon visible
without pretending the decision or the epic is ready.

**Why not [ADR.md](ADR.md):** an ADR records a **chosen** architecture (or a
proposed choice with alternatives). TBD items are still open — tradeoffs are
known enough to list the goal, not settled enough to decide. When a TBD matures
into a real decision, **migrate** it into an ADR (and remove or mark it here).

**Why a separate file (not TODO / use-cases):**
[TODO/](TODO/README.md) and [use-cases/](use-cases/README.md) drive what we can
ship soon (epics, Status gaps). Putting long-horizon items there implies they
are next in queue. TBD deliberately signals: **do not plan an epic against this
until the horizon shortens.**

| Doc                               | Owns                                                 |
| --------------------------------- | ---------------------------------------------------- |
| **TBD** (this file)               | Distant goals + known hard tradeoffs; not scheduled  |
| [ADR.md](ADR.md)                  | Decided (or proposed) architecture with alternatives |
| [TODO/](TODO/README.md)           | Near-term implementation plans / epics               |
| [use-cases/](use-cases/README.md) | Customer scenarios + Status bar                      |
| [FOUND_BUGS.md](FOUND_BUGS.md)    | Reproduced bugs / design flaw signals                |

## Rules

1. **Do not** treat TBD entries as the active roadmap. Agents: prefer
   use-case Missing parts and TODO epics for “what next.”
2. **Do** add an entry when a desirable goal is clearly out of near-term
   reach (multi-quarter, platform change, or unresolved product tradeoff).
3. **Migrate to ADR** when alternatives are weighed and a direction is
   chosen (even `proposed`). Link the new ADR from the TBD entry, then
   delete the entry or move it under **Promoted**.
4. **Promote to TODO / use-case** only when the work becomes schedulable —
   then drop it from TBD so the horizon stays honest.
5. Keep entries short. No fake Done checklists. Soft language is OK on
   horizon; MUST NOT invent shipped behaviour.

## Entry template

```markdown
### TBD-NNN — <short title>

**Horizon:** far / multi-quarter · **Area:** product | runtime | UI | platform

**Goal:** …

**Why hard:** … (complexity and/or tradeoffs)

**Not yet:** … (what would need to be true before ADR or epic)

**Related:** links to PRODUCT / use-cases / ADR drafts if any
```

---

## Open

### TBD-001 — Sandboxed user-node execution

**Horizon:** far · **Area:** runtime / platform

**Goal:** Run user-authored custom nodes in a sandbox so a bad or hostile
node cannot freely touch the host beyond declared policy.

**Why hard:** Isolation model (process vs VM vs WASM), tool/harness
surface through the sandbox, debugging UX, and performance vs safety
tradeoffs — all product-level, not a thin epic.

**Not yet:** Clear threat model + accepted isolation approach (then ADR).

**Related:** [PRODUCT.md](PRODUCT.md) Non-goals · [STATUS.md](STATUS.md)
Out of scope

### TBD-002 — Electron / Tauri desktop shell

**Horizon:** far · **Area:** platform

**Goal:** Ship a native desktop shell around the existing CLI/server/UI
stack (optional install path beyond `langflower start`).

**Why hard:** Packaging, updates, OS permissions, and whether the product
stays “tool in the user’s repo” vs becoming an app — packaging choice
locks distribution and security assumptions.

**Not yet:** Explicit product decision that a desktop shell is worth the
cost (then ADR for shell + process model).

**Related:** [PRODUCT.md](PRODUCT.md) Non-goals · [STATUS.md](STATUS.md)
Out of scope

### TBD-003 — Hosted multi-tenant cloud product

**Horizon:** far · **Area:** product / platform

**Goal:** Multi-tenant hosted Langflower (accounts, remote runs, shared
projects) rather than local CLI + project folder only.

**Why hard:** Tenancy, secrets, billing, and a different trust boundary
from “runs on the user’s machine against their repo.” Would reshape
ARCHITECTURE and many ADRs.

**Not yet:** Product commitment beyond local-first tooling.

**Related:** [PRODUCT.md](PRODUCT.md) Non-goals

### TBD-004 — True concurrent Loop / swarm wall-clock parallelism

**Horizon:** multi-quarter · **Area:** runtime

**Goal:** Parallel branch execution (wall-clock) for Loop / swarm-style
fan-out instead of serial map-collect.

**Why hard:** Run isolation, shared harness/permissions, partial re-run
semantics, and UI activity model all assume clearer “one active work”
boundaries today; concurrency is a runtime redesign, not a flag.

**Not yet:** Settled concurrency model + which use-cases require it
beyond fixed parallel nodes.

**Related:** [research-fanout-merge](use-cases/research-fanout-merge.md)
(serial Loop honesty) · [ADR-022](ADR.md#adr-022--sub-agent-layers-swarm-nested-monte-carlo)

### TBD-005 — UI extension (node-authored Angular views)

**Horizon:** far · **Area:** UI / product

**Goal:** A node author can ship Angular components with the node that the
editor mounts on the **canvas** (node body) and/or in the **inspector**
(selected-node panel) — beyond today’s declarative `inline` / port UI
primitives.

**Why hard:** Loading and versioning third-party (or project-local) Angular
into the host SPA; trust boundary vs [TBD-001](#tbd-001--sandboxed-user-node-execution)
(hostile UI can exfiltrate as easily as hostile runtime); lifecycle /
change-detection coupling to ngDiagram; API surface for params/ports/run
state without glue adapters; and whether custom UI is first-class for
common-nodes, custom nodes, or both.

**Not yet:** Accepted extension contract (how components are discovered,
bundled, and sandboxed or trusted) + product rule for what must stay
declarative vs full components (then ADR).

**Related:** [inspector](features/inspector.md) ·
[visual-workflow-editor](features/visual-workflow-editor.md) ·
[TBD-001](#tbd-001--sandboxed-user-node-execution) · custom nodes under
`.langflower/nodes/`

### TBD-006 — Headless UI access for agents

**Horizon:** multi-quarter · **Area:** UI / platform / agent tooling

**Goal:** Give coding agents Playwright (or equivalent) against a running
Langflower instance — real DOM reads, screenshots (especially ngDiagram
canvas), and optional click/type for visual bugs the WS bus cannot show.

**Why hard:** Canvas hit-testing and flake vs deterministic WS control; two-port
dev (`4200` + `4010`) vs single-port `langflower start`; no deep-link routes to
workflows; agent lifecycle must start/stop browser + server cleanly; cost of
browser in the daily agent loop vs [ADR-024](ADR.md#adr-024--dev-mcp-control-plane-over-internal-ws-bus)
MCP observe/run.

**Not yet:** Layer-1 MCP (`@langflower/mcp`) proven in daily agent use; a clear
list of UI questions the bus cannot answer; accepted cost of browser automation
in the agent loop. Prefer `langflower start` single-port mode when this matures.

**Related:** [TESTING.md](TESTING.md) (browser E2E deferred) ·
[ADR-024](ADR.md#adr-024--dev-mcp-control-plane-over-internal-ws-bus) ·
[DIAGRAM_CANVAS.md](../packages/ui/docs/DIAGRAM_CANVAS.md)

### TBD-007 — Obsidian vault helpers

**Horizon:** multi-quarter · **Area:** nodes / memory / vault tooling

**Goal:** First-class Obsidian-oriented helpers (frontmatter, wikilink rewrite,
MOC build) and optional vault `allowedRoots` workflows — as a **separate**
feature, not part of base markdown memory under `.langflower/memory/`.

**Why hard:** Vault paths outside the project fence; rename/backlink integrity
under frequent edits; product boundary vs plain Markdown memory tools
([ADR-033](ADR.md#adr-033--markdown-memory-tools-no-embedding-as-base)); former
epic-11 helpers were coupled to the removed vector KB story.

**Not yet:** Settled UX for vault vs managed memory; whether wikilinks need an
index; schedule relative to memory tools maturity.

**Related:** [ADR-033](ADR.md#adr-033--markdown-memory-tools-no-embedding-as-base) ·
former DONE epic 11 · [ADR-014](ADR.md#adr-014--project-root-harness-io)
`allowedRoots`

### TBD-008 — Node-local reactive recovery

**Horizon:** multi-quarter · **Area:** runtime / bus / reactive execution

**Goal:** Reload or re-subscribe only a failed node's StatefulObservable cycle
without restarting completed upstream nodes or propagating a retry through the
entire downstream chain.

**Why hard:** A node error currently enters the real reactive error lane and
may make dependent ports terminal. A graph-wide retry is not equivalent to
recovering one node: it can repeat side effects, invalidate Sub-Agent call
correlation, and reopen completed HITL work. Recovery also needs authoritative
multi-tab facts rather than a client-local retry button.

**Not yet:** The isolation contract (node, port, or cycle scope); which values
are retained across recovery; how finished siblings and downstream demand are
protected; whether recovery is a runner intent, a StatefulObservable reload,
or a new runtime primitive.

**Related:** [ADR-015](ADR.md#adr-015--output-driven-run-completion-never-idle-settle) ·
[ADR-032](ADR.md#adr-032--soft-pause-via-hidden-steercontrol-hitl-port) ·
[REACTIVITY.md](REACTIVITY.md). LLM loops avoid killing their cycle for
recoverable provider failures, but that does not define general graph recovery.

---

## Promoted (left for trace)

| Former       | Became | When |
| ------------ | ------ | ---- |
| _(none yet)_ |        |      |

When promoting: add a row, remove the Open section entry (or strike through
with a one-line pointer).
