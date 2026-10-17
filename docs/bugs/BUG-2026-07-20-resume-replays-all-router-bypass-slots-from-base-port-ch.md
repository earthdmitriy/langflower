---
kind: bug
owner: docs
covers: []
status: current
date: 2026-07-20
flaw: Bypass slot identity split th...
package: runtime
fixed: yes
---

### BUG-2026-07-20 — Resume replays all router bypass slots from base port `ch`

| Field                  | Value                                                                                                                                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-07-20                                                                                                                                                                                                                                                    |
| **Area**               | runtime · checkpoints · resume                                                                                                                                                                                                                                |
| **Status**             | fixed                                                                                                                                                                                                                                                         |
| **Symptom**            | Stop mid-`common-delay` on Router→Delay graph → Continue finishes immediately instead of waiting remaining/full delay                                                                                                                                         |
| **Repro**              | Demo `example.json` (String+Number→Router→Delay→Preview→Finish): Run → Stop during Delay → Continue. Unit: `packages/runtime/src/resume.workflow.test.ts` (`replays distinct router bypass slot snapshots…`)                                                  |
| **Root cause**         | Checkpoint stores bypass slots as `ch` / `ch@1` / …; resume `watchedByKey` for edge `slotKey(router, 'ch', n)` looks up `outputSnapshots.get('ch')` for every slot, so Delay.`delay` gets the string from `ch` and RxJS `delay(non-number)` collapses to ~1ms |
| **Fix**                | `bypassOutputPortId` + resume snapshot/telemetry lookup by `ch` / `ch@n` in `runtime-runner.wireScope`; identity API later centralized (see BUG-2026-07-22b)                                                                                                  |
| **Design flaw signal** | Bypass slot identity split three ways (edge `[base, index]`, outputs map `ch@n`, checkpoint key `ch@n`) without a single resume keying rule                                                                                                                   |
| **Regression test**    | `packages/runtime/src/resume.workflow.test.ts` — bypass Delay + merge/combine multi-input resume cases                                                                                                                                                        |
