---
kind: bug
owner: docs
covers: []
status: current
date: 2026-07-19
flaw: Documented “OpenCode-style” g...
package: docs
fixed: yes
---

### BUG-2026-07-19c — Role preset `{md,mdx}` globs never matched

| Field                  | Value                                                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-07-19                                                                                                 |
| **Area**               | tools · permissions · llm-presets                                                                          |
| **Status**             | fixed                                                                                                      |
| **Symptom**            | Plan/Explorer `write`/`create` of `*.md` outside `docs/**` was deny-closed with no `permission.ask`        |
| **Repro**              | Plan preset + harness `write` `plans/fix.md` in basic-coder pilot CI                                       |
| **Root cause**         | Preset used `**/*.{md,mdx}`; `matchPermissionPattern` has no brace expansion, so only `*` (`deny`) matched |
| **Fix**                | Split into `**/*.md` + `**/*.mdx` in `llm-role-preset.ts`; docs aligned                                    |
| **Design flaw signal** | Documented “OpenCode-style” globs implied bash braces without implementing them in the matcher             |
| **Regression test**    | `tests/integration/ws/execute-basic-coder.ws.test.ts` (Plan write `plans/fix.md` emits `permission.ask`)   |
