---
kind: bug
owner: docs
covers: []
status: current
date: 2026-08-06
flaw: Heavy project I/O must not pi...
package: server
fixed: yes
---

### BUG-2026-08-06 — Agent `grep` froze the server (Node walk on main thread)

| Field                  | Value                                                                                                                                                                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-08-06                                                                                                                                                                                                                 |
| **Area**               | tools · execution · server                                                                                                                                                                                                 |
| **Status**             | fixed                                                                                                                                                                                                                      |
| **Symptom**            | After `→ grep …` on Plan `toolLog`, HTTP/WS stopped responding for minutes; later `← grep: Error: Tool grep timed out after 60000ms` with wall clock ≫ 60s.                                                                |
| **Repro**              | Run Plan/agent with builtin `grep` over a large tree / heavy regex; observe server unresponsive until JS yields, then RxJS tool timeout.                                                                                   |
| **Root cause**         | Builtin `grep` used an in-process Node walk + sync `regex.test` per line on the main server event loop. `toolTimeoutMs` only unsubscribed the Observable and could not fire (or abort work) while JS was stuck.            |
| **Fix**                | ts-scan-style cascade: async `rg` → async `grep` → bounded Node walk (yields, file/byte/line caps, symlink skip); thread `AbortSignal` from `runLlmLoop` tool timeout/cancel through harness to kill children / stop walk. |
| **Design flaw signal** | Heavy project I/O must not pin the Node event loop; Observable timeout is not cancellation — builtins need AbortSignal (or a child process that can be killed).                                                            |
| **Regression test**    | `packages/tools/src/builtins/grep/search.test.ts`                                                                                                                                                                          |
