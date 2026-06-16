# Detachable long run

**Status:** Partial — reconnect chrome/gate + CLI settle line landed (epic 19);
Prefer Partial until broader mid-run close→reconnect smoke claims Implementable.

## Value

- Operator starts a long graph run and **does not babysit a browser tab** —
  as long as `langflower start` (or equivalent) stays up, the run keeps going;
  later they reopen to that same live or settled run.
- When the run settles, the **server CLI** prints one clear terminal line for
  the outcome — **not** checkpoint resume / Continue-from-boundary (that is
  [resumable-checkpoint-jobs](resumable-checkpoint-jobs.md)), and **not**
  operator soft Pause / Steer ([run-interruption](run-interruption.md)).
  Browser disconnect is not Pause; CLI settle lines cover natural `done`
  (not interrupt) today.

## UX scenarios

### S1 — Start a long run, leave the browser _(runtime-only)_

**Who:** Operator on a long-running workflow with `langflower start` (or
equivalent) already up.

**Want:** Walk away or close the browser without killing the run.

**Do:** Start the run from the UI; close the tab / quit the browser while the
server process keeps running.

**Expect:**

- While `langflower start` stays up, the run MUST continue after the client
  disconnects.
- Closing the browser MUST NOT dispose the session or stop the in-flight run.
- Killing / exiting the server process MAY end the run — this UC is not
  “survive reboot.”

### S2 — Reopen mid-run → current live state

**Who:** Same operator, later, while the run is still active.

**Want:** Instant orientation — what is happening now, not a blank editor.

**Do:** Open the editor again (new tab / reconnect) on the same project /
workflow.

**Expect:**

- UI MUST restore the **current** run: run identity, feed timeline present,
  canvas execution chrome, and run gate as **running**.
- If multiple runs exist, UI MUST show which run is current (not an ambiguous
  blend).
- Live updates MUST continue after reconnect (append after snapshot).
- Reopen MUST NOT silently Start a new run.
- If there is no run to restore, UI MUST show an empty / idle state — not a
  fake live run.
- MUST NOT require chat-density of the restored feed (owned by
  [grok-feed](grok-feed.md) S6).

### S3 — Reopen after completion → settled final state

**Who:** Operator who returns after the run has already finished.

**Want:** See the outcome without guessing whether the job finished.

**Do:** Open the editor after the run settled.

**Expect:**

- UI MUST show the **settled** final state: run identity, feed present, canvas
  chrome, and run gate as done (not stuck “running”).
- Settled outcome MUST map from runner settle:
  `success` → work done; `failed` → failed with error;
  `completed_with_errors` → completed with errors (or equivalent clear
  wording).
- Settled outcome MUST be visible without replaying the whole job from
  scratch.
- MUST NOT require chat-density of the restored feed (→
  [grok-feed](grok-feed.md) S6).

### S4 — CLI prints a clear completion line

**Who:** Operator (or watcher) at the terminal where `langflower start` is
running.

**Want:** Know the job finished without opening the UI or digging WS traffic.

**Do:** Leave the terminal visible while a long run completes (success or
failure).

**Expect:**

- CLI / server stdout MUST print a **dedicated, human-readable line** on run
  settle, projecting existing runner outcomes only:
    - `success` → “work done” (or equivalent)
    - `failed` → “failed with error” (or equivalent)
    - `completed_with_errors` → “completed with errors” (or equivalent)
- Outcome MUST NOT be only buried in WebSocket events or silent process
  silence after the initial port/project banner.

## UI specs

| Spec                                                    | Scenarios covered                                                                                      |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| [Workflow execution](../features/workflow-execution.md) | [S2](#s2--reopen-mid-run--current-live-state), [S3](#s3--reopen-after-completion--settled-final-state) |
| [Feed panel](../features/feed-panel.md)                 | [S2](#s2--reopen-mid-run--current-live-state), [S3](#s3--reopen-after-completion--settled-final-state) |

S1 is runtime-only (disconnect survival) — not a UI feature claim. S4 is
CLI/terminal only. Chat-density of the restored feed is owned by
[grok-feed](grok-feed.md) S6; this UC only needs run id + gate + feed present.

## Runtime requirements

Acid test only — if we never build it, which Expect dies?

| Need                                           | Why (scenario)                                                                                                                            | Today                                                                                                                                         | Caution                                |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Shared session survives client disconnect      | Run keeps going after close ([S1](#s1--start-a-long-run-leave-the-browser-runtime-only))                                                  | **Landed** — [FOUND_BUGS](../FOUND_BUGS.md) BUG-2026-06-26h; `ws-session-sync`                                                                | Process exit / kill still ends the run |
| `executionFeed` + runner snapshot on reconnect | Mid-run / settled feed present ([S2](#s2--reopen-mid-run--current-live-state), [S3](#s3--reopen-after-completion--settled-final-state))   | **Landed** — snapshot + live append; settle status from event log                                                                             | Prefer projecting existing events      |
| Run gate + run identity after reconnect        | Gate running/done; empty if none ([S2](#s2--reopen-mid-run--current-live-state), [S3](#s3--reopen-after-completion--settled-final-state)) | **Landed** — unit coverage mid-run / settled / null                                                                                           | Multi-run identity edge cases soft     |
| Canvas execution chrome after reconnect        | Live / settled chrome ([S2](#s2--reopen-mid-run--current-live-state), [S3](#s3--reopen-after-completion--settled-final-state))            | **Landed** — live settle keeps chrome (BUG-2026-07-21)                                                                                        | Matches reconnect restore              |
| CLI stdout line on runner settle               | Clear outcome line ([S4](#s4--cli-prints-a-clear-completion-line))                                                                        | **Landed** — `Run settled: work done` / `failed with error` / `completed with errors` from `completed` \| `failed` \| `completed_with_errors` | Natural `done` only (not interrupt)    |

## Status

**Partial** — epic 19 landed reconnect chrome/gate/feed parity with live settle,
CLI settle lines, and `detachable-long-run.ws.test.ts`. Prefer **Partial** until
broader mid-run close→reconnect operator smoke claims Implementable.

**Implementable when** S1–S4 Expects pass end-to-end in a real `langflower start`
session (close browser → reopen mid-run or after finish). HITL-after-reopen is
**out of this bar** — see [hitl-chat](../features/hitl-chat.md).

### Missing parts

| Layer          | Gap                                                        | Scenarios | Done when                                             |
| -------------- | ---------------------------------------------------------- | --------- | ----------------------------------------------------- |
| End-user proof | Manual close→reconnect mid-run smoke on `langflower start` | S2, S3    | Operator confirms gate + feed + chrome in one session |
| Demo / CI      | Broader failed / completed_with_errors settle paths in WS  | S4        | Optional; unit covers format mapping                  |

### Workarounds

- For durable **resume after process death**, see
  [resumable-checkpoint-jobs](resumable-checkpoint-jobs.md).
- For chat-dense feed after reload, see [grok-feed](grok-feed.md) S6 (**Partial**).
- Mid-run HITL after reopen — [hitl-chat](../features/hitl-chat.md); not this bar.

### Demo / CI

- `tests/integration/ws/detachable-long-run.ws.test.ts` — settle callback +
  reconnect feed (epic 19).
- Related: `tests/integration/ws/ws-session-sync.ws.test.ts` (S1 evidence).
- Epic: [19-detachable-long-run](../DONE/EPICS/19-detachable-long-run.md)
- Related (different Value): [resumable-checkpoint-jobs](resumable-checkpoint-jobs.md);
  [grok-feed](grok-feed.md) S6 (chat-dense reload).
