---
kind: bug
owner: docs
covers: []
status: current
date: 2026-07-22
flaw: Parallel string encodings for...
package: runtime
fixed: yes
---

### BUG-2026-07-22b — Bypass slot identity still multi-keyed after resume fix

| Field                  | Value                                                                                                                                                                                                                                                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-07-22                                                                                                                                                                                                                                                                                                 |
| **Area**               | runtime · checkpoints · resume                                                                                                                                                                                                                                                                             |
| **Status**             | fixed                                                                                                                                                                                                                                                                                                      |
| **Symptom**            | Residual of BUG-2026-07-20: edge `[base,index]`, checkpoint/`tap` `ch@n`, and SlotKey `base@index` were converted ad-hoc — easy to regress the next resume/telemetry path.                                                                                                                                 |
| **Repro**              | Code audit (`docs/_archive/code-regression/runtime.md` finding #2); unit round-trip in `bypass-ports.test.ts`. Resume contract stays in `resume.workflow.test.ts`.                                                                                                                                         |
| **Root cause**         | Three encodings existed without a single conversion module; call sites could concat/`parse` `@` independently.                                                                                                                                                                                             |
| **Fix**                | Pure identity API in `packages/runtime/src/bypass-ports.ts` (`bypassOutputPortId` / `parseBypassOutputPortId` / `bypassSlotKey*` / `checkpointPortIdForSlot`); `wireScope` + `collectClusterSlotKeys` use it. UI `toSlotHandle` / `splitSlotHandle` re-export the same helpers from `@langflower/runtime`. |
| **Design flaw signal** | Parallel string encodings for one slot without a mandatory convert layer — same class as BUG-2026-07-20.                                                                                                                                                                                                   |
| **Regression test**    | `packages/runtime/src/bypass-ports.test.ts` — edge ↔ outputPortId ↔ SlotKey round-trip; existing resume/router tests                                                                                                                                                                                       |
