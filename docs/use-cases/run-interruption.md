# Run interruption

**Status:** Partial — soft Pause / Steer + composer shell landed (epics 35–36).
Product lock for soft Pause / Steer; hard Stop path already exists as
interrupt `'cancel'`. Real-LLM Implementable bars still open.

## Value

Operator mid-run can **abort** cleanly (hard Stop) or **soft-pause** an agent
turn, type Steer feedback, and continue without killing the workflow — calm
composer corners, not a single ambiguous amber kill switch. This is _not_
checkpoint Continue
([resumable-checkpoint-jobs](resumable-checkpoint-jobs.md)), browser
disconnect ([detachable-long-run](detachable-long-run.md)), or HITL
approve/reject ([grok-feed](grok-feed.md) S3).

## UX scenarios

### S1 — Hard Stop cancels the run

**Who:** Operator mid-run on a chat-style or plain workflow.

**Want:** Kill the job immediately — no course-correction mode.

**Do:** Press rose **Stop** in the composer footer.

**Expect:**

- Run MUST end in a cancelled / stopped outcome (interrupt `'cancel'`).
- Composer MUST leave running chrome (`working . . .` / Pause / Steer).
- Feed MUST show a clear cancel / settle signal — MUST NOT enter Steer mode.
- Hard Stop MUST NOT create a checkpoint resume point by itself (see
  [resumable-checkpoint-jobs](resumable-checkpoint-jobs.md) S3).

### S2 — Pause soft-interrupts without killing the workflow

**Who:** Operator mid-agent-turn who wants to redirect, not abort.

**Want:** Soft interrupt; keep the workflow alive.

**Do:** Press amber **Pause** while the run is active (no HITL gate required).

**Expect:**

- Composer MUST leave quiet `working . . .` and enter **Steer** chrome
  (status strip + feedback textarea).
- Workflow MUST remain alive — MUST NOT tear down like hard Stop.
- Rose **Stop** MUST remain available from Steer.
- Soft-pause is **per-node** (not a global run pause): `{ kind: 'pause' }` on
  inventory `steerControl` for the **last feed section**'s working agent
  (ADR-032) — shipped with epic 36; feed-scoped target supersedes fan-out.

#### S2b — Two working agents (A and B)

**Who:** Operator with parallel agent turns in one run.

**Want:** Pause the agent currently last in the feed without stopping siblings.

**Do:**

1. A and B both work; last feed section is **A** → press **Pause**.
2. A enters Steer await; **B keeps working** and becomes last in the feed.
3. Press **Pause** again → soft-pause **B** (second HITL tab).

**Expect:**

- First Pause MUST open HITL/Steer for **A only**.
- B MUST continue until a second Pause (or its own settle).
- Two tabs appear only after intentional sequential Pause (or mix with gates) —
  MUST NOT fan out Pause to every working agent on one click.

### S3 — Steer feedback then continue

**Who:** Operator after S2.

**Want:** Correct the agent and continue the same run.

**Do:** Type a correction; press **Send feedback** or **Resume**.

**Expect:**

- Run MUST continue without a full graph restart from cold Start.
- Feed MUST show the correction as a user-side bubble / turn.
- Steer chrome MUST clear after send / resume.
- Steer MUST NOT invent an auto-checkpoint Continue path.

### S4 — Stop from Steer still hard-cancels

**Who:** Operator in Steer mode who decides to abandon.

**Want:** Same terminal outcome as S1.

**Do:** Press rose **Stop** from Steer.

**Expect:**

- Outcome MUST match S1 (hard cancel).
- MUST NOT leave an orphan Steer surface after settle.

### S5 — Running chrome is quiet

**Who:** Operator during an active run before Pause (no open HITL).

**Want:** Orientation without “locked” / field-label chrome.

**Do:** Watch the composer while the agent works.

**Expect:**

- Composer MUST show centered `working . . .`.
- Footer MUST place **Stop** (rose) left and **Pause** (amber) right with
  `lf-hover-tip` chips (`Stop — cancel run` top-left; `Pause — soft interrupt`
  top-right by default; after **10s** with no output from the pausable agent,
  Pause tip MAY read `API quiet — Pause to nudge` without auto-pausing).
- Active LLM feed containers MUST show a muted liveness phase line; after 10s
  quiet, append `last event Ns ago` (observation only).
- MUST NOT show Goal / Message / Feedback field labels.
- MUST NOT use a single amber Stop in a shared Start/Stop primary slot
  (that layout is retired — see [feed-panel](../features/feed-panel.md)).

### S6 — Recoverable provider failure does not kill Steer

**Who:** Operator whose local/cloud provider hangs or returns HTTP 5xx during a
long agent turn.

**Want:** Understand the failure and continue without restarting the workflow.

**Expect:**

- Idle/5xx/network failures MUST emit a sanitized **`recovery`** notice
  (`feed.role: 'recovery'`) — visible in the feed, not buried as Tool detail.
- The LLM retries from its committed round checkpoint; partial streamed text
  remains telemetry and MUST NOT be committed as completed history.
- After retry exhaustion the node MUST remain alive in a Steer/Resume await and
  the Steer composer MUST open (same fold as Pause).
- Authentication/configuration failures remain terminal errors.

Idle / hung streams, token dead loops, and HTTP 429 / 5xx / network after
the short transient budget: strategy in
[LLM_RECOVERY](../LLM_RECOVERY.md). Default autokick aborts the provider
stream, waits with `1 → 2 → 4 → 8 → 16` min backoff, and pins a `'retry'`
banner on the open visit header that ticks from `lastAttemptAt` /
`nextAttemptAt` on the existing liveness clock. HTTP join is wait-only (no
kick user turn, no penalty bump). `'retry'` does **not** open Steer. Steer
opens on Pause or when autokick is off / a finite cap is exhausted
(`'suspended'`).

## UI specs

| Spec                                                    | Scenarios covered                                                                                                                                                                                                               |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Feed panel](../features/feed-panel.md)                 | [S1](#s1--hard-stop-cancels-the-run), [S2](#s2--pause-soft-interrupts-without-killing-the-workflow), [S3](#s3--steer-feedback-then-continue), [S4](#s4--stop-from-steer-still-hard-cancels), [S5](#s5--running-chrome-is-quiet) |
| [HITL chat](../features/hitl-chat.md)                   | [S2](#s2--pause-soft-interrupts-without-killing-the-workflow), [S3](#s3--steer-feedback-then-continue), [S4](#s4--stop-from-steer-still-hard-cancels)                                                                           |
| [Workflow execution](../features/workflow-execution.md) | [S1](#s1--hard-stop-cancels-the-run), [S2](#s2--pause-soft-interrupts-without-killing-the-workflow), [S3](#s3--steer-feedback-then-continue), [S4](#s4--stop-from-steer-still-hard-cancels)                                     |

Visual normalize target (not a feature file): [`docs/palette.html`](../palette.html) §8 specimens 5–6.

## Runtime requirements

| Need                                          | Why (scenario)                                                                                                                                  | Today                                                                                                                                                                  | Caution                                                                                                                  |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Hard cancel via interrupt `'cancel'`          | [S1](#s1--hard-stop-cancels-the-run), [S4](#s4--stop-from-steer-still-hard-cancels)                                                             | **Shipped** (rose Stop)                                                                                                                                                | —                                                                                                                        |
| Soft-pause via hidden `steerControl`          | [S2](#s2--pause-soft-interrupts-without-killing-the-workflow), [S2b](#s2b--two-working-agents-a-and-b), [S3](#s3--steer-feedback-then-continue) | **Shipped** — [ADR-032](../ADR.md#adr-032--soft-pause-via-hidden-steercontrol-hitl-port); **per-node** last feed section                                               | Port must be **`single`**; do not fan out Pause to all working agents; do not fake Pause with cancel; not ctx runControl |
| Send steers active turn (`{ kind: 'steer' }`) | [S3](#s3--steer-feedback-then-continue)                                                                                                         | **Shipped**                                                                                                                                                            | Not checkpoint Continue; not graph `feedback`                                                                            |
| HITL fold opens on `pause` / closes on Send   | [S2](#s2--pause-soft-interrupts-without-killing-the-workflow), [S2b](#s2b--two-working-agents-a-and-b)                                          | **Shipped**                                                                                                                                                            | Payload-aware; do not close on pause value; tabs after sequential Pause only                                             |
| Feed draft → tool → new draft                 | density / epic 34                                                                                                                               | **Shipped** (unit)                                                                                                                                                     | Live-provider density still Partial in grok-feed                                                                         |
| Provider idle/5xx → retry or Steer await      | [S6](#s6--recoverable-provider-failure-does-not-kill-steer)                                                                                     | **Shipped** (unit/scripted); idle/dead-loop **autokick**; 429/5xx/network join autokick wait after the transient budget; pinned feed banner ticks from `livenessNowMs` | live proof + TBD-008 still open                                                                                          |

## Status

### Missing parts

| Layer  | Gap                                                            | Sn    | Done when                                  |
| ------ | -------------------------------------------------------------- | ----- | ------------------------------------------ |
| Live   | Real-LLM Implementable bar for Pause → Steer → continue        | S2–S3 | Live provider proof (see TESTING live gap) |
| Live   | Real-provider 5xx/idle → Steer → continue                      | S6    | Live provider proof; no raw HTML in feed   |
| Manual | Two-browser-tab awaiting sync (bus facts; drafts stay per-tab) | S5    | Operator Test Case 5                       |

### Workarounds

- _(none for shipped Stop / Pause / Steer / composer shell)_

### Demo / CI

- Reactive provider/Steer coverage in `observe-provider-stream.test.ts` and
  `run-agent-loop.test.ts`; composer footer modes in
  `composer-footer-mode.test.ts`; manual palette §8 specimens still recommended.
- Related: [grok-feed](grok-feed.md) density; [resumable-checkpoint-jobs](resumable-checkpoint-jobs.md)
  S3; [detachable-long-run](detachable-long-run.md) S1 (disconnect ≠ Pause).
