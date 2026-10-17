---
kind: bug
owner: docs
covers: []
status: current
date: 2026-07-23
flaw: Two sources of identity
package: server
fixed: yes
---

### BUG-2026-07-23d — Copied workflow JSON appears twice / wrong id

| Field                  | Value                                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Date**               | 2026-07-23                                                                                                                                                         |
| **Area**               | server · workflow · catalog                                                                                                                                        |
| **Status**             | fixed                                                                                                                                                              |
| **Symptom**            | Copy-pasting a workflow file (same `metadata.id`, new filename) listed the workflow twice or loaded the wrong file because catalog id came from embedded metadata. |
| **Repro**              | Duplicate `fake-llm.json` as `fake-llm-copy.json` without changing `metadata.id` → catalog shows colliding ids.                                                    |
| **Root cause**         | Identity lived inside JSON while the filesystem already keyed `{id}.json`.                                                                                         |
| **Fix**                | ADR-029: omit identity from disk JSON; bridge/session use sibling `workflowId` (= filename stem); no metadata hydrate.                                             |
| **Design flaw signal** | **Two sources of identity** (filename vs embedded id) — pick the filesystem key; never mirror it inside the file.                                                  |
| **Regression test**    | `packages/server/src/workflow/workflow.service.test.ts` — filename stem → `workflowId`; save omits identity from JSON                                              |
