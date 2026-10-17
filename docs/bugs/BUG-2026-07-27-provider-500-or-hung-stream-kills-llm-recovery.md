---
kind: bug
owner: docs
covers: []
status: current
date: 2026-07-27
flaw: Recoverable domain failure en...
package: common-nodes
fixed: yes
---

### BUG-2026-07-27 — provider 500 or hung stream kills LLM recovery

| Field                  | Value                                                                                                                                                                                                                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-07-27                                                                                                                                                                                                                                                                                |
| **Area**               | common-nodes · LLM · RxJS · provider recovery                                                                                                                                                                                                                                             |
| **Status**             | fixed                                                                                                                                                                                                                                                                                     |
| **Symptom**            | A provider HTTP 500 (often an HTML body from LM Studio) terminates the LLM node; subsequent Pause/Steer or interrupt + go cannot recover. A provider that stops emitting can wait forever.                                                                                                |
| **Repro**              | Run a multi-turn OpenAI-compatible workflow; make the provider throw `{ status: 500, message: "<html>…" }` or return a stream that never emits/completes; try Pause then Steer.                                                                                                           |
| **Root cause**         | Two imperative async-IIFE Observable bodies consumed provider streams with `for await`; exceptions called `subscriber.error`, permanently terminating the StatefulObservable cycle, while no idle boundary existed. Session history/counters were separately mutated in `tap` / closures. |
| **Fix**                | Shared `runLlmLoop` `expand` machine + typed provider RxJS facts, idle watchdog, checkpointed retries/suspension, sanitized diagnostics, bounded sequential tool/Sub-Agent effects; shared `runLlmSessionMachine` `mergeScan` owns history and queued turns.                              |
| **Design flaw signal** | **Recoverable domain failure encoded as stream death** — external provider availability is a loop fact, not automatically an Observable terminal error. Commit history only at explicit checkpoints and reserve the error lane for fatal authentication/configuration/protocol failures.  |
| **Regression test**    | `ai/features/llm-loop/operators/observe-provider-stream.test.ts` (idle/Pause/500), `ai/features/llm-loop/run-agent-loop.test.ts` (500 → Steer → continue), `ai/features/llm-session/run-session-machine.test.ts` (queued immutable history), migrated Review/tool-loop tests.             |
