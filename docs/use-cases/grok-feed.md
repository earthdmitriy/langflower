# Grok feed

**Status:** Partial — chat-dense projection (epic 17) and hide unmarked
(epic 43) landed; Implementable bar still wants end-user proof on a live
provider path where claimed.

## Value

Operator on a graph run gets a calm, skimmable agent-chat mood — conversation
primary, technical demoted — **not** a raw telemetry console or second debug IDE.

## UX scenarios

### S1 — Chat with an agent on a graph (default)

**Who:** Developer running `basic-coder` / Chat Input → agent.

**Want:** Same feel as a normal agent chat — my message, then the agent’s
answer — not a wall of ports.

**Do:** Type a goal, Start, wait for the run to finish.

**Expect:**

- User message MUST appear on the **user side**.
- Agent **final / result** MUST be the primary agent bubble.
- **Phase density:** while a turn is in flight, opted-in technical roles
  (`reasoning` / `draft` / tools / shell / MCP) MAY stream open; when the turn
  settles, the story MUST be user + result + muted peeks for those opted-in
  ports only (no wall of bright cards). Unmarked plumbing MUST NOT appear
  even as muted one-liners.
- Technical streams MUST grow **in place** (no new card per chunk); MUST
  **auto-collapse** when final / result lands; if the operator manually
  re-opens after collapse, that expand MUST stay sticky until they collapse it.
- Unmarked / plumbing ports MUST NOT appear in the feed at all.
- Composer layout MUST match [feed-panel](../features/feed-panel.md) Composer
  layout (and [run-interruption](run-interruption.md) for Stop / Pause):
    - Idle Chat Input: **Start** (emerald) on the right (not chrome; not
      labeled Send; no field labels).
    - Run active (no HITL): centered `working . . .`; **Stop** rose left;
      **Pause** amber right — not a single amber Stop in a shared Start slot.
    - Mid-run reply CTAs are text pills on the right; hard Stop stays available
      per run-interruption / feed-panel (composer shell DONE epic 35).

### S2 — Peek under the hood when something looks wrong

**Who:** Same developer; answer seems wrong or the run feels stuck.

**Want:** Inspect graph telemetry for one step without leaving the chat-shaped
feed.

**Do:** Expand a muted technical row (or a collapsed reasoning / tool / MCP
block) in the feed.

**Expect:**

- Expanded block MUST show structured detail for that node / role.
- Collapsed again MUST be **one muted line** showing the **last port event**
  only (no border, no bright card).
- Conversation bubbles above/below MUST stay visually primary.

### S3 — Answer HITL and keep the thread readable

**Who:** Developer mid-run on Ask User / Review Gate.

**Want:** Replies feel like chat turns, not another node output card.

**Do:** Send / Approve / Send feedback from the composer.

**Expect:**

- Reply MUST appear as a **user-side** bubble in the timeline (not only
  Inputs / node reply sections).
- Agent continues; new technical streams MUST stay demoted under S1 phase
  density.
- Composer MUST remain the control surface; layout MUST match
  [feed-panel](../features/feed-panel.md) Composer layout:
    - Reply CTAs as text pills while a gate is open; tabs only when 2+ gates.
    - Hard **Stop** (rose) remains available for the whole run (footer mounted;
      does not jump to plain full-width Run). Soft Pause / Steer:
      [run-interruption](run-interruption.md).

### S4 — Orient in a large workflow

**Who:** Author or operator on a multi-dozen-node graph.

**Want:** Map a feed line to a canvas node without leaving the calm chat mood
or reading node ids.

**Do:** Hover a feed row (important or muted technical); hover a canvas node.

**Expect:**

- Feed ↔ canvas **highlight** MUST work both ways.
- Highlight MUST apply to muted one-liners, not only bright bubbles.
- Highlight MUST be chrome-only — MUST NOT add bright borders / cards on
  technical rows.

### S5 — Permission gate without losing the chat

**Who:** Developer when the agent hits `permission.ask` (e.g. bash / write).

**Want:** Allow/Deny without the feed turning into a log dump or bright tech
chrome.

**Do:** Allow or Deny in the composer; continue the run.

**Expect:**

- Timeline MUST show a **short cue** only; Allow/Deny MUST live in the
  composer.
- Tool / MCP detail behind the ask MUST stay technical / expandable (muted
  one-liner when collapsed).
- After the gate, conversation density MUST still pass S1 settled density.

### S6 — Reload mid-run or after finish

**Who:** Operator who refreshes the editor or reconnects.

**Want:** Same chat-shaped story, not a fuller dump than live.

**Do:** Reload while a run is active or after it completed.

**Expect:**

- Finished turns MUST restore **chat-dense** (technical collapsed to last-port
  event lines).
- An in-flight turn MAY show live technical streams open; settled turns MUST
  NOT re-expand into a wall of cards.
- Restored feed MUST NOT be richer than the live projection.

## UI specs

| Spec                                                    | Scenarios covered                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Feed panel](../features/feed-panel.md)                 | [S1](#s1--chat-with-an-agent-on-a-graph-default), [S2](#s2--peek-under-the-hood-when-something-looks-wrong), [S3](#s3--answer-hitl-and-keep-the-thread-readable), [S4](#s4--orient-in-a-large-workflow), [S5](#s5--permission-gate-without-losing-the-chat), [S6](#s6--reload-mid-run-or-after-finish) |
| [HITL chat](../features/hitl-chat.md)                   | [S3](#s3--answer-hitl-and-keep-the-thread-readable), [S5](#s5--permission-gate-without-losing-the-chat)                                                                                                                                                                                                |
| [Workflow execution](../features/workflow-execution.md) | [S1](#s1--chat-with-an-agent-on-a-graph-default), [S3](#s3--answer-hitl-and-keep-the-thread-readable), [S6](#s6--reload-mid-run-or-after-finish)                                                                                                                                                       |

## Runtime requirements

| Need                                | Why (scenario)                                                                                                                                                                                      | Today                                                           | Caution                                                                    |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `feed.role` (and unmarked ports)    | Classify reasoning / draft / tools / shell / MCP as technical; hide unmarked plumbing ([S1](#s1--chat-with-an-agent-on-a-graph-default), [S2](#s2--peek-under-the-hood-when-something-looks-wrong)) | Landed (epic 43) — missing / `'none'` omit; opted-in roles only | Unmarked intermediate ports MUST NOT appear at all (not even muted `data`) |
| HITL reply / review events          | User-side bubbles + composer control ([S3](#s3--answer-hitl-and-keep-the-thread-readable))                                                                                                          | Interactive HITL in feed/composer                               | Timeline MUST show the turn as chat, not only Inputs / node reply sections |
| `permission.ask` Allow/Deny         | Short cue + composer actions without a dump ([S5](#s5--permission-gate-without-losing-the-chat))                                                                                                    | Landed (epic 02)                                                | Composer gate ≠ chat-density contract done                                 |
| Reconnect snapshot then live append | Chat-dense restore after reload ([S6](#s6--reload-mid-run-or-after-finish))                                                                                                                         | Snapshot + live path exists                                     | Restored feed MUST NOT be richer than live                                 |

No new runtime surface — feed projects events already on the wire.

## Status

**Partial** — epic 17 landed chat-dense projection (`projectFeedTimeline`);
epic 43 hides unmarked / `'none'` ports. User/result bubbles, opted-in
technical peeks, HITL user-side turns, composer Start/Stop parity, reconnect
uses the same projection. Unit density tests green; do not treat
Fake/`basic-coder` alone as full end-user Implementable proof on a live
provider.

**Implementable when** S1–S6 Expects pass on `basic-coder` with a real
OpenAI-compatible path where quality/mood is claimed (density contract itself
is Partial-landed).

### Missing parts

| Layer          | Gap                                                                       | Scenarios        | Done when                                                                 |
| -------------- | ------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------- |
| End-user proof | Live-provider mood check on `basic-coder` (optional vs density unit bar)  | S1–S6            | Operator confirms chat mirror on a real model; Fake unit stays density CI |
| Demo honesty   | Denser multi-stage graphs (e.g. coding-agent) for long-thread readability | S1 phase density | Claim only when that demo exists                                          |

### Workarounds

For node fields and cached ports when S2 expand is insufficient, use the
[inspector](../features/inspector.md) (select a node on the canvas).

### Demo / CI

- Smoke / CI: `basic-coder` + UI unit `feed-timeline` / `feed-section` density
  tests (epic 17).
- Long multi-stage readability: denser graphs (e.g. [coding-agent](coding-agent.md))
  once that demo exists — not claimed by basic-coder alone.
- Epic: [17-grok-feed-chat-density](../DONE/EPICS/17-grok-feed-chat-density.md)
  (density projection);
  [43-feed-sanity](../DONE/EPICS/43-feed-sanity.md) (hide unmarked / `'none'`).
