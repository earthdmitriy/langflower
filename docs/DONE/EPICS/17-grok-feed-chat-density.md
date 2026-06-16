# Epic 17 — Grok feed chat density

**Status:** landed  
**Depends on:** Work log + HITL composer infra (DONE epics / feed-panel)  
**Blocks:** [grok-feed](../../use-cases/grok-feed.md) S1–S6 (Draft → Partial)  
**Index:** [README.md](README.md)

## Goal

Make the sidebar feed a **chat mirror of graph telemetry**: important
conversation by default, muted technical one-liners (last port event),
expand-on-demand, HITL user-side bubbles, composer parity — without a raw
port dump.

## In scope

1. Chat projection layer in the work log ([feed-panel](../../features/feed-panel.md)).
2. Important vs technical layers; `reasoning` / `draft` / `tool` / `shell` /
   MCP demoted; stream open while working → auto-collapse on final.
3. HITL / Chat Input replies as opposite-side timeline bubbles.
4. Feed ↔ canvas highlight on muted rows (keep chrome-only).
5. Reconnect density for settled turns (chat-dense; in-flight MAY reopen
   streams) — presence only stays [detachable-long-run](../../use-cases/detachable-long-run.md)
   / epic 19.

## Out of scope

- Settings panel / config UI (epic 18).
- CLI settle line (epic 19).
- New runner event families “just for the feed.”
- Checkpoint resume (epic 20).

## Acceptance criteria

1. [grok-feed](../../use-cases/grok-feed.md) S1–S6 Expects pass on `basic-coder`
   (and denser graphs where claimed). ✅ (unit density + projection; UI Partial)
2. Settled timeline is not a bright per-node dump; technical = muted last
   port event; expand shows detail. ✅
3. Composer Start/Stop slot + reply CTAs match feed-panel checklist. ✅
   (pre-landed; unchanged)
4. Use-case Status moves Draft → Partial (or Implementable if full bar met). ✅
   Partial
5. `verify` (or stated UI/unit gate) green. ✅

## Landed

- `projectFeedTimeline` chat-density projection
  (`packages/ui/.../feed-timeline.ts`)
- Work log: user/result bubbles + muted technical last-port rows
- HITL user turns in live + snapshot folds
- Unit tests for density / reconnect projection
- [grok-feed](../../use-cases/grok-feed.md) → **Partial**

## Links

- [grok-feed](../../use-cases/grok-feed.md)
- [feed-panel](../../features/feed-panel.md)
- [hitl-chat](../../features/hitl-chat.md)
- [STATUS.md](../../STATUS.md) § Product docs / feed-panel
