---
kind: bug
owner: docs
covers: []
status: current
date: 2026-06-17
flaw: Stream conflated with wire type
package: ui
fixed: yes
---

### BUG-2026-06-17 — stream output ports blocked on canvas

| Field                  | Value                                                                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-06-17                                                                                                                             |
| **Area**               | ui · shared · execution                                                                                                                |
| **Status**             | fixed                                                                                                                                  |
| **Symptom**            | Cannot wire from LLM/Agent `thoughts`, `draftResponse`, or other `stream: true` outputs.                                               |
| **Repro**              | Drag edge from Agent `draftResponse` to Preview `text` — connection rejected.                                                          |
| **Root cause**         | `diagram.config.ts` rejected all `isStreamOutputPort` sources; `normalizeNodeOutput` omitted stream ports from batch `nodeOutputs`.    |
| **Fix**                | Validate stream outputs by wire type only; persist final accumulated stream value in `nodeOutputs` for downstream `resolveNodeInputs`. |
| **Design flaw signal** | **Stream conflated with wire type** — runtime streaming flag was treated as “not a real port” in canvas and batch cache.               |
| **Regression test**    | `packages/shared/src/validators/connection-validator.test.ts`, `packages/shared/src/normalize-node-output.test.ts`                     |
