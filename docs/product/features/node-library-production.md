---
kind: feature
owner: docs
covers: []
status: current
---

## 5. Production nodes (current)

Detailed port specs below for **target** shapes. Shipped set is §2.1 /
`catalog.ts` only.

### 5.1 Agent nodes — `common-agent-{preset}` (superseded)

**Category:** AI · **Mode:** reactive · **Status:** planned (superseded by LLM
role presets) · **Server:** was `ctx.executeAgent`

> **Product lock:** do not ship separate `common-agent-*` types. Use
> `common-openai-llm` / `common-fake-llm` + `rolePreset` + tool-loop (epic 01).
> Spec below is historical / target behavior for presets.

Replaces the retired batch `common-llm` node. Plain chat: `common-agent` with
`enabledTools: []`.

| Direction | Port            | Type          | Notes                                                        |
| --------- | --------------- | ------------- | ------------------------------------------------------------ |
| In        | `systemPrompt`  | string        | optional, multiline                                          |
| In        | `userPrompt`    | string        | required, multiline                                          |
| In        | `feedback`      | string        | wire-only; feedback edge from Review / Review Gate           |
| In        | `tools`         | tool-handle   | **multi** — packs, MCP nodes, jsonc MCP via `EC.toolHandles` |
| Out       | `reasoning`     | stream string | reasoning stream                                             |
| Out       | `draftResponse` | stream string | partial assistant text while running                         |
| Out       | `response`      | string        | final assistant text                                         |
| Out       | `toolLog`       | json          | `[{ tool, input, output, error? }]`                          |

| Param              | Type         | Default                 | Notes                                |
| ------------------ | ------------ | ----------------------- | ------------------------------------ |
| `providerId`       | select       | from `langflower.jsonc` |                                      |
| `model`            | select       | per provider            |                                      |
| `temperature`      | number       | preset-specific         |                                      |
| `maxTokens`        | number       | 4096                    |                                      |
| `maxIterations`    | number       | preset-specific         | tool-call loop cap                   |
| `maxFeedbackTurns` | number       | `50` (`0` = unlimited)  | Soft↔Hard revise storm cap (epic 08) |
| `structuredOutput` | json         | —                       | optional JSON Schema                 |
| `enabledTools`     | tool-id-list | —                       | custom agent only                    |

**Feedback loop:** reactive agents re-run when `feedback` port receives a value
(bus or feedback edge). Batch `runFeedbackReruns` skips reactive types.
`maxFeedbackTurns` caps feedback turns after turn 0 (`0` = unlimited). Past
the cap: `toolLog` warning + cycle error on `response` (not a silent drop).

Presets, permissions, and wired tools: see [§8.11](./node-library.md).

---

### 5.2 Review — `common-review`

**Category:** AI · **Mode:** reactive · **Status:** done (epic 03 / phase 7) ·
**Server:** shared chat factory + port-routed `accept`/`feedback` control tools

| Direction | Port            | Type          | Notes                                                |
| --------- | --------------- | ------------- | ---------------------------------------------------- |
| In        | `systemPrompt`  | string        | optional                                             |
| In        | `task`          | string        | required — original task / acceptance criteria       |
| In        | `result`        | string        | required — agent output to review                    |
| In        | `tools`         | tool-handle   | **multi** — packs, MCP, Sub-Agent handles, jsonc MCP |
| Out       | `reasoning`     | stream string | short preamble                                       |
| Out       | `draftResponse` | stream string | streamed tokens before a control tool                |
| Out       | `response`      | string        | passthrough of `result` on **accept**                |
| Out       | `feedback`      | string        | revision notes on **feedback** (not a node error)    |
| Out       | `toolLog`       | string        | control-tool lines + inventory logs                  |

| Param           | Type   | Default | Notes                                             |
| --------------- | ------ | ------- | ------------------------------------------------- |
| `providerId`    | select | —       | OpenAI-compatible provider                        |
| `model`         | select | —       | per provider                                      |
| `skillId`       | select | —       | optional skill markdown                           |
| `maxIterations` | number | 5       | caps non-compliant completions before fail-closed |

Wire `feedback` → agent `feedback` for Agent → Review → Fail → Agent loops.
Control tools stay `accept` / `feedback` (port-routed). Inventory / MCP /
Sub-Agent handles match the shared LLM `tools` contract (`defineLlmNode`) —
Review is a **full agent with a path fork**, not a yes/no stub.

**Anti-pattern:** do not use a peer `common-openai-llm` with a single `response`
as an accept gate (fan-out the same text to «revise» and «done»). That node
cannot decide which graph branch should run. Soft↔Hard critique on a `feedback`
edge is text handoff only; «agreed» requires Review (or HITL Review Gate)
`accept` → `response`. `maxFeedbackTurns` is a storm guardrail, not agreement.
See MECHANICS-tool-execution (`docs/_archive/DONE/EPICS/MECHANICS-tool-execution.md`)
anti-criteria and [LLM_NODES.md](../../reference/LLM_NODES.md) § Review.

---

### 5.2b Critique — `common-critique`

**Category:** AI · **Mode:** reactive · **Status:** done · **Server:** same
path-choice kernel as Review (`ai/features/path-choice/`), different framing ports

| Direction | Port           | Type             | Notes                                   |
| --------- | -------------- | ---------------- | --------------------------------------- |
| In        | `systemPrompt` | string           | optional attack rubric                  |
| In        | `assignment`   | string           | required — original assignment / topic  |
| In        | `packet`       | string           | required — artifact under attack        |
| In        | `tools` / …    | (same as Review) | optional inventory / MCP / Sub-Agent    |
| Out       | `response`     | string           | passthrough of `packet` on **accept**   |
| Out       | `feedback`     | string           | attack / revision notes on **feedback** |

Use Critique when the first string is **not** acceptance criteria to fulfill
(e.g. adversarial red-team). Review keeps `task`/`result` for gate framing.
See [LLM_NODES.md](../../reference/LLM_NODES.md) § Critique and
[adversarial-red-team](../use-cases/adversarial-red-team.md).

---

### 5.3 Retired HITL — Ask User / Approval Choice

`common-ask-user`, `common-hitl-ask-user`, and `common-hitl-approval-choice`
were **deleted** (not palette-hidden). Use:

- **`common-hitl-review-gate`** (§5.3b) — mid-run clarify / approve /
  request-changes (`result` in; `requestChanges` → `feedback`;
  `approve` → `response`)
- **`common-chat-input`** — cold-start composer entry

Do not add new references to the retired types.

---

### 5.3b HITL Review Gate — `common-hitl-review-gate`

**Category:** HITL · **Mode:** reactive · **Status:** done

Review gate with **separate HITL inputs** for approve vs request-changes (not
actions inside one config). Node handler routes inputs to outputs.

| Direction | Port             | Type    | HITL control                                       |
| --------- | ---------------- | ------- | -------------------------------------------------- |
| In        | `result`         | string  | wire-only upstream content                         |
| In        | `approve`        | boolean | hidden; `kind: 'button'`, `payload: true`          |
| In        | `requestChanges` | string  | hidden; `kind: 'textarea'`                         |
| Out       | `response`       | string  | emitted when `approve === true` (reviewed content) |
| Out       | `feedback`       | string  | emitted from `requestChanges` textarea             |

`result.pipe` on both outs keeps the upstream edge live. No `preview` out.
No panel params. Integration:
[`execute-hitl-inputs.ws.test.ts`](../../../tests/integration/ws/execute-hitl-inputs.ws.test.ts).

---

### 5.3c Chat Loop — `common-chat-loop`

**Category:** HITL · **Mode:** reactive · **Status:** done

Infinite agent chat turn. One HITL textarea, one `feedback` out — no Approve.

Typical wiring: Chat Input.`message` → LLM.`userPrompt`; LLM.`response` →
Chat Loop.`result`; Chat Loop.`feedback` → LLM.`feedback`. The run ends on
**Stop**.

| Direction | Port       | Type   | HITL control                                      |
| --------- | ---------- | ------ | ------------------------------------------------- |
| In        | `result`   | string | wire-only agent turn; opens the composer          |
| In        | `message`  | string | hidden; `kind: 'textarea'`; `Send`; `role: reply` |
| Out       | `feedback` | string | human reply                                       |

No panel params. Integration: `hitl-chat-loop` in
[`execute-hitl-inputs.ws.test.ts`](../../../tests/integration/ws/execute-hitl-inputs.ws.test.ts).

---

### 5.4 Router — `common-router`

**Category:** Flow · **Mode:** reactive · **Status:** done

System node — bypass ports from edges (`bypassPorts`); no separate canvas builder.

| Direction | Port              | Type          | Notes                                                  |
| --------- | ----------------- | ------------- | ------------------------------------------------------ |
| In        | `ch`              | dynamic multi | single bypass base input; slots map to router channels |
| Out       | `ch`, `ch@1`, ... | dynamic       | slot-specific passthrough handles from the base input  |
| Out meta  | `passthroughFrom` | —             | output type follows the base input                     |

Default channel: `ch`. Additional channels use output handles like `ch@1`;
their upstream input edge still targets the base input with a slot index
(`toPort: ['ch', 1]` in runtime terms).

**Use cases:**

- Fan-in multiple upstream batch nodes into channel-specific downstream paths
- Partial re-run: changing one upstream updates only matching downstream branch

See [REACTIVE_NODES.md](../../reference/REACTIVE_NODES.md).

---

### 5.5 Preview — `common-preview`

**Category:** Output · **Mode:** batch · **Status:** done

Sink node for inspecting wired values on the canvas and in the work log. The
input accepts **any** wire type. `output` passes that value through. `text`
is the display string (JSON for objects).

| Direction | Port     | Type          | Notes                                       |
| --------- | -------- | ------------- | ------------------------------------------- |
| In        | `input`  | dynamic       | required; `inline: 'preview-markdown'`      |
| Out       | `output` | `from(input)` | same value as `input`                       |
| Out       | `text`   | string        | formatted display text; `feed.role: result` |

**UI:** read-only preview box on the `input` port row shows the last
value received during execution (`runner.port`, direction `'in'`). Work log mirrors
the formatted `text` output as an assistant message.

**Use cases:**

- Debug intermediate values in a chain (`String` → `Preview`, `LLM` → `Preview`)
- Final sink when the workflow result should be human-readable text on canvas

---
