---
kind: bug
owner: docs
covers: []
status: current
date: 2026-08-17
flaw: Do not use a hot Subject + fe...
package: common-nodes
fixed: yes
---

### BUG-2026-08-17 — Sub-Agent invoke returned a silent empty string

| Field                  | Value                                                                                                                                                                                                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-08-17                                                                                                                                                                                                                                                                                                                            |
| **Area**               | execution · common-nodes                                                                                                                                                                                                                                                                                                              |
| **Status**             | fixed                                                                                                                                                                                                                                                                                                                                 |
| **Symptom**            | Parent agent could call the Writer Sub-Agent tool; `invoke` came back as `''` with no `Error:` / timeout text. Two argument shapes, same no-op.                                                                                                                                                                                       |
| **Repro**              | Starter graph Helper → Writer. Ask Helper to ping Writer with a trivial task. Writer `toolLog` showed the call; the tool result was empty.                                                                                                                                                                                            |
| **Root cause**         | Sub-Agent RPC was `Subject.next(InvokeTurn)` into `createLlmSessionCycle$` (hot Subject + `switchMap` on `context$`). Completing the waiter copied inner `{ kind: 'response', text }` even when that text was `''` (reasoning-only streams, empty `done`, no draft). A dropped `next()` hung until timeout instead of failing closed. |
| **Fix**                | `enqueueInvoke` runs `runSubAgentTurn` directly (serial queue, local history). Feed ports still demux a chunk `Subject`. `invokeDone` uses response, else last draft, else last reasoning; still blank → `Error: Sub-Agent returned no content`. `refreshLiveWiredToolPacks` also peeks `subagent-registration`.                      |
| **Design flaw signal** | Do not use a hot Subject + feedback session machine as an RPC. Do not treat empty `response` as a successful tool result.                                                                                                                                                                                                             |
| **Regression test**    | `packages/common-nodes/src/ai/nodes/sub-agent/node.test.ts` (empty `done`; reasoning-only then empty `done`); `packages/server/src/bridge/get-live-wired-tools.test.ts`                                                                                                                                                               |
