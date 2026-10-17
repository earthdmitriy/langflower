---
kind: bug
owner: docs
covers: []
status: current
date: 2026-07-19
flaw: Teardown assumed POSIX-like i...
package: server
fixed: yes
---

### BUG-2026-07-19d — Integration temp cleanup fails with ENOTEMPTY on Windows

| Field                  | Value                                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-07-19                                                                                                                                                    |
| **Area**               | testing · ws                                                                                                                                                  |
| **Status**             | fixed                                                                                                                                                         |
| **Symptom**            | Full `verify` fails 11 WS integration suites with `ENOTEMPTY` on `rmdir` of `tests/tmp/...` after tests already passed                                        |
| **Repro**              | `node build/tools/agent-run.mjs verify` on Windows after checkpoint-heavy WS suites                                                                           |
| **Root cause**         | `removeTempProject` used single-shot `fs.rm`; Windows still holds handles briefly after `server.close`. Node's `fs.rm` `{ maxRetries }` is ignored on Windows |
| **Fix**                | Retry loop with backoff in `tests/integration/helpers/temp-project.ts` for `ENOTEMPTY` / `EBUSY` / `EPERM` / `EACCES`                                         |
| **Design flaw signal** | Teardown assumed POSIX-like immediate unlink after close; durable run dirs (checkpoints) increase Windows handle lifetime                                     |
| **Regression test**    | none — harness flake; covered by re-running integration suite                                                                                                 |
