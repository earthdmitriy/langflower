# TBD — long-term goals

Horizon for goals that need **complex implementation** or **hard tradeoffs**
and are **not** near-term work. This file exists to keep that horizon visible
without pretending the decision or the epic is ready.

**Why not [architecture/ADR.md](architecture/ADR.md):** an ADR records a **chosen** architecture (or a
proposed choice with alternatives). TBD items are still open — tradeoffs are
known enough to list the goal, not settled enough to decide. When a TBD matures
into a real decision, **migrate** it into an ADR (and remove or mark it here).

**Why a separate file (not TODO / use-cases):**
[TODO/](TODO/README.md) and [use-cases/](use-cases/README.md) drive what we can
ship soon (epics, Status gaps). Putting long-horizon items there implies they
are next in queue. TBD deliberately signals: **do not plan an epic against this
until the horizon shortens.**

| Doc                                        | Owns                                                 |
| ------------------------------------------ | ---------------------------------------------------- |
| **TBD** (this file)                        | Distant goals + known hard tradeoffs; not scheduled  |
| [architecture/ADR.md](architecture/ADR.md) | Decided (or proposed) architecture with alternatives |
| [TODO/](TODO/README.md)                    | Near-term implementation plans / epics               |
| [use-cases/](use-cases/README.md)          | Customer scenarios + Status bar                      |
| [FOUND_BUGS.md](FOUND_BUGS.md)             | Reproduced bugs / design flaw signals                |

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

### TBD-002 — Embedded canvas desktop shell

**Horizon:** far · **Area:** platform

**Goal:** Embed the Angular editor in a native webview shell (optional
install path that does **not** use the system browser). This is **not**
the thin launcher. The launcher goal was a small supervisor window;
that already shipped as Slint ([ADR-038](architecture/ADR.md#adr-038--launcher-is-a-cli-supervisor);
[epic 46](DONE/EPICS/46-launcher.md)).

**Why hard:** Packaging, updates, OS permissions, WebView2/LTSC, and
whether the product stays “tool in the user’s repo” vs becoming an app —
packaging choice locks distribution and security assumptions. **Tauri
was already tried** for the supervisor window and rejected (WebView
dependency, large executable). Do not treat Tauri as the intended path
for either the launcher or this TBD.

**Not yet:** Explicit product decision that an embedded-canvas shell is
worth the cost (then a new ADR — pick a toolkit then, do not default to
Tauri).

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
(serial Loop honesty) · [ADR-022](architecture/ADR.md#adr-022--sub-agent-layers-swarm-nested-monte-carlo)

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
browser in the daily agent loop vs [ADR-024](architecture/ADR.md#adr-024--dev-mcp-control-plane-over-internal-ws-bus)
MCP observe/run.

**Not yet:** Layer-1 MCP (`@langflower/mcp`) proven in daily agent use; a clear
list of UI questions the bus cannot answer; accepted cost of browser automation
in the agent loop. Prefer `langflower start` single-port mode when this matures.

**Related:** [TESTING.md](TESTING.md) (browser E2E deferred) ·
[ADR-024](architecture/ADR.md#adr-024--dev-mcp-control-plane-over-internal-ws-bus) ·
[DIAGRAM_CANVAS.md](../packages/ui/docs/DIAGRAM_CANVAS.md)

### TBD-007 — Obsidian vault helpers

**Horizon:** multi-quarter · **Area:** nodes / memory / vault tooling

**Goal:** First-class Obsidian-oriented helpers (frontmatter, wikilink rewrite,
MOC build) and optional vault `allowedRoots` workflows — as a **separate**
feature, not part of base markdown memory under `.langflower/memory/`.

**Why hard:** Vault paths outside the project fence; rename/backlink integrity
under frequent edits; product boundary vs plain Markdown memory tools
([ADR-033](architecture/ADR.md#adr-033--markdown-memory-tools-no-embedding-as-base)); former
epic-11 helpers were coupled to the removed vector KB story.

**Not yet:** Settled UX for vault vs managed memory; whether wikilinks need an
index; schedule relative to memory tools maturity.

**Related:** [ADR-033](architecture/ADR.md#adr-033--markdown-memory-tools-no-embedding-as-base) ·
former DONE epic 11 · [ADR-014](architecture/ADR.md#adr-014--project-root-harness-io)
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

**Related:** [ADR-015](architecture/ADR.md#adr-015--output-driven-run-completion-never-idle-settle) ·
[ADR-032](architecture/ADR.md#adr-032--soft-pause-via-hidden-steercontrol-hitl-port) ·
[architecture/REACTIVITY.md](architecture/REACTIVITY.md). LLM loops avoid killing their cycle for
recoverable provider failures
([LLM_RECOVERY.md](LLM_RECOVERY.md)), but that does not define general graph
recovery.

### TBD-009 — Embedding sample / catalog rerank

**Horizon:** far · **Area:** product / nodes

**Goal:** Second-stage rank after hello-embed (or a catalog node): retrieve a
larger pool, keep top-N for the generation prompt.

**Why hard:** Three incompatible shapes — (1) lexical boost (cheap, not a
cross-encoder), (2) LLM-as-judge needs **chat** on the retrieve path (pack must
not see `apiKey`; host bind or extra graph LLM), (3) dedicated cross-encoder is
a new Settings model, not `embeddings.create`. Unsettled whether rerank belongs
in the skeleton pack vs catalog.

**Not yet:** Pick one shape and whether the sample RAG loop still needs rerank
once hybrid retrieve and full-chunk packing ship.

**Related:** [EMBEDDING.md](EMBEDDING.md) · skeleton
`nodes/hello-embed/lib/search.ts`

### TBD-010 — OS-backed / encrypted secret storage

**Horizon:** far · **Area:** platform / security

**Goal:** Persist Langflower secrets so the same OS user cannot read them from
a plaintext file (Windows Credential Manager, macOS Keychain, libsecret /
DPAPI, or an encrypted vault with a wrapping key).

**Why hard:** Per-OS APIs, headless/CI (no keychain prompt), backup/migrate
across machines, and a changed threat model vs “hide from the git repo.”
Workspace-hidden plaintext in the user-global dir is enough for the near-term
product bar ([epic 45](DONE/EPICS/45-global-kv-secrets.md)).

**Not yet:** Threat model beyond “not in the project folder”; whether CI must
keep `{env:VAR}` as the only headless path; accepted OS API set.

**Related:** [epic 45](DONE/EPICS/45-global-kv-secrets.md) ·
[ADR-002 amend](architecture/ADR.md#adr-002--langflower-project-local-storage-opencode-style)
(global file outside the project tree) · [CONFIG.md](CONFIG.md) § Environment
placeholders

### TBD-011 — Live editing of a running workflow

**Horizon:** multi-quarter · **Area:** runtime / product / UI

**Goal:** Edit the canvas while a run is `running` (including soft Pause):
add/remove nodes and edges, rewire compatible ports, move/resize/label.
New nodes and edges join the **active run** when they enter that weakly
connected component. Deleting a running node tears down **that instance
only**. Completed nodes do not auto-refire. Checkpoints of the current run
become stale immediately. Agent `tools` / `ToolHandle` changes apply on the
**next tool-loop iteration** without resetting the ADR-016 session (do not
emit a new value on the LLM `tools` input mid-turn).

**Why hard:** `RuntimeEditor` locks on start; `RuntimeRunner.wireScope`
snapshots edges once. Unlocking `addEdge` without incremental demand-wire
is a lie. LLM `context$` `switchMap` resets conversation history if
`tools`/`userPrompt`/`ctx` emit. `getLiveWiredTools` peeks live wires, but
`createAgentGetTools` still unions a frozen `combineInputs` snapshot, so
disconnect would not drop handles. New nodes need a mid-run ctx seed or MCP
never connects; isolated `addNode` must not spawn orphan processes. One
run graph-wide forbids auto-starting a second cluster. Combine/zip/merge
groups and `@rx-evo` merge-of-`raw$` (BUG-2026-07-15c) make adopt/drop
non-trivial. UI run-lock chrome and [wiring-helper](TODO/wiring-helper.md)
assume the freeze. Epic 40 already covers **hot-swap of existing** tools
wires (`swapNode` + peek) — not new topology.

**Not yet:** A research spike that proves `adoptEdge` / `dropEdge` into
`activeRun` without `teardownRun` or a second `start`, with `getTools()`
reflecting connect **and** disconnect on the next iteration and **no**
ADR-016 reset. If that fails, park this TBD. If only inventory hot-plug
works, a later epic must stay **narrow** (tools edges + producers), not
full canvas unlock. Do **not** queue a numbered TODO epic until the spike
is green. Near-term product work stays use-case Missing parts.

**Related:** [architecture/EXECUTION_ARCHITECTURE.md](architecture/EXECUTION_ARCHITECTURE.md) ·
[REACTIVE_NODES.md](REACTIVE_NODES.md) § HITL and graph lock ·
[ADR-016](architecture/ADR.md) · [FOUND_BUGS.md](FOUND_BUGS.md) BUG-2026-08-16 ·
[epic 40](DONE/EPICS/40-custom-node-recompile-reload.md) ·
[workflow-execution.md](features/workflow-execution.md) ·
[visual-workflow-editor.md](features/visual-workflow-editor.md) ·
[resumable-checkpoint-jobs.md](use-cases/resumable-checkpoint-jobs.md) S6

### TBD-012 — Pack-visible host `chat` / `embed`

**Horizon:** unresolved product tradeoff · **Area:** product / packs / providers

**Goal:** Decide whether a custom pack node may call the **host-bound**
chat-completion and embedding factories (operator Settings / `provider.*`
credentials) via a declared capability such as `requires: ['chat']` or
`['embed']`. Today it cannot: `RunHostServices` is a module-local `Symbol()`
in `@langflower/common-nodes`, so a pack (`@langflower/node-sdk` only) sees
identity, params, `resolveSecret`, and wired ports. Packs already spend
credits the **graph** way — wire `common-embed-provider` / an LLM node and
call an `EmbedHandle` or talk through ports — not by invoking the host
binding from pack `bind()`.

**Why hard:** This is a new public surface, not a refactor of epic 48 A–C.
Yes means a pack node can spend the operator's provider credits without a
visible LLM / embed node on the canvas; keys stay unreadable (callable
only), but there is no per-capability quota, metering, or sandbox
([TBD-001](#tbd-001--sandboxed-user-node-execution)). It also widens the
author ctx that
[EXTENSION_POINT](architecture/EXTENSION_POINT.md) currently keeps as
identity + params + `resolveSecret`. No means packs stay on ports /
`ToolHandle` / `EmbedHandle`, and `requires` stays built-ins-only.

**Not yet:** An explicit product lock (yes / no). Do **not** start epic 48
slice D, relocate `CreateChatCompletionStream` / `CreateEmbedding` into
`@langflower/node-sdk`, or amend ADR-030 for pack-callable host bindings
until that lock. If yes: types in the SDK, compiler reject of host-internal
ids (`editorBus`, `liveTools`, `authorize`, `paths`, `hosts`), docs that
keys are never readable. If no: close the slice; A–C still land.

**Related:** [epic 48](TODO/EPICS/48-declared-node-capabilities.md) ·
[ADR-030](architecture/ADR.md#adr-030--custom-node-pack-layout--npm-model) ·
[EXTENSION_POINT](architecture/EXTENSION_POINT.md) § Stable for pack authors ·
[EMBEDDING.md](EMBEDDING.md) (UC2 pack path via `EmbedHandle`) ·
[TBD-001](#tbd-001--sandboxed-user-node-execution)

---

## Promoted (left for trace)

| Former       | Became | When |
| ------------ | ------ | ---- |
| _(none yet)_ |        |      |

When promoting: add a row, remove the Open section entry (or strike through
with a one-line pointer).
