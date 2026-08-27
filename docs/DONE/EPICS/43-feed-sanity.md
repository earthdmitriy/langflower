# Epic 43 — Feed sanity

**Status:** landed  
**Depends on:** [17-grok-feed-chat-density](17-grok-feed-chat-density.md)
(landed — chat-dense projection);
[37-deterministic-feed-fold](37-deterministic-feed-fold.md)
(landed — `feed-folding` classification).  
**Index:** [README.md](README.md)  
**Related:** [grok-feed](../../use-cases/grok-feed.md),
[feed-panel](../../features/feed-panel.md),
[HOW_TO_WRITE_REACTIVE_NODES](../../HOW_TO_WRITE_REACTIVE_NODES.md) §5.

## Landed

UI fold drops missing role, empty `FeedPortMeta` `{}`, and `{ role: 'none' }`.
No unmarked → `presentation: 'data'` path. Node-sdk helpers were **not**
stamped; catalog stamps only `common-finish` (`done` result; `value` is
`'none'`) and `common-preview` (formatted output is `result`). Preview canvas
box is stable (grow-fill pane, default **320×280** when width unset). grok-feed
Missing part **Unmarked dump** closed; Status stays **Partial** (live-provider
bar). Agent catalog walk (suggested step 4) was skipped — unmarked inputs stay
hidden by the fold default.

## Goal

Get rid of unnecessary messages in the work-log feed. The default story is
**chat + agent streams**, not a dump of every port event. Unmarked plumbing
must disappear. Finish and Preview stay as calm conversation bubbles. The
Preview canvas node must not resize when it receives a value.

## Locked decisions

1. **UI hide key is `'none'`.** The feed fold treats missing role, empty
   `FeedPortMeta` `{}`, and `{ role: 'none' }` as hide. There is no
   unmarked → `presentation: 'data'` path. Node-sdk helpers and catalog
   stamps stay unchanged; only how the UI reads port meta changes.

2. **Exception — agent / LLM nodes (including streaming ports).** Catalog
   agent ports that already opt in keep their roles. Plumbing on those same
   nodes does **not** appear:

    | Keep in feed                                         | Hide (missing / `'none'`)                             |
    | ---------------------------------------------------- | ----------------------------------------------------- |
    | `reasoning` (`streaming: true`)                      | `userPrompt` / `prompt` / `systemPrompt` inputs       |
    | `draft` / `draftResponse` (`streaming: true`)        | `tools`, `steerControl`, `feedback` inputs            |
    | `result` / `response`                                | `subagent-registration` and other inventory wires     |
    | `tool` / `toolLog` (`streaming: true`)               | Hidden HITL wires except their existing composer path |
    | `recovery` (`streaming: true`)                       | Any other unmarked in/out                             |
    | Sub-Agent / Review / Critique / Fake / OpenAI agents | —                                                     |

    Do **not** special-case agent **inputs** into technical rows. The exception
    is the opted-in conversation / stream / tool / recovery outs.

3. **Finish (`common-finish`) shows `done` as a conversation bubble.** When
   the node fires (run stops), the feed gets one `result` bubble whose body
   is the literal string `done` — **not** the passthrough payload. The
   `value` wire stays a passthrough with `role: 'none'` (downstream type
   unchanged). Prefer a dedicated result-role emit of `'done'` over a
   fold special-case on node type.

4. **Preview (`common-preview`) shows received content as a conversation
   bubble.** One `result` row with the formatted payload (same text the
   canvas preview shows). Do not emit both input and output as bubbles.

5. **Preview canvas size is stable.** Receiving `runner.input-received` (or
   the formatted output) **must not** change the node's width or height.
   Content scrolls inside the existing box. Operator SE-resize still works;
   extra height is a scroll viewport, not a content-fit grow. Likely cause
   today: `inline: 'preview'` is a non-grow port row, so
   `measureNodeContentMinHeightPx` uses live `offsetHeight`, and
   `clampHeightToContentMin` / ng-diagram min-size bump the box as
   `.lf-inline-preview` grows toward `max-height: 10rem`.

6. **Explicit author roles still work.** Nodes that already stamp
   `progress` / `result` / HITL classification / Chat Input user bubbles
   keep them. This epic does not mass-strip ingest progress, Loop
   `results`, permission cues, or composer HITL turns. Default hide only
   kills **unmarked** I/O.

7. **Inspector, not feed, is the dump.** Port values that used to appear as
   muted technical `data` rows are visible on the selected node in
   [inspector](../../features/inspector.md).

## In scope

### Fold default (UI)

- `fold-port-events`: missing role, empty `{}`, and `'none'` drop the
  frame. Author `FeedRole` in the UI is the same literal as SDK (`none`).
- `feed-folding` README: `undefined` role → none, same as `'none'`.
  Delete tests that expect unmarked inputs as `presentation: 'data'`.
- Do **not** stamp defaults in node-sdk or rewrite catalog nodes for this
  default. Later Finish/Preview steps may stamp those two nodes only.

### Catalog exceptions

- Agent / LLM catalog (session shell, Sub-Agent, Review, Critique, Fake,
  OpenAI): keep existing stream / result / tool / recovery stamps. Confirm
  prompt-class inputs have no role (they pick up none).
- `common-finish`: `'done'` result bubble as locked above.
- `common-preview`: received content as one result bubble; input stays none.

### Preview size bug

- Canvas Preview pane: fixed box relative to the **current** node size;
  overflow scroll; incoming value does not call `resizeNode` /
  `editor.updateNode.requested` with a new `ui.height` / `ui.width`.
- Unit: measure / min-size helpers must not return a taller floor after
  preview text lands than they did when the pane was empty (same node
  chrome). Optional component test: preview value change → size unchanged.

### Docs (close-out)

- [feed-panel](../../features/feed-panel.md) Layers + anti-patterns: drop
  “unmarked ports → muted technical `data`”; default is hide (`none`).
- [grok-feed](../../use-cases/grok-feed.md) S1 / Runtime `feed.role` row:
  unmarked MUST NOT appear at all (not even as last-port one-liners).
- [HOW_TO_WRITE_REACTIVE_NODES](../../HOW_TO_WRITE_REACTIVE_NODES.md) §5:
  omit `feed` ⇒ hidden; authors **opt in**. Distinguish `common-finish`
  (`done` bubble) from a plumbing `finish` **port** on other nodes (`none`).
- [feed-folding README](../../../packages/ui/src/app/features/feed-folding/README.md)
  classification list.
- Helper KB Can/Cannot only if a shipped claim changes (default hide).

## Out of scope

- Switching the live work-log renderer to `feed-folding` (epic 37 follow-up).
- [json-feed](../../TODO/json-feed.md) collapsed `JSON` placeholder (mostly moot once
  unmarked dumps are gone; keep as a separate spec if technical rows remain
  for `progress` / tools).
- Composer Start / Stop / Pause / Steer chrome (epics 35–36).
- New runner event families.
- Changing Loop `results` / ingest `progress` unless they currently appear
  **without** an explicit role (they should not).
- Auto-resizing Preview to a reserved empty height “so content fits” —
  operator SE-resizes if they want a taller pane.

## Use cases (acceptance stories)

### UC1 — Quiet plumbing

**Who:** Operator running a graph with String / Template / Preview / Finish
(or `basic-coder` plus mid-pipeline helpers).

**Do:** Start a chat turn; wait until Finish.

**Expect:** Feed shows user bubble, agent streams + result (and tools /
recovery if they fire), Preview content bubble, Finish `done` bubble.
No `prompt` / `text` / `value` technical one-liners from unmarked ports.
Expanding a node container does not reveal those omitted ports.

### UC2 — Agent streams still live

**Who:** Same operator on an LLM node.

**Do:** Run a turn that reasons, drafts, calls a tool, then settles.

**Expect:** Growing `reasoning` / `draft` / `tool` in place; `result`
bubble when settled; `recovery` banner if autokick fires. Agent **inputs**
do not appear as `data` rows.

### UC3 — Finish says done

**Who:** Operator on a graph that ends at `common-finish`.

**Do:** Let the run stop via Finish.

**Expect:** One left-side conversation bubble with the text `done`. The
wired payload is not printed in the feed. Canvas / downstream wire still
carries the real value.

### UC4 — Preview bubble + stable size

**Who:** Operator with `common-preview` on the canvas, node already placed
(default or SE-resized).

**Do:** Run so Preview receives a short string, then a long multiline /
JSON payload.

**Expect:** Feed shows the received formatted content as one result bubble.
Canvas node **width and height are unchanged** after both payloads;
content scrolls inside the preview pane. SE-resize still changes size.

## Acceptance criteria

1. UI fold: missing role, empty `{}`, and `'none'` hide the port; no
   unmarked `presentation: 'data'` row. Unit tests that required
   prompt-as-data are inverted. Node-sdk and catalog nodes unchanged.
2. Fold hide key is `'none'` (same literal as SDK `FeedRole`).
3. UC1 + UC2: `basic-coder` (Fake) settled feed has no plumbing portIds
   (`prompt`, template `text`, etc.) as technical rows; agent stream/result
   ports remain.
4. UC3: `common-finish` → one `result` bubble `done`; `value` payload not
   in the feed.
5. UC4: `common-preview` → one `result` bubble with received content;
   canvas size does not change on receive (unit and/or component proof).
6. Docs listed above match shipped behaviour. grok-feed Missing part
   “unmarked dump” is closed; Status stays Partial until the live-provider
   bar (unchanged).

## Suggested implementation order

1. Fold: treat undefined role as none; flip feed-folding unit tests.
2. UI hide key `'none'` (match SDK `FeedRole`); empty `FeedPortMeta` never
   appears. Do not stamp node-sdk helpers or rewrite catalog nodes.
3. `common-finish` `'done'` result emit; `common-preview` result on
   formatted content.
4. Confirm agent catalog stamps (no prompt-class roles).
5. Preview size: stop content-fit grow for `inline: 'preview'` (measure
   floor ignores payload height; pane `overflow-y: auto` inside current
   node box).
6. Docs + helper KB if a Can/Cannot line changes.

## Verify

- Intermediate (optional): focused vitest on `feed-folding`, finish/preview
  nodes, and canvas min-size / preview field; `verify --quick` while
  iterating.
- **Close-out (required):** `npm run test` or full
  `node build/tools/agent-run.mjs verify` — unit **and** integration. Do not
  mark this epic done on `--quick` alone.

## Links

- Classification (missing / `'none'` → hide):
  [`fold-port-events.ts`](../../../packages/ui/src/app/features/feed-folding/fold-port-events.ts)
  `presentationFromRole`
- Tests to invert:
  [`execution-feed.service-inputs.test.ts`](../../../packages/ui/src/app/features/feed-folding/tests/execution-feed.service-inputs.test.ts)
- Preview node:
  [`packages/common-nodes/src/output/preview/node.ts`](../../../packages/common-nodes/src/output/preview/node.ts)
- Finish node:
  [`packages/common-nodes/src/output/finish/node.ts`](../../../packages/common-nodes/src/output/finish/node.ts)
- Size path:
  [`measure-node-content-min-size.ts`](../../../packages/ui/src/app/features/canvas/utils/measure-node-content-min-size.ts),
  [`lf-node.component.ts`](../../../packages/ui/src/app/features/canvas/components/lf-node.component.ts)
  `clampHeightToContentMin`,
  [`lf-inline-field.component.ts`](../../../packages/ui/src/app/features/canvas/components/lf-inline-field.component.ts)
  `.lf-inline-preview`
