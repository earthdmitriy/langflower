---
kind: adr
owner: docs
covers: []
status: current
id: ADR-018
supersedes: []
superseded-by: []
package: docs
---

## ADR-018 — Durable workflow checkpoints

**Status:** accepted · **Date:** 2026-07-19 · **Amended:** 2026-07-21
(decision D) · **Store superseded:** 2026-10-14 by
[ADR-040](./040-workflow-sessions-own-points.md)

The explicit-boundary rule in this ADR stays (`common-checkpoint` or
`createCheckpoint: true`). The run-directory store
(`.langflower/runs/<workflowId>/<runId>/checkpoint.json`), the bus keys
`runner.checkpoints.snapshot`, `runner.checkpointed`, and
`runner.checkpoint.discard.requested`, and resume code `STALE_WORKFLOW`
do not. Resume is `runner.resume.requested` with `{ pointId }` on a
workflow session.

**Context:** Long multi-stage jobs must survive Stop and process restart without
replaying finished stages. In-memory `eventLog` / WebSocket session state dies
with the process. Epic 14 landed a store + `RuntimeRunner.resume` overlay, but
**auto persist on every completed node / Stop** produced confusing Continue UX
on trivial graphs. Product direction: **explicit** checkpoint boundaries and a
**checkpoint picker**.

**Alternatives considered:**

- **A — Persist only the feed event log and replay on reconnect** — restores UI
  chrome, but does not skip completed nodes or seed downstream after restart.
- **B — Reuse `startNode` weakly-connected cluster as “Continue”** — wrong
  scope (not directional resume) and re-runs completed upstream.
- **C — Auto durable checkpoint on every completed node + Stop** _(landed, then
  rejected)_ — store + resume overlay work, but Continue appears without
  author intent.
- **D — Explicit checkpoint node / port flag + picker UX** — author places
  boundaries; operator chooses which checkpoint to continue from.

**Decision (D — accepted):**

1. Keep path/schema/resume overlay from C:
   `.langflower/runs/<workflowId>/<runId>/checkpoint.json`;
   `schemaVersion: 1` + `workflowFingerprint`; JSON-safe values only;
   `RuntimeRunner.resume` skip + snapshot replay.
2. **Persist only at explicit boundaries** — when an output with
   `createCheckpoint: true` emits (primary authoring: `common-checkpoint`
   passthrough node; advanced escape: the same flag on any output meta).
   Optional human-readable `label` from node `inputs.label`, else
   `checkpointLabel` meta, else canvas `ui.label`.
3. **Stop without a prior boundary does not write** a resumable checkpoint.
   Stop/complete after a boundary updates the existing run snapshot
   (`stopped` / `completed`).
4. **Picker UX** — on load, `runner.checkpoints.snapshot` lists labeled
   summaries (time, status, label, stale/corrupt). Operator Continues from a
   chosen entry, Discards, or Runs fresh — not latest-only Continue.
5. Fingerprint mismatch → summary `stale: true`; resume →
   `runner.resume.failed` (`STALE_WORKFLOW`) + Discard. Corrupt → same with
   `CORRUPT`.
6. WS channels: `runner.resume.*`, `runner.checkpoints.snapshot`,
   `runner.checkpointed`, `runner.checkpoint.discard.requested`.
7. Auto every-node / every-Stop persist (alternative C) remains rejected.

**Tradeoffs accepted:**

- (+) Author-visible boundaries; no surprise Continue on short runs.
- (+) Multi-entry picker; labeled history per workflow.
- (−) One checkpoint file per run (latest boundary for that run); picking
  among boundaries inside one continuous run is not a separate history yet.
- (−) HITL / Memory still out of payload.

**Consequences:**

- Server: `RunCheckpointSession` accumulates always; persists on boundary /
  post-boundary Stop; bootstrap and workflow-load broadcast resumable lists.
- UI: `lf-continue-button` is a checkpoint picker.
- Demo `checkpoint-resume` + integration
  `execute-checkpoint-resume.ws.test.ts` exercise the explicit contract.
- Use-case
  [resumable-checkpoint-jobs](../product/use-cases/resumable-checkpoint-jobs.md)
  Ready under explicit boundaries (Status flip owned by
  orchestrator).

**Revisit trigger:** Multi-boundary history within one run, or durable HITL /
Memory in the same checkpoint payload.

---
