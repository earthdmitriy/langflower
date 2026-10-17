---
kind: adr
owner: docs
covers: []
status: superseded
id: ADR-036
supersedes: []
superseded-by: [ADR-037]
package: docs
---

## ADR-036 — Work log CDK virtual scroll (row grain + frozen spacer)

**Status:** superseded by [ADR-037](./037-work-log-sliding-measured-window.md) · **Date:** 2026-09-02

**Context:** A single work-log visit can hold hundreds of tall markdown
bubbles (Cicle timer / huge `result` dumps). Visit-level virtualization
leaves that visit fully in the DOM and freezes the tab. Row heights are
unknown until render (markdown, open `<details>`). Native scrollbar maps
the pointer linearly onto **current** `scrollHeight`. CDK experimental
`autosize` rewrites `.cdk-virtual-scroll-spacer` via
`CdkVirtualScrollViewport.setTotalContentSize` on every `scroll` when the
rendered window changes — the thumb then lags the cursor. There is no
public CDK flag to freeze total size while still updating range/offset.

**Alternatives considered:**

- **Visit-level `*cdkVirtualFor`** — cheap, but one Preview visit with
  ~400 bubbles still mounts everything. Rejected.
- **Nested CDK inside a visit** — two scroll owners, nested autosize,
  hover/pin bugs. Rejected.
- **Fixed `itemSize`** — 1:1 native thumb, but variable-height rows
  overlap or leave gaps. Rejected while bubbles stay unbounded.
- **Custom overlay scrollbar** — pointer maps onto the _visual_ thumb
  (min-height ~32px vs ~1px proportional). More UI/a11y surface than we
  need if spacer height can stay still during native drag.
- **Fork `AutoSizeVirtualScrollStrategy`** — freeze only
  `_updateTotalContentSize`. Larger upgrade cost than wrapping the one
  viewport write.
- **No virtualization** — tab hitch on huge dumps. Rejected.

**Decision (historical):**

1. Virtualize **header + item rows** from the same `FeedProjection`
   (`flattenFeedRows` → `feedRows$`). Visit grouping stays on
   `nodeFeed$`. Grain does not split a visit by height threshold.
2. Use `@angular/cdk` viewport + experimental **`autosize`**. Do not put
   `min-height: 100%` / `flex-end` on `.cdk-virtual-scroll-content-wrapper`
   (autosize measures that wrapper; a viewport-tall wrapper inflates
   average item size). `overflow-anchor: none` on `.lf-feed-viewport`.
3. Stick-to-bottom is an **explicit pin**, not browser overflow-anchor.
   Unpin on user scroll-up (wheel, touch, keys, scrollbar drag). The
   viewport is focusable so PageUp/Home/ArrowUp reach `(keydown)`.
   CDK/layout `scroll` must not unpin. Closed `<details>` keep the dump
   out of the DOM until opened.
4. **Unavoidable adapter:** wrap `viewport.setTotalContentSize` with
   `createFrozenTotalSize`, and wrap autosize `onDataLengthChanged` so it
   is a no-op while frozen. Freeze when the native thumb is down **or**
   the feed is unpinned (`shouldFreezeFeedSpacer`). Skip
   `checkViewportSize` in that state. Still allow
   `setRenderedRange` / `setRenderedContentOffset` on user scroll within
   the frozen `scrollHeight`. Unfreeze and flush pending only when
   **pinned and not dragging** (↓ New events or a gesture that reaches
   the bottom). While pinned, remeasure coalesces with `debounceTime(0)`
   from `feedRows$`, open `<details>`, and `ResizeObserver` on the
   viewport host (sidebar / window `clientHeight`) plus the content
   wrapper, then remeasure and stick-to-bottom. Autosize's running average
   drifts down when the visible window is shorter than historical rows;
   that would shrink `.cdk-virtual-scroll-spacer` and flicker pin/stick
   (including wheel-down while already at the bottom). The wrap never
   decreases a committed spacer height until reset (empty feed). Do not
   fork the autosize strategy.

**Why it did not ship:** Freeze, high-water spacer, and pin rules did not
stop a **random flicker** (content / spacer / thumb jumping with no
reliable repro). Off-DOM height stayed `average × unrendered count`, so
CDK still rewrote spacer and `translateY` on an estimated document. We
could not isolate the flicker. [ADR-037](./037-work-log-sliding-measured-window.md)
replaces this path. Do not wait for a CDK freeze API.

**Tradeoffs accepted (at the time):**

- (+) Huge visits stay off-DOM except the window; fold grain stays one
  projection.
- (+) Native scrollbar; no second scroll widget.
- (+) Thumb scale is stable during drag because `scrollHeight` does not
  change mid-gesture.
- (+) Unpinned middle view stays put while new events append; spacer and
  `translateY` do not jump.
- (+) Pinned spacer does not ratchet down as autosize's average drifts
  (wheel-down at bottom / remeasure).
- (−) Wrapping CDK instance methods is glue: it can break on Angular/CDK
  upgrades if spacer height or data-length handling is written another way.
- (−) Native min-thumb vs a ~570kpx estimated document still cannot be
  pixel-perfect; freeze only stops _scale drift_ during drag.
- (−) While unpinned, `scrollHeight` does not grow; new events are reached
  via **↓ New events**, not by scrolling to the old end.
- (−) Collapsing a huge `<details>` while pinned does not shrink
  `scrollHeight` until the feed is cleared.
- (−) Experimental `autosize` has no `scrolledIndexChange` /
  `scrollToIndex`.
- (−) A **visible and expanded** huge dump in the window can still hitch.

**Consequences:**

- Deleted: `frozen-total-size.ts`, `cdk-virtual-scroll-viewport`,
  `@angular/cdk-experimental`, and the leftover `@angular/cdk`
  dependency (no other UI usage).
- Kept from this ADR: header + item grain (`flattenFeedRows` /
  `feedRows$`) and explicit pin. Shipped window:
  [ADR-037](./037-work-log-sliding-measured-window.md).
- Docs: [VIRTUAL_SCROLL.md](../architecture/ui/VIRTUAL_SCROLL.md);
  [feed-panel.md](../product/features/feed-panel.md) Implementation.

**Revisit trigger:** None. A return to CDK autosize needs a **new** ADR,
not a revival of this wrap.

---
