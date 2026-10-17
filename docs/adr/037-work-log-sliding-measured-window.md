---
kind: adr
owner: docs
covers: []
status: current
id: ADR-037
supersedes: [ADR-036]
superseded-by: []
package: docs
---

## ADR-037 — Work log sliding measured window

**Status:** accepted (shipped) · **Date:** 2026-09-02

**Context:** Work-log rows are unbounded (markdown, open `<details>`).
CDK experimental `autosize` ([ADR-036](./036-work-log-cdk-virtual-scroll-row-grain-frozen-spacer.md))
estimates off-DOM height as `average × unrendered count`. Freeze and
high-water spacer stopped shrink but left a hole under the tail and did
not stop a **random flicker** we could not isolate. Row grain and
explicit pin from ADR-036 stay; the CDK viewport does not.

**Alternatives considered:**

- **Keep autosize + freeze / high-water spacer** — still two numbers
  (spacer vs offset) plus unsolved flicker. Rejected; superseded
  ADR-036.
- **Fixed `itemSize` on a CDK viewport** — variable-height rows overlap
  or gap. Rejected.
- **CDK viewport without autosize, custom strategy that renders the
  whole slice at offset 0** — `overflow: auto` plus spacer glue.
  Rejected as extra surface.
- **One-sided walk from pin/head with a ~two-screen / 50-row cap** —
  early sliding-window prototype. A tall row ate the budget; neighbours
  never entered the DOM. Discarded.
- **Full-document measured prefix** — correct thumb over all history;
  must store every row height and keep a virtual spacer. Deferred.
- **Render the entire `feedRows$` list** — tab hitch on huge dumps.
  Rejected.

**Decision:**

This is the **shipped** work-log window. Do not reintroduce
`cdk-virtual-scroll-viewport` / `autosize` without a new ADR. The UI
package does not depend on `@angular/cdk`.

1. Keep **header + item** grain from ADR-036 (`flattenFeedRows` →
   `feedRows$`). Fold does not change.
2. Native `overflow-y: auto` list of a **sliding window** `{ start, end }`
   (end exclusive). No flex on the scrollport (it clips tall rows). No
   CDK spacer / `translateY`.
3. Window is the **visible row range** plus about **10 viewports of pad
   above and 10 below**, counted separately. Visible height (including a
   20-screen dump) does **not** consume that pad. Recenter when pad on
   one side drops below ~**2 viewports** and more rows exist — not
   merely because `scrollTop` is 0 at the top of a tall row. Unmeasured
   rows use a ~24 px placeholder; a per-side row cap (~400) is only a
   fuse so 0 px heights cannot pull the whole history.
4. **Pin** (default): window anchored at `length` (tail) with pad only
   upward. `scrollTop` follows real `scrollHeight` **after** the extra
   row paints (`afterNextRender`). Unpin on wheel/touch/keys/thumb as in
   ADR-036; `(scroll)` does not unpin. Pin is tail window **and**
   geometry at the bottom. Re-pin: **↓ New events**, End, or a gesture
   that reaches the real tail. Home jumps to the head (pad only
   downward).
5. **Unpinned:** `start`/`end` stay put while new rows append. Wheel /
   keys / touch / non-programmatic `(scroll)` recenter with
   `auditTime` (~48 ms) when the pad is thin — not `debounceTime`, which
   waits for the gesture to stop. Prepend adds the new top height to
   `scrollTop` after paint. Unpin recenters around what is on screen.
   **Thumb drag:** while the pointer is down the slice stays put except
   at the **top or bottom of the current slice** — then shift one row
   toward that edge (drop one on the opposite side) every ~48 ms, and
   keep `scrollTop` on that edge so the thumb can keep feeding. After
   `pointerup`, one recenter around what is on screen.
6. Slice edges show **rendering N of M items** (1-based index of the
   older or newer end of the window) while history remains outside the
   slice — so a thumb held at the edge with similar rows still shows
   movement. Short tail may use `flex-end` on the list wrapper (autosize
   no longer measures it). Closed `<details>` keep dumps out of the DOM.

**Tradeoffs accepted:**

- (+) Spacer / `translateY` / average-size glue go away; pin shows the
  last events; random CDK flicker is gone with the viewport.
- (+) Native scrollbar over the **measured slice** only — 1:1 with
  content height.
- (+) Unpinned view does not jump when new events append.
- (−) Thumb cannot jump to an arbitrary older row; it maps the current
  slice (~20 screens of pad plus whatever is visible), then recenters.
- (−) A **visible and expanded** huge dump still inside the window can
  hitch the tab. Very unlikely unless a node **intentionally** emits a
  huge payload.
- (−) Window math, prepend correction, and pin-after-paint are ours to
  maintain.
- (−) **rendering N of M items** is a cue, not extra virtual space.

**Consequences:**

- UI: `lf-work-log-panel`, `feed-window.ts`.
- Docs: [VIRTUAL_SCROLL.md](../architecture/ui/VIRTUAL_SCROLL.md);
  [feed-panel.md](../product/features/feed-panel.md) Implementation;
  [feed-folding README](../../packages/ui/src/app/features/feed-folding/README.md).
- Supersedes ADR-036. Grain and explicit pin remain.

**Revisit trigger:** Proportional thumb over the **full** feed (store
every row height + a virtual spacer); or the ~20-screen pad still
hitches on typical dumps (then shrink the pad or virtualize _inside_
the slice). Not a silent return to CDK autosize.

---
