---
kind: bug
owner: docs
covers: []
status: current
date: 2026-08-31
flaw: Object defaults on text inlin...
package: ui
fixed: yes
---

### BUG-2026-08-31 — Tool invoke args textarea showed `[object Object]` and could not be cleared

| Field                  | Value                                                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-08-31                                                                                                                                                                            |
| **Area**               | ui · canvas inline · tool-invoke                                                                                                                                                      |
| **Status**             | fixed                                                                                                                                                                                 |
| **Symptom**            | `args` on `common-tool-invoke` showed `[object Object]`. Clearing the field brought it back.                                                                                          |
| **Repro**              | Place Tool invoke (default `args`). Open inspector / canvas multiline. Delete the text.                                                                                               |
| **Root cause**         | `defaultValue: {}` + `asDisplayString` used `String(value)`. Persist strips blank strings, then the diagram row falls back to `defaultValue` again.                                   |
| **Fix**                | `asDisplayString` JSON-stringifies objects; `[object Object]` displays as empty. Invoke `args` default is `''` (same as MCP http headers). Parse treats that accident string as `{}`. |
| **Design flaw signal** | Object defaults on text inline controls are not a success token — they are a display/persist loop. Text fields need string defaults.                                                  |
| **Regression test**    | `packages/ui/src/app/components/lf-inline-field.test.ts` (`asDisplayString`); `packages/common-nodes/src/tools/tool-invoke/node.test.ts` blank / `[object Object]`                    |
