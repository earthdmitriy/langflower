---
kind: bug
owner: docs
covers: []
status: current
date: 2026-07-23
flaw: Persisted defaults ≠ live def...
package: server
fixed: yes
---

### BUG-2026-07-23c — Fake LLM stalls on load when persisted `inputs: {}`

| Field                  | Value                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-07-23                                                                                                                                                                                                                                                                                                                                                |
| **Area**               | server · runtime · workflow · fake-llm                                                                                                                                                                                                                                                                                                                    |
| **Status**             | fixed                                                                                                                                                                                                                                                                                                                                                     |
| **Symptom**            | Demo `fake-llm` receives `userPrompt: "Hello"` then never emits reasoning/response (`runner` stays running). Recreating the Fake LLM node “fixed” it; `git restore` of the workflow + reload brought the stall back.                                                                                                                                      |
| **Repro**              | Load HEAD `demo-project/.../fake-llm.json` (`common-fake-llm` with `"inputs": {}`) → Run → WS: string/Hello → Fake LLM `userPrompt` value, no Fake LLM outputs.                                                                                                                                                                                           |
| **Root cause**         | (1) Load materialize only `connect`'d keys present in JSON — empty `inputs` left inventory ports (`tools`/`mcp`/…) inactive so `combineInputs` never emitted. (2) Recreate baked `defaultInputsFromDefinition` into JSON, masking the hole. (3) Dual-package `@rx-evo` made `isInactive` miss ESM inactive sentinels so `applyPortDefaults` also skipped. |
| **Fix**                | ADR-028: persist only visible overrides ≠ default; materialize injects _current_ definition defaults for missing keys; normalize strip on load/save; structural Symbol sentinel for inactive/loading in `runtime-runner`.                                                                                                                                 |
| **Design flaw signal** | **Persisted defaults ≠ live defaults** — baking `defaultValue` into workflow JSON couples upgrades to disk and hides runtime seed failures. Empty `inputs` must be a first-class, working contract.                                                                                                                                                       |
| **Regression test**    | `packages/server/src/workflow/empty-inputs-fake-llm.materialize.test.ts`; `workflow-persisted-inputs.test.ts`; `apply-editor-mutation.test.ts` (add omits default inputs)                                                                                                                                                                                 |
