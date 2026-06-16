# Demo project

Local Langflower sandbox. Bootstrap creates `.langflower/` on first
`langflower start`.

**Demo workflow policy (current stage):** when node contracts change, it is OK
to **delete and re-create** `.langflower/workflows/*.json` from new instructions.
Prefer recreate over in-place JSON migration — cheaper and less error-prone
while demos are still evolving.

```bash
node build/tools/agent-run.mjs build-all
node packages/cli/bin/langflower.js start ./demo-project
```

Or from repo root after build:

```bash
npm run dev
```

## Soft vs hard harness debate

Default workflow: **Soft vs hard harness debate**
(`.langflower/workflows/soft-vs-hard-harness.json`).

1. Start [LM Studio](https://lmstudio.ai/) local server (`http://127.0.0.1:1234/v1`)
   and load a chat model. Match `provider.lmstudio` / node `model` in
   `.langflower/langflower.jsonc` (or pick another provider/model in the Inspector).
2. Open the app — the debate workflow should be active.
3. Press **Run**. Soft argues first; Hard replies; Soft revises via `feedback`.
   Soft’s `maxFeedbackTurns` caps the Soft↔Hard storm; there is **no finish node**.
4. Press **Stop** when you want the run to end (interactive loops do not
   auto-complete on idle — ADR-015).

## Adversarial red team (epic 08) — two conflict models

Two demos share Proposer / critique / Review personas; they differ in who
resolves the conflict:

| Workflow                            | Id                              | Conflict model                                                                                                                       |
| ----------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Adversarial — agree then Review** | `adversarial-agree-then-review` | Proposer ⇄ **Red-team Review** (`common-review`: `feedback`→Merge, `accept`→final Review). Single-output LLM cannot encode «agreed». |
| **Adversarial — Review each round** | `adversarial-review-each-round` | Each Proposer→Attacker round is `common-concat`'d into Review; no Attacker→Proposer auto-loop; Review `feedback` → Proposer          |

Same LM Studio / OpenAI setup as Soft↔Hard above.

1. Load either workflow; edit the task claim if you want.
2. **Run**. Watch Work log sequence for that model.
3. Review calls `accept` → Finish, or `feedback` → Proposer revise.

## Checkpoint resume (epic 20 / ADR-018 D)

Load **Checkpoint resume** (`checkpoint-resume`): Source → Stage A → Preview A
→ **Checkpoint** (“After stage A”) → Stage B (long delay) → Preview B → Finish.

1. **Run**, wait until Preview A / Checkpoint flash, then **Stop** during Stage B.
2. Restart the server (or reopen the project). The sidebar shows
   **Continue from…** with the labeled checkpoint.
3. **Continue** from that entry — Stage B / Preview B finish without redoing
   Stage A. **Discard** clears the resume option; **Run** starts fresh.

See [docs/use-cases/resumable-checkpoint-jobs.md](../docs/use-cases/resumable-checkpoint-jobs.md)
and [ADR-018](../docs/ADR.md#adr-018--durable-workflow-checkpoints).
CI: `tests/integration/ws/execute-checkpoint-resume.ws.test.ts`.

## Multi-role approval (parallel HITL gates)

Load **Multi-role approval** (`multi-role-approval`) for three parallel HITL
Review Gates (Security / Product / Legal labels).

1. **Run** — all three gates await at once (reactive multi-HITL by design).
2. Use composer tabs to answer each gate; approving one does not clear the others.
3. Downstream previews advance only after that gate's Approve.

## Partial pilots (epic 05)

Load these from the workflow topbar (or set `currentWorkflowId` in
`.langflower/langflower.jsonc`). Same LM Studio / OpenAI provider setup as above.

| Workflow id           | File                                             | What to expect                                                                 |
| --------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------ |
| `prompt-refining`     | `.langflower/workflows/prompt-refining.json`     | Brief → LLM (+ `write`) → HITL QA → Finish; artifact `prompts/scene-01.md`     |
| `article-writing`     | `.langflower/workflows/article-writing.json`     | Topic → outline/draft → HITL tone/fact → Finish; artifact `articles/draft.md`  |
| `coding-agent`        | `.langflower/workflows/coding-agent.json`        | Full S1–S7 multi-loop (AskUser, red-team, plan/result HITL, QA, common-review) |
| `basic-coder`         | `.langflower/workflows/basic-coder.json`         | Chat Input → Plan → Coder **smoke only** (not full coding-agent Value)         |
| `research-fanout`     | `.langflower/workflows/research-fanout.json`     | Axes → Loop → Explorer → merge Preview → synth → conflict Review → Finish      |
| `crawl-research`      | `.langflower/workflows/crawl-research.json`      | Two seed URLs → Fetch URL → Merge → Preview (epic 12; needs network)           |
| `obsidian-kb`         | `.langflower/workflows/obsidian-kb.json`         | Inbox → Frontmatter → Wikilinks → Build MOC → Preview (epic 11; offline)       |
| `agent-swarm`         | `.langflower/workflows/agent-swarm.json`         | Main → spawn Sub-Agent(Explorer body) via registration ports (ADR-021 L0)      |
| `multi-role-approval` | `.langflower/workflows/multi-role-approval.json` | Parallel Security/Product/Legal HITL Review Gates (multi-await composer tabs)  |
| `checkpoint-resume`   | `.langflower/workflows/checkpoint-resume.json`   | Epic 14 draft fixture (auto checkpoints off; redesign pending)                 |

### Run path — prompt refining

1. Ensure a provider is configured (`lmstudio` or `openai` in `langflower.jsonc`).
2. Load **Prompt refining**. Edit the Brief string if you want.
3. **Run**. Allow `write`/`create` if the feed shows `permission.ask`.
4. When HITL QA pauses, open `prompts/scene-01.md`, then **Approve** or
   **Request changes** (feedback loops back to the draft LLM).
5. On approve, Finish stops the run. Copy the prompt file into Midjourney / SD.

CI uses a scripted Fake LLM path
(`tests/integration/ws/execute-prompt-refining.ws.test.ts`) — no live provider.

### Run path — article writing

1. Load **Article writing**, set provider/model on the draft node if needed.
2. **Run**; allow file writes; review `articles/draft.md` at the HITL gate.
3. Approve to Finish, or send feedback to revise.

No crawl/research tools in this Partial pilot (see epic 12). Optional
`common-review` (LLM accept/feedback) can replace HITL when you wire a second
provider/model.

### Run path — coding agent (full pipeline)

1. Ensure a provider is configured (`lmstudio`, `openai`, or `cursor-proxy` in
   `langflower.jsonc`). Match provider/model on Planner, Red Team, Coder, QA,
   and Principles Review (`common-review`).
2. Load **Coding agent** (`coding-agent`). Entry is **Chat Input** — plain Run
   stays disabled.
3. Type a goal in the composer and **Start**.
4. Answer **Clarify** Review Gate turns; let **Planner Red Team** critique via
   `feedback` (Merge fan-in into Planner). **Approve** the plan Review Gate
   when ready — accepted plan → Coder.
5. Allow or Deny `permission.ask` for Coder / QA harness tools. QA notes and
   Review `feedback` re-enter Coder via Merge; Review `accept` → Result HITL.
6. **Approve** Result HITL → Finish, or **Request changes** to restart
   Planner (Result feedback → Planner Merge).

Real-LLM path documents the product claim; Fake CI is topology-only
(`tests/integration/ws/execute-coding-agent.ws.test.ts` — Principles Review is
a HITL stand-in for `common-review`). See
`docs/use-cases/coding-agent.md`.

### Run path — basic coder (smoke only)

1. Load **Basic coder**. Plan and Coder use role presets (tool budgets +
   permission posture). Entry is **Chat Input** — plain Run stays disabled.
2. Type a goal in the composer and **Start**. Plan may ask before writing
   `plans/**/*.md`; Coder may ask for `edit` / `write` / `bash`.
3. Allow or Deny each ask in the feed/composer. Preview shows the Coder summary.
4. **Stop** ends the run; send another goal from the idle composer when ready.

This is a **smoke** pilot only — not the full coding-agent product claim (see
`docs/use-cases/coding-agent.md` and **Coding agent** above) and **not**
[permission-escalation-ops](../docs/use-cases/permission-escalation-ops.md)
(dedicated explore → write → bash stages). It proves Chat Input entry +
Plan→Coder handoff + harness tools + `permission.ask`.

CI: `tests/integration/ws/execute-basic-coder.ws.test.ts`.

### Run path — permission escalation ops

1. Ensure a provider is configured (`lmstudio`, `openai`, or `cursor-proxy`).
   Match provider/model on Explore, Write, and Bash nodes.
2. Load **Permission escalation ops** (`permission-escalation-ops`). Entry is
   **Chat Input** — plain Run stays disabled.
3. Type a goal and **Start**. Explore uses the Plan budget (read/search; no
   bash). **Approve** Write handoff when ready.
4. Write stage mutates files (coder tools **without** `bash`). Allow
   `permission.ask` for edit/write. **Approve** Bash handoff.
5. Bash stage (Coder) may ask for shell; Allow or Deny. Finish ends the run.

Stages are **graph nodes / role budgets** — there is no mid-run permission
tier unlock. Fake CI is topology + scripted tools only
(`tests/integration/ws/execute-permission-escalation-ops.ws.test.ts`). See
`docs/use-cases/permission-escalation-ops.md`.

### Run path — KB contradiction curation

1. Seed a trusted collection under `.langflower/kb/` (demo Fake CI uses
   collection `trusted` with an API v1 / Alice fact).
2. Load **KB contradiction curation** (`kb-contradiction-curation`). Edit the
   batch String to JSON `[{id,text},…]` if needed.
3. **Run**. Feed shows Dedupe / Contradict packets. **Approve** Merge packet to
   apply write/edit/delete, or **Request changes** / discard text to Finish
   without mutating the trusted KB.

Do **not** count epic 10 ingest-only / search-only graphs as this Value. Fake
CI: `tests/integration/ws/execute-kb-contradiction-curation.ws.test.ts`. See
`docs/use-cases/kb-contradiction-curation.md`.

## Obsidian KB (epic 11)

Load **Obsidian KB** (`obsidian-kb`) for an offline helper path: inbox scrap →
Frontmatter patch → Wikilink rewrite → Build MOC → Preview.

1. **Run** — no provider required. Linked note + MOC appear in the Previews.
2. To write into a real vault outside the project, set in `langflower.jsonc`:

```jsonc
"harness": {
  "allowedRoots": ["C:/Users/you/Documents/ObsidianVault"]
}
```

Then wire LLM + HITL + harness `write`/`create` on the accepted path (not in
this offline demo). See [obsidian-kb](../docs/use-cases/obsidian-kb.md).

## Eval / regression gate (epic 09)

| Path     | What                                                                 |
| -------- | -------------------------------------------------------------------- |
| CLI pack | `tests/fixtures/eval/golden-sample/`                                 |
| Canvas   | `.langflower/workflows/eval-regression-gate.json` (Compare + Assert) |

```bash
# Pass
node packages/cli/bin/langflower.js eval tests/fixtures/eval/golden-sample \
  --replay tests/fixtures/eval/golden-sample/replay-pass.json

# Fail closed (exit 1) when score < threshold
node packages/cli/bin/langflower.js eval tests/fixtures/eval/golden-sample \
  --replay tests/fixtures/eval/golden-sample/replay-fail.json
```

In the UI: load **Eval regression gate**, Run; set Suite score &lt; Threshold to
see Assert stop-on-regression. See
[eval-regression-gate](../docs/use-cases/eval-regression-gate.md).

## Swarm primitives (epic 07)

### Run path — research fan-out

1. Load **Research fan-out**. Edit the Research axes string (one axis per line).
2. Set provider/model on Explorer, Synthesizer, and Conflict Review if needed.
3. **Run**. Loop emits each axis to Explorer; Preview shows JSON `results`;
   Synthesizer drafts a brief; Conflict Review `accept` → Finish (or
   `feedback` revises the synthesizer). Selective Loop re-run (S4) is deferred;
   URL crawl stays on **Crawl research** (not wired into this graph).

CI: `tests/integration/ws/execute-research-fanout.ws.test.ts` (Fake LLM + HITL
approve stand-in for `common-review`).

### Run path — agent swarm

1. Load **Agent swarm**. Brief fans to Sub-Agent→Explorer and to Coder.
2. **Run**. Concat merges Explorer (via Sub-Agent) + Coder into Preview.
3. Allow tool asks in the feed when using a real provider with tools enabled.

CI: `tests/integration/ws/execute-agent-swarm.ws.test.ts`.
