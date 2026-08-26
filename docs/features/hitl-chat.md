# HITL chat

## Goal

Let a workflow hand control back to the user mid-run — asking a question,
handing over a draft for review, or waiting for an approval — so the user
decides what happens next while the workflow is still running, instead of
only seeing a final result after everything finishes.

## Core Principles

- **The graph, not a hidden chat loop, defines the interaction** — who gets
  asked what is wired explicitly as nodes and edges, mirroring how the rest
  of the workflow is visual rather than implicit.
- **Approve / deny / retry are distinct actions, not a single dialog config**
  — each is modeled as its own input port, so a workflow can route each
  outcome differently.
- **Feedback revises in place, it doesn't restart the conversation** — a
  reviewer's rejection or a user's correction routes back to the same agent
  node that produced the answer, which fixes it while keeping its existing
  context — not a fresh, context-free rerun from the original prompt.
- **Chat-style loops end on user Stop, not on "things went quiet"** — a
  multi-turn conversation does not get silently marked complete just because
  no new events arrived for a while.
- **The user is never blocked without knowing it** — a node waiting on human
  input surfaces a clear prompt/context in the run's live feed, not a silent
  hang.

## Feature Details

Three building blocks give a user control over an in-progress run:

- **Review Gate** — mid-run pause for approve or request-changes; user text
  on `requestChanges` feeds back into the workflow (e.g. into an agent's
  next turn); approve passes the reviewed content on `response`.
- **Review** — a gate placed after an agent step: the agent answers, then a
  reviewer (a person, or a dedicated review agent node) checks that answer.
  If it's good, that same answer passes through unchanged. If not, the
  reviewer's feedback routes back to the agent that produced it, which
  revises the answer in the same context rather than starting over. A limit
  on consecutive failed attempts prevents infinite retry loops.
- **HITL input controls** (Review Gate approve / request-changes, and any
  node with `config.hitl` inputs) — each renders one control per configured
  input (a text box, a button, a file picker, …) in the run's live feed;
  approve and request-changes are separate controls rather than options
  inside one dialog.

**Chat-style workflows:** when a workflow contains a Review Gate–driven
feedback loop back into an agent, the run behaves like a conversation. Once
started (see [workflow-execution.md](workflow-execution.md) for how a chat
run begins), the user's message and the agent's inline prompt are combined
for the first turn, and the agent's streaming draft response appears in the
chat timeline as it is generated — see [feed-panel.md](feed-panel.md) for
the surface this plays out on (the HITL composer for human input, the work-log
timeline for the streaming draft). This kind of run only ends when the user
presses Stop; it does not auto-finish between turns.

**Review-and-revise workflows:** when a Review node's failure feedback wires
back into an agent (not through Review Gate chat feedback), the loop is not
conversational — it auto-completes as soon as the review accepts and the rest
of the graph settles, capped by a maximum number of revision attempts.

**One-shot workflows** with no human-feedback loop in scope behave like any
other run: they complete automatically once 'finish' node settles.

**HITL UI surface (composer).** Controls appear only while execution has reached
a HITL node and it is still awaiting a human reply — not for the whole run —
except **Chat Input**, which also seeds an idle composer before the first run
so the user can cold-start the cluster. They show in the editor's bottom
**composer** (the work-log timeline above stays a pure execution history) and
hide again as soon as the user sends an answer (or the matching HITL-port
delivery is seen).

Surface rules (visual SSOT [`docs/palette.html`](../palette.html) §8; canonical
layout table: [feed-panel.md](feed-panel.md) § Composer layout):

- One **full-bleed** textarea; **no** Goal / Message / Feedback field labels —
  destination = pressed CTA. **Enter** (keyup) activates the rightmost footer
  CTA; **Shift+Enter** inserts a newline.
- **Tab strip only when 2+** awaiting HITL gates (one tab per node title).
  Single gate / entry → **no** tab strip and **no** title-only chrome row.
- Hovering a tab, or hovering / focusing the active textarea, highlights the
  corresponding canvas node (`NodeHoverService`). A node awaiting input also
  gets a **sky-blue** ring (`hitl` chrome), separate from pending (amber) /
  value (green) / error (rose).
- Composer tabs hard-reset on hard **Stop**, `runner.done`, or a new run — so
  a parallel gate that never got a reply does not linger after the run settles.
  Triggered set rebuilds from the replayed run feed on reconnect.

**Entry vs mid-run composer.** Two different jobs share the same surface.

- **Entry (Chat Input, `chatEntry`)** — cold-starts the cluster. Footer
  **Start** (emerald play). No chrome Run; no field labels. The node's
  `inputs.message` is the same value as the on-node field and the inspector
  — composer, canvas, and inspector all bind to that input (no separate
  composer overlay). Typing in any of them persists so Stop then Start reuses
  the same text. After submit the composer shows `working . . .`
  while the run is active; the chat footer must remain (Stop / Pause chrome —
  see below).
- **Mid-run gates (Review Gate, …)** — reply while a run is already active.
  Reply CTAs stay text pills (`Send`, `Send feedback`, Approve, …) on the
  right. Hard **Stop** is rose (left while running / after Pause); soft **Pause**
  is amber (right while a pausable last-feed agent is working — including when
  another node already has a Steer tab). After Pause, the same HITL composer
  unlocks for that paused agent (`steerControl` has `config.hitl`: textarea +
  **Send**); tabs when 2+ awaiting (agents and/or gates). Pause is **per-node**
  (last feed section), not a global run pause. Fold: `pause` opens awaiting,
  Send closes — see [ADR-032](../ADR.md#adr-032--soft-pause-via-hidden-steercontrol-hitl-port).
  Soft Pause UI/runtime **shipped** (DONE epic 36) — see
  [run-interruption](../use-cases/run-interruption.md) and
  [ADR-031](../ADR.md#adr-031--stop-hard-cancel-vs-pause-soft-interrupt-vs-steer).
  Composer shell layout **shipped**
  ([DONE epic 35](../DONE/EPICS/35-composer-shell-layout-contract.md)).

**Multi-gate HITL (by design).** Several HITL nodes may await in the same run —
parallel or serial — without any identity / persona layer. Role separation in
clearance workflows is **multiple graph gates** (labels, prompts, edges), not
reviewer hats. With 2+ open gates the tab strip lists every gate; each
`runner.hitl.event` targets one `nodeId` / `portId`.

## Implementation Details

- Full HITL protocol (prompt delivery, reply submission, port-level
  `config.hitl`, loop-kind detection and termination rules):
  [docs/EXECUTION_ARCHITECTURE.md](../EXECUTION_ARCHITECTURE.md) § LLM +
  human-in-the-loop.
- Graph lock / feed panel rendering and HITL types:
  [docs/REACTIVE_NODES.md](../REACTIVE_NODES.md) § HITL and graph lock.
- Reference node implementations: `common-chat-input` (run entry),
  `common-hitl-review-gate`, `common-review` — see
  [node-library.md](node-library.md).
- Chat Input idle composer + plain-Run exclusion:
  `ComposerService.idleChatEntryNodeIds` /
  `WorkflowExecutionService.hasPlainStartTargets`; runtime `chatEntry` on
  `RuntimeRunner.start`. Idle composer, canvas, and inspector share
  `inputs.message`. Composer follows live `editor.updateNodes` (same delta
  as the canvas), not snapshot-only `workflow.current.snapshot`. Canvas:
  hidden HITL without `inline` stays off the canvas; `hidden` + editable
  `inline` is a field with no incoming handle.
- Feedback-edge detection used to exclude feedback wiring from normal
  upstream walks: `packages/shared/src/execution/feedback-edges.ts`.
- HITL UI surface (composer):
  `packages/ui/src/app/features/composer/components/lf-composer-shell.component.ts`
  (stage + footer; Start / Stop / Pause), `lf-hitl-textarea.component.ts`,
  `lf-hitl-actions.component.ts`, `run-button.component.ts`,
  `pause-button.component.ts`. Layout contract:
  [feed-panel.md](feed-panel.md) § Composer layout.
- Soft Pause mechanism:
  [ADR-032](../ADR.md#adr-032--soft-pause-via-hidden-steercontrol-hitl-port);
  scenarios: [run-interruption](../use-cases/run-interruption.md).
- HITL push: `packages/server/src/bridge/wire-runner-handlers.ts`
  (`runner.hitl.event` → `pushIntoInput`).
- Interactive-loop termination design decision:
  [docs/ADR.md](../ADR.md#adr-015--interactive-hitl-feedback-loops-end-on-stop-not-idle-settle)
  (ADR-015).
