---
kind: bug
owner: docs
covers: []
status: current
date: 2026-06-16
flaw: Terminal outcomes are multipl...
package: ui
fixed: yes
---

### BUG-2026-06-16 — duplicate “Run cancelled” in work log

| Field                  | Value                                                                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-06-16                                                                                                                             |
| **Area**               | ui · execution                                                                                                                         |
| **Status**             | fixed                                                                                                                                  |
| **Symptom**            | Stopping a run showed “Run cancelled” twice in the work log.                                                                           |
| **Repro**              | Stop workflow while Ask User (or any node) is active; observe work log.                                                                |
| **Root cause**         | Cancel surfaced both as `execution.node.failed` on the waiting node and as `execution.progress` failed banner text.                    |
| **Fix**                | Shared `RUN_CANCELLED_MESSAGE`; skip failed-node timeline append for cancel; single system line via `appendRunCancelledNotice()`.      |
| **Design flaw signal** | **Terminal outcomes are multiplexed** — node failure and run progress are separate channels without a shared “cancelled” discriminant. |
| **Regression test**    | `none` (UI behaviour; covered indirectly by execution cancel flow)                                                                     |
