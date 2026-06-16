# Prompt refining

**Status:** Partial — epic 05 pilot landed; CI Fake proves Brief → draft
file → HITL approve → Finish, not prompt quality.

## Value

Turn a creative brief into a polished **image-generation prompt text file**
through an explicit draft → HITL QA → revise loop, then hand the `.md` to an
**external** image tool (Midjourney, SD WebUI, …) by paste/upload.
**Not** image generation, vision scoring, or API connectors inside Langflower.
**Not** a separate Write-File node after accept — the demo draft agent writes
`prompts/scene-01.md` in its tool loop before HITL.

## UX scenarios

### S1 — Start from a brief

**Who:** Author with a subject, mood, constraints, and generator dialect in mind.

**Want:** One graph that drafts a prompt for an external image tool — not a
chat thread they must scroll back through later.

**Do:** Configure a real LLM (e.g. LM Studio / `openai` in
`.langflower/langflower.jsonc`), start the demo project, load workflow
**Prompt refining** (`prompt-refining`), edit **Brief** if needed, **Run**.

**Expect:**

- Run MUST start Brief (`common-string`) → Draft prompt
  (`common-openai-llm`) → HITL QA → Done.
- Activity MUST be visible in [feed](../features/feed-panel.md) /
  [workflow execution](../features/workflow-execution.md).

### S2 — Draft writes the prompt file

**Who:** Same author watching the draft agent.

**Want:** A durable project file (`prompts/scene-01.md`) as the artifact —
not only a feed bubble.

**Do:** Let Draft prompt run its tool loop (`enabledToolIds`: `read` /
`write` / `create`).

**Expect:**

- Draft MUST write `prompts/scene-01.md` via harness `write` / `create`
  (demo system prompt targets that path).
- Draft tool budget in the demo MUST be `read` / `write` / `create` (no
  bash / delete claimed).
- Artifact MAY land **before** HITL accept (pilot timing) — Request changes
  can send the same draft node back to rewrite that path.
- MUST NOT claim Langflower renders or scores images.

### S3 — HITL QA: approve or request changes

**Who:** Reviewer at **HITL QA** after the draft response lands.

**Want:** Human gate on style, constraints, negatives, dialect fit — graph
`feedback`, not a vague “looks good?” in the same agent turn.

**Do:** Inspect `prompts/scene-01.md` (and the draft response). Approve, or
Request changes so feedback routes back to Draft prompt.

**Expect:**

- Gate MUST be `common-hitl-review-gate` on draft `response` → QA `result`.
- Request changes MUST use QA `feedback` → draft `feedback` (same draft
  node revises — **no** separate refine agent in the demo).
- Approve MUST pass QA `response` → Finish `value`.
- **Honesty:** demo does **not** wire `common-review` (LLM accept/feedback)
  or a post-accept Write-File node.

### S4 — Accept ends with a pasteable file

**Who:** Author after Approve.

**Want:** Run finishes with a text file ready to paste into Midjourney / SD /
similar — Langflower stops at the artifact.

**Do:** Approve at HITL QA; open `prompts/scene-01.md` and transfer it
manually into the external image UI.

**Expect:**

- Finish MUST end the run after Approve.
- Success criterion MUST be the project text file, not an in-app image.
- External image gen MUST stay out of scope for this use case.

### S5 — Re-run the refine loop

**Who:** Author iterating the same brief / file path.

**Want:** The same graph is re-runnable — not a one-off chat paste.

**Do:** Re-run **Prompt refining** (optionally edit Brief first).

**Expect:**

- Re-running MUST exercise Brief → Draft (file tools) → HITL QA → Finish
  again, including the feedback edge when Request changes is used.

## UI specs

| Spec                                                    | Scenarios covered                                                                                                                                        |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Feed panel](../features/feed-panel.md)                 | [S1](#s1--start-from-a-brief), [S2](#s2--draft-writes-the-prompt-file), [S3](#s3--hitl-qa-approve-or-request-changes), [S5](#s5--re-run-the-refine-loop) |
| [HITL chat](../features/hitl-chat.md)                   | [S3](#s3--hitl-qa-approve-or-request-changes), [S4](#s4--accept-ends-with-a-pasteable-file)                                                              |
| [Workflow execution](../features/workflow-execution.md) | [S1](#s1--start-from-a-brief), [S2](#s2--draft-writes-the-prompt-file), [S5](#s5--re-run-the-refine-loop)                                                |

## Runtime requirements

| Need                                           | Why (scenario)                                                                                                                                     | Today                                                         |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Real LLM on draft (`common-openai-llm`)        | Draft / revise prompt text ([S1](#s1--start-from-a-brief), [S2](#s2--draft-writes-the-prompt-file), [S3](#s3--hitl-qa-approve-or-request-changes)) | Landed; demo `providerId: lmstudio`                           |
| Harness tools `read` / `write` / `create`      | Persist `prompts/scene-01.md` ([S2](#s2--draft-writes-the-prompt-file))                                                                            | Landed (epic 01); `permission.ask` for write/create (epic 02) |
| `common-hitl-review-gate` + `feedback` → draft | Human QA / revise ([S3](#s3--hitl-qa-approve-or-request-changes))                                                                                  | Landed; wired in demo                                         |
| Finish after Approve                           | End run with pasteable artifact ([S4](#s4--accept-ends-with-a-pasteable-file))                                                                     | Landed                                                        |

No new runtime surface — optional Template scaffolds or `common-review`
beside HITL are authorable wiring, not on this demo graph.

## Workflow shape

Matches `demo-project/.langflower/workflows/prompt-refining.json`:

```mermaid
flowchart LR
  brief[Brief]
  draft[Draft prompt]
  qa[HITL QA]
  done[Done]

  brief --> draft
  draft --> qa
  qa -->|feedback| draft
  qa -->|response| done
```

Ports: Brief `value` → draft `userPrompt`; draft `response` → QA `result`;
QA `feedback` → draft `feedback`; QA `response` → Finish `value`. Draft
writes `prompts/scene-01.md` inside its tool loop. There is **no** separate
refine node and **no** Write-File node after Approve.

## Status

**Partial** — authorable/runnable pilot. CI Fake LLM + auto-Allow permissions

- HITL approve proves **topology and file write**, not live prompt quality.

**Implementable when** S1–S4 Expects pass on the demo with a **real** LLM
(file written, HITL feedback revises draft, Approve → Finish). Optional
Template / `common-review` wiring stays outside that bar unless added to the
demo.

### Missing parts

| Layer          | Gap                                                  | Scenarios | Done when                                                      |
| -------------- | ---------------------------------------------------- | --------- | -------------------------------------------------------------- |
| Demo / wiring  | Optional Template / dialect scaffolds (MJ vs SD)     | S1, S2    | Scaffold on demo **or** kept nice-to-have outside Expects      |
| Demo / wiring  | Optional `common-review` instead of / beside HITL QA | S3        | Second-model Review wired **or** kept outside Expects          |
| End-user proof | Real-LLM Approve → Finish path (not only CI Fake)    | S1–S4     | Live provider meets Expects; Fake CI stays topology/file-shape |

### Workarounds

- **Authorable / runnable Partial** — demo workflow below with LM Studio /
  configured `openai`; Allow `write`/`create` if `permission.ask` appears.
- Image generation remains intentionally out of scope — paste the `.md`
  into the external tool.

### Demo / CI

- Demo: `demo-project/.langflower/workflows/prompt-refining.json`
  (Brief → `common-openai-llm` draft with `read`/`write`/`create` →
  `common-hitl-review-gate` → Finish; feedback → draft)
- CI fake path: `tests/integration/ws/execute-prompt-refining.ws.test.ts`
  (Fake LLM writes `prompts/scene-01.md`, HITL approve → Finish; topology /
  artifact shape — not live provider quality)
- Epic: [05-partial-pilots](../DONE/EPICS/05-partial-pilots.md)

### Run path (end-user)

1. Start LM Studio (or configure `openai` in `.langflower/langflower.jsonc`).
2. `langflower start ./demo-project` (or `npm run dev` against the demo
   project).
3. Load workflow **Prompt refining** (`prompt-refining`).
4. **Run**. Allow `write`/`create` if the feed shows `permission.ask`.
5. At HITL QA, inspect `prompts/scene-01.md`, then Approve or Request
   changes (feedback → Draft prompt).
6. On Approve, Finish ends the run; paste the file into an external image
   tool.
