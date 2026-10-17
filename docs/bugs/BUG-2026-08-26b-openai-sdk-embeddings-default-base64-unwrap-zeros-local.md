---
kind: bug
owner: docs
covers: []
status: current
date: 2026-08-26
flaw: Embeddings are not chat: the...
package: common-nodes
fixed: yes
---

### BUG-2026-08-26b — OpenAI SDK embeddings default base64 unwrap zeros local vectors

| Field                  | Value                                                                                                                                                                                                                                                                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-08-26                                                                                                                                                                                                                                                                                                                         |
| **Area**               | common-nodes · embeddings                                                                                                                                                                                                                                                                                                          |
| **Status**             | fixed                                                                                                                                                                                                                                                                                                                              |
| **Symptom**            | hello-embed ingest completed; sqlite stored dim-256 vectors with L2-norm 0. KB search returned arbitrary top-K hits at `score: 0.00`.                                                                                                                                                                                              |
| **Repro**              | Settings default embedding model (local OpenAI-compatible). Run **KB ingest**, then **KB manual search**. First ingest progress dump: `rawCtor: Float32Array`, `rawLen: 256`, `rawNorm: 0`, `embedTextLen: 447`.                                                                                                                   |
| **Root cause**         | openai-node `embeddings.create` without `encoding_format` defaults to `base64` (PR 1312) and then `toFloat32Array` on the body. Local servers ignore the param and return JSON `number[]`; the unwrap still runs and yields a zero typed array. Chat `completions.create` has no such field. Text and `passage:` prefix were fine. |
| **Fix**                | Always pass `encoding_format: 'float'` so the SDK returns the JSON array as-is. Keep `toVectors` (numeric array / non-zero typed array). Zero-norm vectors throw.                                                                                                                                                                  |
| **Design flaw signal** | Embeddings are not chat: the SDK’s default encoding path is a second contract. Call embeddings with an explicit `encoding_format`; treat a zero vector as a hard failure, not a valid dim probe.                                                                                                                                   |
| **Regression test**    | `packages/common-nodes/src/embeddings/create-embedding.test.ts` — `encoding_format: 'float'` on create body; reject `{ length }` objects; reject zero-norm vectors                                                                                                                                                                 |
