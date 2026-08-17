# LLM nodes — foundation (phases 1–6)

Phased implementation plan: [DONE/LLM-NODES/llm-nodes-README.md](DONE/LLM-NODES/llm-nodes-README.md).

## Disclaimer

Phases **1–6** deliver an **LLM node foundation**: secrets/config, skills catalog
UI, per-instance role fields, OpenAI-compatible **chat streaming**, live model
list.

**[Epic 01](DONE/EPICS/01-tool-loop-builtins.md)** adds an **internal** tool-call
loop: LLM nodes invoke allowlisted builtins through `ExecutionContext.harness`
backed by `@langflower/tools` (path fence, read/glob/grep/edit/write/create/delete/
bash, read-class `postProcess`). Observability is feed + `toolLog` — not per-call
canvas edges.

**[Epic 02](DONE/EPICS/02-runtime-permissions.md)** adds the **runtime** permission
ladder: OpenCode-style `permission.*` in `langflower.jsonc`, gated inside
`harness.invoke`, with feed `permission.ask` + composer Allow/Deny (not canvas
tool-call edges). Author-time `enabledToolIds` remains inventory binding only —
not a security boundary.

**[Epic 03](DONE/EPICS/03-review-node.md)** adds a dedicated **`common-review`**
node: forced control tools `accept` / `feedback` **port-route** to output ports
(external layer — not feed `permission.ask`). Free-form text without a tool call
gets a harness reminder; non-compliance fails closed after `maxIterations`
(`0` = unlimited).

**[Epic 04](DONE/EPICS/04-role-tool-profiles.md)** makes Plan / Coder / Explorer
**role presets** real tool + permission profiles (not only systemPrompt /
skill). Use-cases stay **Blocked** / **Partial** until Partial pilots
(epic 05) land; do not treat the stack as fully “coding agent ready” yet.

## Secret hygiene

| Layer                             | Holds secrets?      | Notes                                                                           |
| --------------------------------- | ------------------- | ------------------------------------------------------------------------------- |
| `langflower.jsonc` on disk        | **References only** | Prefer `{env:VAR}` in `options.apiKey`; literals are supported but discouraged  |
| Host process env                  | **Yes**             | Real keys live in the environment that starts Langflower                        |
| WebSocket bridge / execution feed | **No**              | Snapshots redact `provider.*.options.apiKey` before emit                        |
| Browser UI                        | **No**              | Inspector sees provider `name`, model ids, non-secret options                   |
| Server resolve                    | **Transient**       | `resolveProviderCredentials` → `{ ok, credentials\|message }`; env at call time |

**Honest limit:** redaction protects bridge and feed hygiene. An agent with
filesystem access can still read `langflower.jsonc` and learn env var **names**
(not values). Host env remains the trust boundary for secret values.

Config format and `{env:}` contract: [CONFIG.md](CONFIG.md).

## Skills catalog (phase 2)

Skills live on disk under `<project>/.langflower/skills/<id>/SKILL.md`. They are
**not** written to `langflower.jsonc` — the server projects a read-only catalog
into bridge snapshots at connect / reconnect.

### Layout and frontmatter

```text
.langflower/skills/
  plan/SKILL.md
  coder/SKILL.md
```

Prefer Cursor-style YAML frontmatter on `SKILL.md`:

```markdown
---
name: Plan
description: Break work into steps before coding
---

# Plan role

…
```

When frontmatter is missing: `name` falls back to the folder id; `description`
is the first non-empty prose line of the body, truncated to **≤280 chars**.

### Picker UX

| Layer                | What the UI shows                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| Bridge snapshot      | `skills: [{ id, name, description }]` — short metadata only                                       |
| Inspector `<select>` | Option label = `name`; muted caption under the control for the **selected** skill’s `description` |
| Option hover         | Native `title` on `<option>` = description (best-effort)                                          |

Full `SKILL.md` bodies are **never** sent over WebSocket. The server loads the
resolved skill into a private **run-host services** bag when building run
context seeds (`runner.start` / `runner.startNode`). LLM session wiring in
common-nodes reads that bag — **not** a public `ExecutionContext.skillMarkdown`
field.

### Root `AGENTS.md` (optional panel toggle)

LLM-family nodes that share `llmPanelUiSchema` (OpenAI LLM, Fake LLM, Sub-Agent,
Review, Critique) expose **Include root AGENTS.md**
(`params.includeAgentsMd`, default `false`).
When true, the server reads `<projectDir>/AGENTS.md` at the same seed moment as
skills and attaches `agentsMarkdown` on the private run-host bag. Missing or
unreadable files yield an empty body (no crash). The file body is **never**
sent on the bridge catalog.

Merge order for the effective system prompt:

```text
base (wired systemPrompt OR role preset default)
  → AGENTS.md body (when includeAgentsMd and non-empty)
  → skill markdown (when resolved skill non-empty)
```

Parts join with `\n\n---\n\n`.

### Re-read policy

| What                                    | When                                                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Catalog (`listSkills`)                  | Every config/session snapshot build (WS connect / reconnect / re-emit of `langflower.config.snapshot`)  |
| Body (`skillMarkdown` on run-host bag)  | When context seeds are built for a run / startNode (fresh `readSkillMarkdown` on server at that moment) |
| Body (`agentsMarkdown` on run-host bag) | Same seed moment when `includeAgentsMd` is true (fresh `readAgentsMarkdown`)                            |
| UI dropdown                             | Follows the last config snapshot only                                                                   |

Editing `SKILL.md` on disk applies on the **next run**, not mid-cycle inside a
node.

**Known limitation:** new skill folders appear in the select after reconnect (or
another snapshot re-emit), not via `fs.watch` in phases 1–6.

### Bridge note

Skills catalog (id, name, short description) rides on `langflower.config.snapshot`
and `session.state.snapshot.langflowerConfig` after provider redaction. There are
**no** `skills.*` bus events and **no** full skill body on the bridge.

## Agent session semantics (text-only)

See [ADR-016](ADR.md#adr-016--llm-session-init-vs-feedback-defaultvalue-vs-turn-startwith).

**All LLM nodes MUST use the shared session machine.**
`createLlmSessionCycle$` is the thin bind composer;
`runLlmSessionMachine` owns the queued turns, history, and feedback count in one
immutable `mergeScan` fold. Per-node mutable or cold-start history is forbidden
— otherwise Soft↔Hard / Critique / Review rediscover the same “agent forgot
prior messages” bug.

| Node                | Role                                                                                                                                                             |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `common-openai-llm` | Real session: init ports → context; turn driver = `feedback` (`primeTurn0`); history via assistant `response` chunks                                             |
| `common-fake-llm`   | **Imitate** LLM for demos / feed UX; same init/turn split so Soft↔Hard loops run; **not** a history/mechanics test twin                                          |
| `common-sub-agent`  | Same OpenAI session cycle as openai-llm; turn driver is an **internal** invoke `Subject` (`primeTurn0: false`); OUT `subagent-registration` announces one handle |
| `common-critique`   | Same cycle: init = `assignment` / system / inventory; turn driver = `packet` (no empty prime); history via `historySync`                                         |
| `common-review`     | Same cycle: init = `task` / system / inventory; turn driver = `result`; history via `historySync`                                                                |

Init input changes recreate the session (never ignored). For openai/fake,
`startWith('')` primes turn 0 on the feedback turn stream only — never on
`tools` / other init peers. Critique/Review do **not** empty-prime:
the first non-empty `packet` / `result` is turn 0.

Each turn uses one `runLlmLoop` `expand` machine shared by OpenAI, scripted
Fake, Sub-Agent, Review, and Critique. Policy changes only semantic completion:
ordinary agents emit `response`; path-choice agents resolve
`accept` / `feedback` or append a forced-tool reminder.

**Shared inventory ports:** Fake LLM, OpenAI LLM, Review, Critique, and Sub-Agent
are authored via `defineLlmNode` in
`packages/node-sdk/src/node-factory/define-llm-node/`.
That factory always installs `tools` / `steerControl` inputs and `toolLog` /
`recovery` outputs (`recovery` is **hidden** — feed only). Sub-Agent is an
ordinary agent on those ports; the extra product surface is OUT
`subagent-registration` — one specialist `ToolHandle` for the parent
(ADR-021 / epic 41). Optional `common-tool-collection` can
merge several `tools` wires into one; LLM `tools` stays **multi combine**.

**Why the inventory is unified:** Review is not a yes/no stub. Besides
port-routed `accept` / `feedback` (graph path choice), it must be able to
investigate and delegate like a base agent — harness/domain tools, MCP, and
Sub-Agent handles — when the author wires `tools`. Do not invent a second,
narrower port set for Review.

**Soft↔Hard storm guardrail (epic 08):** param `maxFeedbackTurns` caps feedback
turns after turn 0 (`0` = unlimited). Further feedback after the cap emits a
`toolLog` and `runner.permission.ask` (`agent.maxFeedbackTurns`). **Allow**
resets the counter for another full budget; **Deny** (or no ask hook) **errors**
the cycle (`response` / sibling outs) — not a silent drop. Agent
`maxIterations` uses the same continue-ask pattern (`agent.maxIterations`);
budget is **per feedback turn**. Pair with HITL / `common-review` accept or
**Stop** for interactive loops (ADR-015). Critique stays on `feedback` edges —
not per-call tool ports. See [adversarial-red-team](use-cases/adversarial-red-team.md).

## Context compaction

OpenAI-compatible chat nodes (`common-openai-llm`, `common-critique`,
`common-review`, `common-sub-agent`) share one pre-stream runner
(`prepareChatCompletion`):

| Param            | Default  | Role                                                                                                        |
| ---------------- | -------- | ----------------------------------------------------------------------------------------------------------- |
| `contextSize`    | `200000` | Approx input budget (`JSON.stringify` length / 4 over messages + tools). `0` disables proactive compaction. |
| `compactOnError` | `false`  | On typed context-length error at stream create: force-compact once and retry.                               |

Compaction preserves leading `system` messages, the latest `user` message, and
atomic assistant/tool blocks. Summaries replace contiguous unprotected ranges
in place and emit `historySync` so ADR-016 session history stays truncated.
Retries never replay already-streamed `reasoning` / `draftResponse` chunks.
`common-fake-llm` keeps its panel without compaction fields.

## Failure recovery

**Stuck streams and dead loops** (idle watchdog, default autokick with
exponential backoff, dead-loop detection, feed retry timers, Steer
precedence): [LLM_RECOVERY.md](LLM_RECOVERY.md).

Provider streams are RxJS resources with hard-cancel, Pause, and idle
boundaries. `streamIdleTimeoutMs` defaults to 90 seconds; `0` disables the idle
watchdog. Recoverable failures include network, rate-limit, HTTP 5xx, stream
idle, **output truncation** (`finish_reason=length` or incomplete tool-call
JSON), opaque/unclassified errors, and a stream that ends without a `done`
chunk. Those paths emit a sanitized **`recovery` inventory notice**
(`feed.role: 'recovery'`) — distinct from ordinary `toolLog` — then retry from
the last committed round checkpoint up to `maxTransientRetries`. HTTP 429 /
5xx / network then **join the autokick wait** (full-store replay, no kick,
no penalty). Autokick off / a finite cap exhausted / unknown-after-budget
enter the same Steer/Resume await as Pause. A **`suspended`** recovery notice opens the
Steer composer (same HITL fold as Pause). Retry notices do not. Truncation never
runs tools or commits a partial assistant/tool round; when compaction is enabled
(`contextSize > 0`) a retry may force-compact history first. **Structural
compaction / history protocol failures** (`Cannot compact history:…`) are
recoverable but skip transient retries — one diagnostic, then the same
Steer/Resume await. Authentication and configuration failures stay on the real
error lane. Path-choice forced-tool protocol failure after max iterations
remains fail-closed. Partial reasoning/draft remains feed telemetry but is not
committed to history.

Tool and Sub-Agent waits are sequential and bounded by `toolTimeoutMs` and
`subagentTimeoutMs`. Tool results are capped before entering model history.
Feed diagnostics are sanitized: raw HTML provider bodies, request secrets, and
full stacks are never emitted.

This preserves the node's StatefulObservable for recoverable provider failures;
generic node-local runtime reload remains
[TBD-008](TBD.md#tbd-008--node-local-reactive-recovery).

## Roles as instance config (phase 3)

There is **one** LLM node type pair (`common-fake-llm` / `common-openai-llm`).
**Plan / Coder / Explorer are not separate palette types** — they are
`rolePreset` values on an instance that seed default `systemPrompt`, default
`skillId`, and (later) default tool allowlists.

| Preset     | Meaning                                                       |
| ---------- | ------------------------------------------------------------- |
| `custom`   | Empty defaults; author fills system prompt and skill manually |
| `plan`     | Read-only exploration + Markdown planning prompts             |
| `coder`    | Implementation-focused system prompt                          |
| `explorer` | Research / web notes system prompt                            |

Multiple LLM nodes on the canvas = multiple roles side by side, each with its
own `params` (`rolePreset`, `providerId`, `model`, `skillId`, …).

Shared panel floor lives in `packages/common-nodes/src/ai/features/ui-schema/llm-panel-ui-schema.ts`
(`llmPanelUiSchema`, `llmMaxIterationsUiField`). Nodes may expand after the
floor (Fake `tokenDelayMs`, Sub-Agent identity, compaction/recovery) but must
not omit floor fields. Review/Critique replace only the `maxIterations` field
defaults (path-choice 5 / unlimited). Number params declare `min` / `max` /
`step` so Inspector reuses canvas inline number constraints. `maxIterations`:
`0` = unlimited (default 100 agents / 5 path-choice); Inspector has no hard
product ceiling (`Number.MAX_SAFE_INTEGER`). Counted **per feedback turn**
(each turn resets the tool-loop budget). `maxFeedbackTurns` default 50 for new
agent nodes (`0` = unlimited).

At run time each cycle builds:

```text
effectiveSystem = buildEffectiveSystemPrompt(
  wired systemPrompt input OR preset default,
  agentsMarkdown from private run-host bag (includeAgentsMd),
  skillMarkdown from private run-host bag,
)
```

Missing / empty `skillId` → `skillMarkdown: ''` — no crash.
Missing `AGENTS.md` with toggle on → `agentsMarkdown: ''` — no crash.

### Skill attach vs skill refining (future)

| Mechanism                        | When             | Purpose                                                                                             |
| -------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------- |
| Panel `skillId`                  | Phases 2–3       | Convenience: append skill markdown into system for demos / static roles                             |
| **`read` tool** (tool-loop epic) | After tools ship | Agent loads / refines skill files during the loop — skill file as tool input, not only panel attach |

Panel catalog remains for static attach; use-case skill refining (e.g.
prompt-refining) depends on the harness **`read`** tool, not the Inspector alone.

### Shell / bash recommendation

When tool execution lands, **recommend turning shell off** for agent instances
(default-deny or strong UX nudge). Runtime permission escalation is a separate
epic from author-time tool allowlists (phase 4).

## Author-time tool permissions (node table) + project floor

Each LLM instance stores `toolPermissions` in `params` — a coarse
`deny | ask | allow` map per tool id (Inspector table with header
**tool / deny / ask / allow**). Project `langflower.jsonc` `permission` is the
**floor**: effective decision = stricter(floor, node). Node cannot loosen past
the project. Floor-deny tools are hidden from the Inspector.

| Layer                  | Role                                         |
| ---------------------- | -------------------------------------------- |
| Project `permission`   | Floor (+ optional path/command patterns)     |
| Node `toolPermissions` | Per-agent deny/ask/allow (clamped to floor)  |
| Inventory              | Tools whose effective decision is not `deny` |

### Role preset merge rules

| Concern                 | Rule                                                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Apply preset**        | Materializes `toolPermissions` (visible). Removes legacy `enabledToolIds`. Does not rewrite `skillId` / system text. |
| **Override stickiness** | Edits to `toolPermissions` stick until the next preset apply.                                                        |
| **Runtime**             | `mergeProjectAndNodePermissions(project, node)` — **no** hidden role posture overlay.                                |
| **Legacy**              | `enabledToolIds` still migrates when `toolPermissions` is unset.                                                     |

Recommended profiles (materialized `toolPermissions`):

| Preset       | toolPermissions                                                     |
| ------------ | ------------------------------------------------------------------- |
| **Custom**   | all builtins `allow`                                                |
| **Coder**    | all `allow`; `bash`/`delete` → `ask`                                |
| **Plan**     | read/glob/grep `allow`; write/create `ask`; edit/delete/bash `deny` |
| **Explorer** | read `allow`; write/create `ask`; other builtins `deny`             |

```text
Project floor (jsonc)          Node toolPermissions (Inspector)
─────────────────────          ────────────────────────────────
Security minimum               Per-agent tighten (deny/ask/allow)
Patterns optional              Coarse `*` per tool
```

Defaults: first-run seeds all builtins **allow**. On `ask`, the server emits
`runner.permission.ask`; the composer answers Allow/Deny.

### MCP (optional)

Agent nodes receive **ready** `ToolHandle[]` values only. They never unwrap
server config, spawn clients, or apply enable filters.

| Who            | Gets                                       | Does not                                                          |
| -------------- | ------------------------------------------ | ----------------------------------------------------------------- |
| MCP stdio/http | ports → connect → emit `tools`             | know about agents                                                 |
| Server seed    | jsonc + `enabledMcpIds` → `EC.toolHandles` | pass raw `mcp.servers` into the agent                             |
| Agent          | `EC.toolHandles` ∪ port `tools`            | read jsonc; spawn; resolve id→client; use `enabledMcpIds` in bind |

Two ingresses (context + wire) are normal; the agent merges both `ToolHandle`
arrays. Inspector **Enabled MCP** (`enabledMcpIds`) stays on agent params —
server applies it when building EC. Harness has **no** MCP API. Inventory ids:
`<mcp_name>__<toolName>` (`mcp_name` = MCP `serverInfo.name`).

See [use-cases/node-local-mcp.md](use-cases/node-local-mcp.md) and
[CONFIG.md](CONFIG.md) § MCP.

MCP is an optional extension — **never** a substitute for built-in
`read`…`bash`.

## Port events: real facts only, fail visibly

`StatefulObservable` carries **inactive / loading / value / error** as part of
the dataflow — not only successful values. Runtime maps stream errors to
`runner.output-emitted` / `runner.input-received` with `state: 'error'`. Authors
must use that channel; do **not** invent placeholder values or swallow failures
with `EMPTY`.

**No fake events** on observability / inventory outs (`reasoning`,
`draftResponse`, `toolLog`, `recovery`, …) — emit **only real facts**:

- API stream tokens (`delta.content` → `draftResponse`; `delta.reasoning` /
  `delta.reasoning_content` → `reasoning`)
- Actual tool invoke / result lines on `toolLog`

Do **not** emit placeholders (`''`, synthetic config dumps, idle `of(null)` /
`of('')`) just to clear loading. Pending / inactive chrome is the correct idle
UI. Emit `toolLog` only for real tool facts.

**No silent refusals:** when a real policy stops work (e.g. `maxFeedbackTurns`
Deny after the continue ask, hard validation fail, unrecoverable provider/tool
failure), surface it on the cycle — typically a `toolLog` warning **and** a
stream error so `response` (and sibling outs on the same cycle) show
`state: 'error'`. Never drop further feedback with bare `EMPTY` and leave the
canvas looking “dead”. `maxFeedbackTurns` Deny errors with the **message
string** (no `Error` stack). Before Deny, agents ask `runner.permission.ask`
to continue. Runner telemetry unwraps `combineStatefulObservables` error tuples
(`false` = no source error; may nest) to that message for feed/WS.

## OpenAI-compatible LLM (phase 5)

Node type: `common-openai-llm` (`packages/common-nodes/src/ai/nodes/openai-llm/`).

| Concern     | Behaviour                                                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------------------------ |
| HTTP client | Official `openai` npm package — owned by `@langflower/server`                                                            |
| Credentials | `ExecutionContext.createChatCompletionStream` — server injects factory; node never resolves secrets                      |
| Streaming   | `delta.content` → `draftResponse`; `delta.reasoning` / `reasoning_content` → `reasoning`; assembled content → `response` |
| Tools       | Internal tool loop via `ctx.harness` (epic 01); inventory + invoke                                                       |
| Cancel      | `AbortSignal` on stream when run interrupts                                                                              |

## Review node (epic 03 / phase 7)

Node type: `common-review` (`packages/common-nodes/src/ai/nodes/review/`).
Adversarial sibling: `common-critique` (`packages/common-nodes/src/ai/nodes/critique/`)
— same path-choice tools, ports `assignment` / `packet` (attack framing).
`defineLlmNode`, `McpHandle`, and `ToolHandle` live in
`@langflower/node-sdk`.

Both share the `llmPanelUiSchema` floor (role / tools / MCP / AGENTS.md /
feedback caps) and expand with path-choice `maxIterations` defaults plus
compaction/recovery. Forced-tool preamble stays Review/Critique-private;
control tools **choose the next graph path**.

| Concern       | Behaviour                                                                                           |
| ------------- | --------------------------------------------------------------------------------------------------- |
| Path choice   | `accept` → `response` (passthrough of `result`); `feedback` → `feedback` (revision notes)           |
| Control tools | Node-private `accept` / `feedback` (strong descriptions); **must not leak** to other LLM nodes      |
| Free-form     | No control tool → reminder user message, retry; fail-closed after `maxIterations` (`0` = unlimited) |
| Model         | Requires native tool / function calling; prose or markdown `tool_code` does not route               |
| Inventory     | Same `defineLlmNode` ports as OpenAI/Fake when wired; control tools are never inventory entries     |
| Layer         | **External** (MECHANICS C1/C2/C3/C9) — not feed `permission.ask`                                    |

**When to use Review vs `common-openai-llm`:**

- Need accept vs revise to **select which edge runs next** → `common-review`
  (or HITL Review Gate for a human). A single-output LLM cannot encode that.
- Need peer critique **text** in a Soft↔Hard storm only → openai/fake LLM +
  `feedback` edge is fine; that is not an «agreed» / finish gate.
- `maxFeedbackTurns` caps revise storms; it is **not** the agreement signal.

Inputs: `task`, `result`, optional `systemPrompt`, plus shared inventory ports.
Params: `providerId`, `model`, `skillId`, `maxIterations` (default 5;
`0` = unlimited). Inspector number fields share canvas inline `min` / `max` /
`step` constraints via uiSchema.

## Live model catalog (phase 6)

Inspector model selects combine **static** ids from `langflower.jsonc` with a
**live** OpenAI-compatible `models.list()` fetch on the server.

| Concern     | Behaviour                                                                                                                                                   |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trigger     | Server pushes `langflower.models.catalog.snapshot` after config on connect (async) and after Settings Save — UI does not request refresh                    |
| Response    | Map of every configured `providerId` → `{ models: { id, name? }[], error? }`                                                                                |
| Merge       | Union of static + fetched ids (dedupe by id); fetched `name` wins for titles                                                                                |
| Fallback    | Fetch failure with static ids → muted warning, select stays enabled; fetch failure with **no** models → Model select disabled + red error under the control |
| Persistence | Fetched ids stay in memory for the UI session only — never written to jsonc                                                                                 |
| Secrets     | `resolveProviderCredentials` on server only; no apiKey on WS payloads                                                                                       |

See [CONFIG.md](CONFIG.md) for jsonc shape and bridge contract table.

## Related docs

- Stuck / idle / dead-loop strategy: [LLM_RECOVERY.md](LLM_RECOVERY.md)
- Provider / model jsonc: [CONFIG.md](CONFIG.md)
- Built-in LLM node catalog (when shipped): [features/node-library.md](features/node-library.md)
- Phased checklist: [DONE/LLM-NODES/llm-nodes-README.md](DONE/LLM-NODES/llm-nodes-README.md)
