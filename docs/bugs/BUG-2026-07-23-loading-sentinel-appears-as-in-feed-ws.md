---
kind: bug
owner: docs
covers: []
status: current
date: 2026-07-23
flaw: Identity of Symbols across du...
package: runtime
fixed: yes
---

### BUG-2026-07-23 — loading sentinel appears as `{}` in feed / WS

| Field                  | Value                                                                                                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-07-23                                                                                                                                                                                                                            |
| **Area**               | runtime · ws · feed                                                                                                                                                                                                                   |
| **Status**             | fixed                                                                                                                                                                                                                                 |
| **Symptom**            | Workflow `line` (and others) show a spurious `{}` row in the feed before the real string value; WS `runner.output-emitted` has `state:'value'` and `value:{}`.                                                                        |
| **Repro**              | Run demo-project workflow `line`; inspect feed and WS log for the string node output.                                                                                                                                                 |
| **Root cause**         | `@rx-evo` loading sentinel `{ state: Symbol(loading) }` was misclassified as success when CJS/ESM dual-package instances made `isLoading` return false. JSON drops the Symbol → `{}` on the bus; Preview stringifies it for the feed. |
| **Fix**                | Structural `isSymbolStateSentinel` (`{ state: Symbol }`) in `resolveSignalState` / edge filter / `isConnectionInactive`; `filter(isEdgeForwardable)` so sentinel/error never forward on edges (see also ADR-028).                     |
| **Design flaw signal** | **Identity of Symbols across dual packages** — status guards that rely on Symbol identity are unsafe when the same package can load twice (CJS vs ESM). Prefer structural checks or a single resolution path for `@rx-evo`.           |
| **Regression test**    | `packages/runtime/src/testing/workflows/empty-object-string.workflow.test.ts`                                                                                                                                                         |
