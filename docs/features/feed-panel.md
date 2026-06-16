# Feed panel

## Goal

Give the operator one sidebar surface to **watch and steer** a workflow run.
Graph telemetry is **mirrored as chat** so the default experience feels like a
common agent chat; raw port detail stays optional. User scenarios that
validate this feature: [grok-feed](../use-cases/grok-feed.md). Run-control
interruption (Stop / Pause / Steer):
[run-interruption](../use-cases/run-interruption.md).

**Partial today:** settled turns project as user + result bubbles plus muted
last-port technical one-liners; live **draft/tool segments** (epic 34) and
composer shell layout (epic 35) are shipped. Do not treat Fake unit density
alone as live-provider Implementable proof
([grok-feed](../use-cases/grok-feed.md)).

## Core Principles

- **Chat mirror of the graph** — the feed is not a separate scary telemetry
  console. It presents graph activity in chat form for simplicity; expand
  reveals the underlying port events when needed
  ([grok-feed](../use-cases/grok-feed.md) S1–S2).
- **Important vs technical** — conversation stays primary; technical rows are
  muted and demoted (see **Layers** below).
- **Don’t overcrowd** — demote technical chrome first; do not paper over a dump
  with more collapse heuristics on bright cards.
- **Feed ↔ canvas highlight** — hover/focus in the feed highlights the matching
  canvas node and vice versa; keep for large workflows
  ([grok-feed](../use-cases/grok-feed.md) S4).
- **One timeline** — reconnect snapshot + live `runner.*` events fold into one
  chronological feed.
- **Feed is the control surface** once a chat-style run is underway — composer
  Start / Stop / Pause / Steer / HITL (see [hitl-chat.md](hitl-chat.md),
  [workflow-execution.md](workflow-execution.md),
  [run-interruption](../use-cases/run-interruption.md)).
- **Composer layout matches agent-chat parity** — see **Composer layout** below
  (visual SSOT: [`docs/palette.html`](../palette.html) §8).
- **Partial re-runs keep relevant history** — only re-executed nodes replace
  their feed entries.
- **Inspector is separate** — selecting a node swaps the sidebar to
  [inspector.md](inspector.md); deselect returns to the feed.

## Layers

| Layer                        | Contents                                                                                                                                          | Visual                                                                                       | Default                                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Important (conversation)** | Chat Input user turns; agent **final / result** (inside the same-node container when the node also has technical peek); short permission-ask cues | Bright chat bubbles / primary text; Chat Input on the **opposite side** from the agent       | Conversation turns always; permission cue only while pending; remove only on server `runner.permission.accepted` |
| **Technical**                | `reasoning`, `draft`, `tool`, `shell`, **MCP**, unmarked ports, Inputs dumps; **HITL gate replies nested under that node**                        | One **node container** (single hover highlight) holds peek + nested replies + result bubbles | Peek = last port (4-line while active, one line settled, left-aligned); expand for Inputs/history                |

Authors mark roles via `feed.role`. The UI must demote technical roles and
must not promote unmarked intermediate ports to conversation cards.

### Collapsed technical block

- Default: **`<details>` closed** — no Inputs dump (can be large).
- Layout: **node label** on its own line, then peek, then `details` summary.
- Peek: while the last port is **active**, a fixed **4-line** pane (`h-[4lh]`)
  pinned to the bottom via CSS; when **settled**, collapse to **one** ellipsis
  line (`truncate` — no leftover 4-line empty height).
- Disclose `details` → Inputs + full port history; collapse hides Inputs again.

### Growing port streams (event-sourced fold)

The work log consumes nested `NodeFeedItem → PortEvent → PortStreamItem`
streams. The feed fold is **append-only**: each live frame updates the existing
projection in place (`appendFeedFrame` + per-port `foldPortStream`). **Never
recompute the entire fold from full history on a new token.** Snapshots and
catalog changes may rebuild once by replaying that same append fold. Template:
`@for (item of port.stream | async; track item.seq)`.

See [`packages/ui/src/app/features/feed-folding/README.md`](../../packages/ui/src/app/features/feed-folding/README.md).

- **Live `reasoning`** — collapsed 2-line peek (`h-[2lh]`, `overflow: hidden`,
  content bottom-aligned so only the last two lines show).
- **Live `draft`** — one markdown bubble with `streaming…` chrome.
- **Settled stream** — one-line CSS ellipsis summary; full text under `<details>`.
- **Tool request/response** — one item per supplied `interactionId`;
  without that identity, ordinary technical `tool` data (no adjacency pairing).
- **`result` / user / permission / recovery / error** — keep individual
  semantic rows.

### Streaming technical roles (`reasoning`, `draft`, `tool` / `shell`, MCP, `recovery`)

These are **technical**, not conversation. Default peek behaviour:

| Phase                            | Behaviour                                                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **While working** (no final yet) | Peek shows the **last** active port body in the 4-line pane (pinned bottom); `<details>` stays closed — Inputs hidden                |
| **When section settles**         | Peek collapses to **one** CSS-truncated line (drop `h-[4lh]`); details keep the full concatenated stream text                        |
| **When final / result lands**    | Same-node draft / streaming peek is **hidden**; result bubble stays in the node container; technical history remains under `details` |
| **After the turn**               | Stay collapsed (details closed); conversation shows the agent **result** bubble                                                      |
| **On demand**                    | Operator opens details → Inputs + full port history                                                                                  |
| **Manual re-open**               | If the operator expands details, keep open until they collapse                                                                       |
| **Reconnect**                    | Finished turns stay chat-dense (details closed); in-flight turn still peeks last stream in the 4-line pane                           |

**Active LLM liveness** (observation only — does not Pause/Steer by itself):

- Footer of an **active** technical node container shows a muted phase line
  (`waiting for first token` / `reasoning` / `drafting` / `running tool` /
  `recovery`).
- After **10s** with no `output-emitted` for that node, append
  `· last event Ns ago`. Silence alone never opens HITL.

**Recovery notices** (`feed.role: 'recovery'`): always-visible amber banner
inside the node container (`Retrying…` or `Paused for Steer`) — not buried
under Tool `<details>`. A **suspended** notice opens the Steer composer (same
fold as Pause); retry notices do not.

**Draft + tool/subagent interrupt sequence** (palette §7; shipped in feed
projection — epic 34):

1. Live **draft** = left-side bubble; render markdown ASAP; show `draft` +
   `streaming…` chrome while open.
2. When a **tool / subagent** starts: close the current draft segment (stop
   streaming on that bubble), insert a **borderless** collapsed tool/subagent
   log (`<details>` closed by default), then open a **new** draft bubble for
   continued markdown.
3. When the turn completes: drop `draft` / `streaming…` chrome — the bubble
   becomes plain result/content (no draft meta row).

Rules:

1. Stream **in place** — no new card per chunk (except the intentional
   closed-draft → tool log → new-draft segment breaks above).
2. Final / result is the only agent content that stays in the **important**
   layer by default.
3. `feed.role: 'none'` is omitted from the feed entirely; unmarked plumbing is
   muted technical `data` labeled by **receiving `portId`** (never a generic
   “Data” summary alone).

### HITL / user turns

- Chat Input start → **standalone** user-side bubble (conversation primary).
- Review Gate replies → **nested inside** that node's
  technical block (not a separate timeline card).
- HITL node chrome (`hitlLayout`): title, details, and reply bubble align to the
  **right** (bubble corner toward top-right). Agent / LLM containers stay
  **left** (result bubble corner toward top-left under the title).
- HITL cards **never** peek the previous answer body — only title,
  optional `waiting…`, nested user reply for **this** gate visit, and `details`
  (full history stays inside details). Replies bind to the gate **section
  id** present at submit time — prior replies on the same nodeId are not
  repeated on a later visit.
- **Reconnect:** HITL replies are rebuilt from `executionFeed` `input-received`
  events only after workflow + palette defs are available. If live bubbles
  vanish on tab reload, see [REACTIVITY.md](../REACTIVITY.md) § False-ready
  context and [FOUND_BUGS.md](../FOUND_BUGS.md) BUG-2026-07-21b.
- Composer remains the control surface; timeline shows the turn.
- User / HITL bubbles use dark-theme-friendly surfaces (zinc-800, not inverted
  white-on-dark).

### Node peek vs user bubble

- Settled technical peek (ordinary node output) is **left-aligned** muted text.
- User / HITL replies stay **right-aligned** bubbles — visual separation from
  node output.

### Feed ↔ canvas highlight

- Hover/focus feed group or HITL tab → highlight canvas node (`NodeHoverService`).
- Hover canvas node → highlight related feed row / composer tab.
- Applies to important bubbles **and** muted technical one-liners.
- Highlight is chrome only — **background tint + row padding**, no border /
  outline. Work-log shell uses tighter horizontal padding (`px-2`) than
  inspector/settings (`p-4`) so row padding does not push content farther from
  the panel edge.

### Anti-patterns (rejected)

| Situation                                               | Problem                                    |
| ------------------------------------------------------- | ------------------------------------------ |
| Every `output-emitted` as a bright bordered card        | Technical competes with chat               |
| Reasoning / draft / tools / MCP as primary bubbles      | Violates technical classification          |
| Full technical history always listed                    | Scroll wall; last **port event** is enough |
| Drop feed ↔ canvas hover                                | Loses orientation in big graphs            |
| Treating the feed as a raw telemetry console by default | Scary; chat mirror is the product          |

## Feature Details

**Default view — work log:** no node selected → chronological feed (important

- muted technical). Selected node → [inspector](inspector.md).

**Chat surface:** once a conversation is underway
([workflow-execution.md](workflow-execution.md)), the feed hosts Start / Stop /
Pause / Steer / HITL reply CTAs, and Clear in the work-log header when idle.
See [hitl-chat.md](hitl-chat.md) and
[run-interruption](../use-cases/run-interruption.md).

**Composer layout (agent-chat parity):**

Visual SSOT: [`docs/palette.html`](../palette.html) §8. Surface = one
**full-bleed** textarea (no inner horizontal bands). Destination of text =
the pressed CTA — **no** Goal / Message / Feedback field labels.

Two overlays when needed: **chrome** (tab strip only, absolute top) and
**footer** (actions absolute bottom over the textarea — not a reserved band
below). Run controls never live in chrome.

**Tab strip:**

- **2+** awaiting HITL gates → tab strip (one tab per node title).
- **0–1** gate → **no** tab strip and **no** title-only chrome row.

**Footer** (one line; shared control height / pill pad — see
[THEMES.md](../../packages/ui/docs/THEMES.md)):

- Text CTAs = pills (`rounded-full`); round icon buttons match that height.
- Tooltips via `lf-hover-tip` (not bare OS `title`).

| State                         | Chrome                        | Footer                                                                                         | Forbidden                                                                                                  |
| ----------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Idle Chat Input (`chatEntry`) | None (single entry)           | **Start** (emerald play) on the right                                                          | Idle **Run** in chrome; field labels; label **Send** on Chat Input                                         |
| Mid-run HITL (1 gate)         | None                          | Reply CTAs (right) + run controls per row below                                                | Title-only chrome; field labels                                                                            |
| Mid-run HITL (2+ gates)       | Tab strip only                | Same as 1-gate for the active tab                                                              | Title chrome without tabs                                                                                  |
| Run active, no HITL           | None                          | Centered `working . . .`; **Stop** (rose) **left**; **Pause** (amber) **right**                | Single amber Stop in a shared Start/Stop primary slot; Stop as full-width Run                              |
| Soft-paused (`steerControl`)  | HITL tab strip if 2+ awaiting | HITL composer: textarea + **Send** (`config.hitl` on `steerControl`); **Stop** still available | Fake Pause via cancel; inventing checkpoint Continue; treating `{ kind: 'pause' }` as a closing HITL reply |
| Idle, no HITL, not running    | —                             | Plain text **Run** / **Run from node** (non-chat clusters only)                                | Using that plain Run to start a Chat Input cluster                                                         |

Icon / run-control rules:

- **Start** — emerald play; empty draft inert + tip “Type a message to start”;
  ready tip “Start the chat run”.
- **Stop** — **error · rose** round stop; hard cancel; tip
  `Stop — cancel run` (top-left on the left control). See
  [run-interruption](../use-cases/run-interruption.md) S1 / S4.
- **Pause** — **warning · amber** round; soft interrupt; tip
  `Pause — soft interrupt` (top-right). When the pausable last-feed agent has
  had no output for **10s**, tip softens to `API quiet — Pause to nudge`
  (observation only — does not auto-pause). Per-node `{ kind: 'pause' }` on
  `steerControl` for the **last feed section**'s working agent
  ([ADR-032](../ADR.md#adr-032--soft-pause-via-hidden-steercontrol-hitl-port)).
  Other working agents keep running; Pause again when another agent becomes
  last in feed. **Shipped** (DONE epic 36).
- **After Pause** — HITL composer unlocks (textarea + **Send**); tabs when 2+
  paused agents / gates (sequential Pause, not one-click fan-out). Send →
  `{ kind: 'steer', text }`. Stop still
  hard-cancels.
- **Reply vocabulary** — Review Gate keeps text labels (`Send`,
  `Send feedback`, Approve, …). Do not reuse Start for mid-run replies.
- Chat-control footer stays mounted for the whole run — even after Chat Input
  clears on cold-start — so Stop/Pause do not jump into the plain full-width
  Run branch.
- Base scenarios (`basic-coder` smoke; `coding-agent` Value demo),
  [grok-feed](../use-cases/grok-feed.md) S1 / S3 / S5, and
  [run-interruption](../use-cases/run-interruption.md) must pass this checklist;
  Stop/Pause/Steer chrome shipped (DONE epic 36); composer shell layout
  shipped (DONE epic 35).

**Reconnect / reload:** restore feed history in one shot, then append live
events — density must match [grok-feed](../use-cases/grok-feed.md) S6 (not a
richer dump than live).

**Partial re-runs:** upstream entries stay; only re-executed nodes clear and
replay.

## Implementation Details

- Right sidebar shell / work log vs inspector mode:
  [packages/ui/docs/DIAGRAM_CANVAS.md](../../packages/ui/docs/DIAGRAM_CANVAS.md)
  § Right sidebar; inspector feature: [inspector.md](inspector.md).
- Deterministic **append-only** projection:
  [`features/feed-folding/README.md`](../../packages/ui/src/app/features/feed-folding/README.md)
  — live frames fold into `FeedProjection` (never full-history remap per token);
  `execution-feed.service.ts` owns the production source;
  `lf-work-log-panel.component.ts` renders with nested `async` pipes. Port
  `state: 'error'` values remain feed data, not thrown stream errors.
- Feed ↔ canvas highlight: `packages/ui/src/app/services/node-hover.service.ts`.
- Shared control tooltips: `packages/ui/src/app/components/lf-hover-tip.component.ts`
  ([THEMES.md](../../packages/ui/docs/THEMES.md) § Buttons and tooltips).
- HITL composer: `lf-composer-shell.component.ts` (stage + footer),
  `lf-hitl-textarea.component.ts`, `lf-hitl-actions.component.ts`,
  `run-button.component.ts` / `pause-button.component.ts`. Protocol:
  [EXECUTION_ARCHITECTURE.md](../EXECUTION_ARCHITECTURE.md)
  § LLM + human-in-the-loop ("Work log chat (interactive HITL)").
- Activity / streaming model: [REACTIVE_NODES.md](../REACTIVE_NODES.md)
  § Activity and working state.
- Chat vs review-and-revise: [hitl-chat.md](hitl-chat.md).
- Run start / one-run rule: [workflow-execution.md](workflow-execution.md).
- Reconnect snapshot then live events:
  [ARCHITECTURE.md](../ARCHITECTURE.md) § State sync: snapshot vs event-sourcing.
- Scenario validation: [grok-feed](../use-cases/grok-feed.md),
  [run-interruption](../use-cases/run-interruption.md).
- Stop / Pause product chrome: [ADR-031](../ADR.md#adr-031--stop-hard-cancel-vs-pause-soft-interrupt-vs-steer).
- Soft Pause mechanism: [ADR-032](../ADR.md#adr-032--soft-pause-via-hidden-steercontrol-hitl-port).
- Visual normalize target: [`docs/palette.html`](../palette.html) §7–8.
