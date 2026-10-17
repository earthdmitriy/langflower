---
kind: bug
owner: docs
covers: []
status: current
date: 2026-07-30
flaw: UI state for a server-owned g...
package: ui
fixed: yes
---

### BUG-2026-07-30 — Permission-ask amber cue stayed after Allow

| Field                  | Value                                                                                                                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-07-30                                                                                                                                                                                         |
| **Area**               | ui · hitl · feed                                                                                                                                                                                   |
| **Status**             | fixed                                                                                                                                                                                              |
| **Symptom**            | Yellow `Permission: …` work-log cue remained after the user clicked Allow                                                                                                                          |
| **Repro**              | Run agent → tool permission ask → Allow in composer → cue still visible in feed                                                                                                                    |
| **Root cause**         | Two independent UI folds cleared on local `permissionResolveLocal$`; the client could hide an ask before the server accepted a valid reply, and tabs could diverge.                                |
| **Fix**                | Server broadcasts `runner.permission.accepted` only after `PendingPermissionAsks.reply()` consumes a valid pending ask. Feed and composer pending folds remove the matching ask only on that fact. |
| **Design flaw signal** | UI state for a server-owned gate must reduce authoritative bridge facts, not optimistic local requests.                                                                                            |
| **Regression test**    | `packages/ui/src/app/features/composer/tests/execution-permission-fold.test.ts`; feed: `packages/ui/src/app/features/feed-folding/tests/execution-feed.service-permission.test.ts`                 |
