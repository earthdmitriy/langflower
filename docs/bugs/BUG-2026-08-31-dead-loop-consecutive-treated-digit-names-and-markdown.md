---
kind: bug
owner: docs
covers: []
status: current
date: 2026-08-31
flaw: A loop detector that treats t...
package: common-nodes
fixed: yes
---

### BUG-2026-08-31 — Dead-loop consecutive treated digit names and markdown rules as loops

| Field                  | Value                                                                                                                                                                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-08-31                                                                                                                                                                                                                                                                |
| **Area**               | common-nodes · llm-loop                                                                                                                                                                                                                                                   |
| **Status**             | fixed                                                                                                                                                                                                                                                                     |
| **Symptom**            | Autokick `dead loop` aborted a Civitai top-images draft on creator `b11111` / `b1111111111`. Doubling Inspector consecutive (5→10) and cyclic knobs only delayed the abort to exactly 10 ones. Markdown table rules (`\| ---… \|`) were the same class of false positive. |
| **Repro**              | Stream one SSE delta per character: `"b"` then `"1"` × N, or `"-"` × 66. Default detector aborts at N = `consecutiveThreshold`.                                                                                                                                           |
| **Root cause**         | Each provider chunk is one detector token. Consecutive counted identical **chunks**, not “too many ones in a name”. Local tokenizers emit `"1"` / `"-"` one at a time. Raising `consecutiveThreshold` would also delay real `hello`×5 loops.                              |
| **Fix**                | Letter-bearing deltas (length ≥ 2) still use `consecutiveThreshold` (5). Punctuation/digit/1-char runs use `structuralRunCap` (128). Cyclic patterns whose joined text has no Unicode letter are ignored.                                                                 |
| **Design flaw signal** | A loop detector that treats tokenizer granularity as token identity will fire on any repeated structural character. Threshold knobs cannot separate “username of digits” from “word stuck in a loop” without a content class.                                             |
| **Regression test**    | `packages/common-nodes/src/ai/features/llm-loop/dead-loop-detector.test.ts` — digit username, dash rule, `---` token, markdown separator row; still catches `hello`/`the`/paragraph/`1`×128                                                                               |
