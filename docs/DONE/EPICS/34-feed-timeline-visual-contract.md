# Epic 34 — Feed timeline visual contract (UI)

**Status:** landed (2026-07-25)  
**Depends on:** —  
**Index:** [README.md](README.md)  
**Feeds:** [grok-feed](../../use-cases/grok-feed.md)

## Goal

Implement the feed draft / tool-subagent interrupt sequence from
[feed-panel](../../features/feed-panel.md) and
[`docs/palette.html`](../../palette.html) §7 in the live work-log projection
so operators see chat-mood draft bubbles, not peek-only technical dumps.

## Landed notes

- Draft / tool / shell segments in
  [`feed-timeline.ts`](../../../packages/ui/src/app/features/sidebar/feed-timeline.ts)
    - markdown draft bubbles in
      [`lf-work-log-panel.component.ts`](../../../packages/ui/src/app/features/sidebar/components/lf-work-log-panel.component.ts)
- Sequence draft→tool→draft with `streaming…` while active; settled drafts drop
  streaming chrome
- Unit coverage in `feed-timeline.test.ts` (including ADR-032
  draft→steer→draft cycles and tool retention per phase)
- Soft Pause feed breakpoints land with [epic 36](36-stop-pause-steer-controls.md)

## Acceptance criteria

1. Live **draft** projects as a left bubble with markdown ASAP; `draft` +
   `streaming…` chrome while open.
2. On tool / subagent start: close current draft segment → borderless collapsed
   tool/subagent log → **new** draft bubble for continued markdown.
3. On turn complete: drop `draft` / `streaming…`; bubble becomes plain content.
4. [grok-feed](../../use-cases/grok-feed.md) S1 phase density still holds
   (no wall of bright cards).
5. Unit coverage for the projection sequence; `verify` (or scoped feed tests
    - typecheck) green.

## Verify

- Unit: feed timeline / feed-section projection for draft→tool→draft→complete.
- Manual: palette §7 specimens vs live work log on `basic-coder`.
- `node build/tools/agent-run.mjs verify --quick` green.
