---
kind: bug
owner: docs
covers: []
status: current
date: 2026-07-21
flaw: Projection order ≠ chat chron...
package: ui
fixed: yes
---

### BUG-2026-07-21 — grok-feed timeline order + streaming wall

| Field                  | Value                                                                                                                                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Date**               | 2026-07-21                                                                                                                                                                                                                           |
| **Area**               | ui · feed · grok-feed                                                                                                                                                                                                                |
| **Status**             | fixed                                                                                                                                                                                                                                |
| **Symptom**            | (1) Settled turn showed result above technical rows — newest chat content not at the bottom. (2) Open reasoning/draft stream showed the full multi-line body while working.                                                          |
| **Repro**              | Run `basic-coder` / any agent with reasoning→result; inspect work log order and open technical block mid-stream.                                                                                                                     |
| **Root cause**         | `rowsForGroup` appended technical after result; streaming body always used full `sectionDisplayText` with `whitespace-pre-wrap`.                                                                                                     |
| **Fix**                | Chronological row order: technical → permission → result. Technical peek = last port in 4-line pane only while active; settled peek = one line (no leftover height). Node label above `details` summary. `<details>` default-closed. |
| **Design flaw signal** | **Projection order ≠ chat chronology** — grouping helpers must emit conversation-time order (oldest top / newest bottom), not “important first”.                                                                                     |
| **Regression test**    | `packages/ui/src/app/features/feed-folding/tests/flatten-feed-rows.test.ts`; peek copy: `packages/ui/src/app/features/feed/tests/format-feed-collapsed-preview.test.ts`. `feed-timeline.test.ts` is deleted.                         |
