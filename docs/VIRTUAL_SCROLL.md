# Work log virtual scroll

Why the work log does **not** mount the full execution history as HTML,
why Angular CDK `autosize` virtual scroll failed, and what we ship instead.

Canonical decision: [ADR-037](ADR.md#adr-037--work-log-sliding-measured-window)
(shipped sliding window). Failed attempt:
[ADR-036](ADR.md#adr-036--work-log-cdk-virtual-scroll-row-grain--frozen-spacer)
(CDK `autosize`, superseded). User-facing behaviour:
[feed-panel.md](features/feed-panel.md). Fold grain (unchanged):
[`feed-folding/README.md`](../packages/ui/src/app/features/feed-folding/README.md).

This is a **narrative of attempts**. Do not reintroduce
`cdk-virtual-scroll-viewport` or `autosize` without a new ADR.

---

## The problem — huge runs oversaturate HTML

A long workflow run is not a short chat. One visit can hold hundreds of
port items: Cicle timer ticks, Preview dumps, Agent `result` / reasoning
markdown, open `<details>` snapshots. Heights are unbounded and change
after first paint (markdown layout, expanding a dump). They also change
when the operator drags the feed resize bar: a narrower column rewraps
text and every row grows or shrinks again.

The fold already flattens that into **header + item** rows
(`flattenFeedRows` → `feedRows$`). If the panel renders every row:

- the DOM grows with history, not with the viewport;
- layout, style, and hover work scale with node count;
- the tab hitches or freezes on a typical “huge dump” run.

Visit-level virtualization is not enough: one Preview visit with ~400
bubbles still mounts everything. The grain that must stay off-DOM is
the **row**, not the visit card.

We still need:

- a native scrollbar (no second overlay widget);
- stick-to-bottom as an **explicit pin**, not `overflow-anchor`;
- closed `<details>` so dumps stay out of the DOM until opened;
- rows whose height cannot be known before they render.

---

## Attempt — CDK virtual scroll + autosize

[ADR-036](ADR.md#adr-036--work-log-cdk-virtual-scroll-row-grain--frozen-spacer)
put the work log on `@angular/cdk` `cdk-virtual-scroll-viewport` with
experimental **`autosize`** (`@angular/cdk-experimental`).

Fixed `itemSize` was rejected first: a 24 px row and a 5000 px dump cannot
share one size. They overlap or leave gaps.

`autosize` exists for that case. It measures the rendered window, keeps a
running **average** height, and treats off-DOM rows as
`average × unrendered count`. That product becomes
`.cdk-virtual-scroll-spacer` via `CdkVirtualScrollViewport.setTotalContentSize`.
The native thumb then maps onto that estimated document. On `scroll`, CDK
rewrites spacer height and `translateY` so the window appears to sit in
the right place on a tall page.

That estimate is the failure mode. Work-log rows are not “unknown until
measured once”. They are **not estimable**:

- the visible window’s average is not the history’s average (a screen of
  short ticks vs a 20-screen dump);
- markdown and open `<details>` change height after the strategy has
  already committed a spacer;
- a single row can exceed the viewport, so “average item size” is not a
  meaningful unit;
- the feed column has a **resize drag bar** (sidebar width; composer
  split also changes feed viewport height). Dragging width **rewraps**
  markdown and port text, so every row’s height changes again — on top
  of the already-dynamic folded port events. Off-DOM estimates then
  describe a layout that no longer exists;
- experimental autosize has no `scrolledIndexChange` / `scrollToIndex`.

So the scrollbar and the pixels on screen are two numbers CDK can split.
Operators feel it as thumb lag, empty pin, a shrinking spacer, or a hole
under the last events.

---

## Found problems and attempts to fix them

### CDK autosize (ADR-036)

| Symptom                           | What we tried                                                                                                                                  | Why it was not enough                                                                                                                                                                       |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native thumb lags the cursor      | Autosize calls `setTotalContentSize` on every `scroll` when the rendered range changes, so `scrollHeight` moves under the pointer.             | Wrapped `setTotalContentSize` (`frozen-total-size.ts`) and no-op’d `onDataLengthChanged` while the thumb was down **or** the feed was unpinned. Glue on CDK instance methods; upgrade risk. |
| Pin flickers / spacer shrinks     | Autosize’s running average drops when the visible window is shorter than historical rows. The spacer ratchets down.                            | High-water: never decrease a committed spacer until the feed is cleared. Stopped shrink; see the hole below.                                                                                |
| Empty space under the tail        | Frozen / high-water spacer taller than the real tail. Pin follows `scrollHeight`, which includes the hole. Last events sit above a blank band. | End-align and high-water still left **two** numbers (spacer vs offset) that CDK could split. Rejected.                                                                                      |
| Inflated average                  | `min-height: 100%` / `flex-end` on `.cdk-virtual-scroll-content-wrapper` made autosize treat a viewport-tall wrapper as item size.             | Removed those styles from the CDK wrapper. Did not fix estimate drift.                                                                                                                      |
| Layout `scroll` unpinned the feed | Browser `overflow-anchor` and CDK scroll events look like user scroll.                                                                         | Explicit pin; `(scroll)` does not unpin; viewport is focusable for keys. Kept after dropping CDK.                                                                                           |
| Unpinned view jumped on append    | Autosize re-anchored offset / spacer when `dataLength` grew.                                                                                   | Freeze while unpinned. New events then unreachable except via **↓ New events**. Awkward, still on a lying `scrollHeight`.                                                                   |

Those patches did not kill a **random flicker** (content / spacer / thumb
jumping with no reliable repro). We could not isolate it: freeze, high-water,
and pin rules still left CDK rewriting spacer and `translateY` on a
document whose height was an estimate. We deleted `frozen-total-size.ts`,
the CDK viewport, `@angular/cdk-experimental`, and the leftover
`@angular/cdk` UI dependency (no other usage).

### Early sliding-window prototype

Native `overflow: auto` over a measured `{ start, end }` slice was the
right shape. The first policy — walk from **one** anchor (tail back, or
head forward) with a ~two-screen / 50-row cap — could not work: a tall
row ate the budget, neighbours never entered the DOM, native scroll had
nowhere to go. That sketch was discarded. The window below pads both
sides of what is actually on screen.

---

## Final solution — sliding measured window

The work log is a native `overflow: auto` list. The DOM holds a window
`{ start, end }` (end exclusive) over `feedRows$`, not a virtual spacer
over the full history.

```text
older pad ~10 viewports
        │
        ▼
  rows intersecting the viewport   ← may be one 20-screen dump
        │
        ▼
newer pad ~10 viewports
```

| Piece           | Behaviour                                                                                                                                                                                                                                                                                                   |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Visible range   | Rows whose measured (or placeholder) boxes intersect the viewport.                                                                                                                                                                                                                                          |
| Pad             | `FEED_WINDOW_PAD_VIEWPORTS = 10` extra height **above** and **below**, separately.                                                                                                                                                                                                                          |
| Recenter        | When pad on one side is below `FEED_WINDOW_RECENTER_VIEWPORTS = 2` and more rows exist. `auditTime(48)` on wheel / keys / touch / non-programmatic `(scroll)`. Thumb drag at the top/bottom of the **slice** shifts one row that way (drops one on the other side) every 48 ms; `pointerup` then recenters. |
| Pin (default)   | Window anchored at `length`; pad only upward; `end === length`. Geometry at the bottom. Unpin on wheel/touch/keys/thumb **up**; layout `scroll` does not unpin. Re-pin: **↓ New events**, End, or a gesture that reaches the real tail.                                                                     |
| Home            | `start === 0`; pad only downward.                                                                                                                                                                                                                                                                           |
| Unpinned append | `start` / `end` stay put; new tail rows do not walk into the slice until the user recenters toward them.                                                                                                                                                                                                    |
| Prepend         | If `start` decreases, add the new top height to `scrollTop` **after** paint so the same rows stay on screen.                                                                                                                                                                                                |
| Short tail      | `flex-end` on the list wrapper is allowed now (autosize is gone and no longer measures that wrapper).                                                                                                                                                                                                       |
| Fast-scroll cue | **rendering N of M items** at the slice edge (older end = first index in the window, newer end = last) so a held thumb drag through similar rows still shows position.                                                                                                                                      |

Code:

- [`feed-window.ts`](../packages/ui/src/app/features/feed/feed-window.ts) —
  `visibleFeedRange`, `windowAroundVisible`, `shouldRecenterWindow`,
  `nextWindowFromAnchor`, `slideFeedWindowByOne`.
- [`lf-work-log-panel.component.ts`](../packages/ui/src/app/features/feed/components/lf-work-log-panel.component.ts) —
  pin gestures, `auditTime` recenter, prepend correction, `afterNextRender`
  stick-to-bottom, placeholders.

---

## Accepted tradeoffs

- (+) No spacer, no `translateY`, no average-size glue. Pin shows the last
  events. Thumb scale is 1:1 with the **measured slice**.
- (+) Unpinned view does not jump when new events append.
- (+) Closed `<details>` still keep dumps out of the DOM.
- (+) Neighbours of a giant visible row stay mounted; the thumb can sit
  near the middle of ~20 screens of pad plus whatever is on screen.
- (−) The thumb **cannot** jump to an arbitrary older row. It maps the
  current slice only. At the slice edge, drag feeds one row per 48 ms;
  wheel/keys recenter. A proportional thumb over the full feed is out
  of scope.
- (−) A **visible and expanded** huge dump still inside the window can
  hitch the tab. That is very unlikely on a typical run: it needs a node
  that **intentionally** emits a huge payload. Virtualizing _inside_ that
  slice (or CDK autosize again) is out of scope.
- (−) Window math, prepend correction, and pin-after-paint are ours to
  maintain.
- (−) **rendering N of M items** is a cue, not extra virtual space; overshooting
  still waits on the next recenter.

---

## Do not resurrect

- `cdk-virtual-scroll-viewport` / `autosize` / `frozen-total-size.ts` /
  `@angular/cdk` as a UI dependency
- Visit-only virtualization as a substitute for row windows
- Fixed `itemSize` while feed rows stay unbounded
- `debounceTime` on recenter (it waits for the gesture to stop)
- Flex on `.lf-feed-viewport` (it clips tall rows)

**Revisit** if we need a proportional thumb over all history (store every
row height + a virtual spacer), or if the ~20-screen pad still hitches on
typical dumps (shrink the pad or virtualize inside the slice). That is a
new ADR, not a silent return to autosize.
