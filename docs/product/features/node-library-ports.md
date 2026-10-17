---
kind: feature
owner: docs
covers: []
status: current
---

## 8. P0 node port reference

Detailed specs for first implementation wave.

### 8.1 Assert — `common-assert`

Hard harness core. Failure throws → node `failed` → downstream skip unless wired from success branch.

| In          | Type    | Required                         |
| ----------- | ------- | -------------------------------- |
| `condition` | boolean | yes                              |
| `message`   | string  | no (default: "Assertion failed") |
| `value`     | any     | no (passthrough on success)      |

| Out     | Type | Notes                                              |
| ------- | ---- | -------------------------------------------------- |
| `value` | any  | passthrough from `value` input when condition true |

### 8.2 IF — `common-if`

| In          | Type    | Required |
| ----------- | ------- | -------- |
| `condition` | boolean | yes      |
| `value`     | any     | no       |

| Out     | Type | Notes                      |
| ------- | ---- | -------------------------- |
| `true`  | any  | emits when condition true  |
| `false` | any  | emits when condition false |

Only the matching output port receives a value per execution.

### 8.3 Switch — `common-switch`

| In      | Type   | Required |
| ------- | ------ | -------- |
| `value` | string | yes      |

| Param           | Type   | Notes                                                               |
| --------------- | ------ | ------------------------------------------------------------------- |
| `rules`         | json   | `[{ "match": "pass", "output": "pass" }, …]` — match → named output |
| `matchMode`     | select | `equals` \| `regex`                                                 |
| `defaultOutput` | string | fallback port name (default `"default"`)                            |

**Outputs (shipped):** static ports `pass`, `fail`, `default` from default rules.
Panel `rules` rematch values onto those port names only (custom names clamp to
the static set). Unmatched values route to `defaultOutput`.

### 8.4 Compare — `common-compare`

| In  | Type | Required |
| --- | ---- | -------- |
| `a` | any  | yes      |
| `b` | any  | yes      |

| Param | Type   | Options                                                     |
| ----- | ------ | ----------------------------------------------------------- |
| `op`  | select | `eq`, `ne`, `lt`, `gt`, `lte`, `gte`, `contains`, `matches` |

| Out      | Type    |
| -------- | ------- |
| `result` | boolean |

### 8.4b Gate — `common-gate`

Soft block (no node failure). Forwards `value` only when `pass === true`.

| In      | Type    | Required |
| ------- | ------- | -------- |
| `pass`  | boolean | yes      |
| `value` | any     | no       |

| Out     | Type | Notes                          |
| ------- | ---- | ------------------------------ |
| `value` | any  | emits only when `pass` is true |

### 8.5 Template — `common-template`

| In         | Type   | Required |
| ---------- | ------ | -------- |
| `context`  | json   | yes      |
| `template` | string | yes      |

| Out      | Type   |
| -------- | ------ |
| `result` | string |

Syntax: `{{path.to.key}}` with JSON context (Mustache-like; exact engine TBD).

### 8.6 Read File — `common-read-file`

Category: **Text**. I/O via `ctx.files` (no harness permission ask). Absolute
paths rejected.

| In       | Type    | Required | Notes                                        |
| -------- | ------- | -------- | -------------------------------------------- |
| `path`   | string  | yes      | Inline 1-line; relative to project root      |
| `update` | dynamic | no       | Wire-only tick; re-reads when path unchanged |

| Out       | Type   |
| --------- | ------ |
| `content` | string |

### 8.6b Write File — `common-write-file`

| In        | Type   | Required | Notes                                              |
| --------- | ------ | -------- | -------------------------------------------------- |
| `path`    | string | yes      | Inline 1-line                                      |
| `content` | string | yes      | Wire-only; `multi: 'merge'` (each emission writes) |

| Out    | Type   | Notes                     |
| ------ | ------ | ------------------------- |
| `path` | string | Relative path after write |

### 8.6c Append File — `common-append-file`

| In          | Type   | Required | Notes                                                          |
| ----------- | ------ | -------- | -------------------------------------------------------------- |
| `path`      | string | yes      | Inline 1-line                                                  |
| `delimiter` | string | no       | Inline multiline; default `\n\n`; inserted when file non-empty |
| `content`   | string | yes      | Wire-only; `multi: 'merge'` (each emission appends)            |

| Out    | Type   | Notes                      |
| ------ | ------ | -------------------------- |
| `path` | string | Relative path after append |

### 8.7 List Files — `common-list-files`

| In     | Type   | Required                  |
| ------ | ------ | ------------------------- |
| `path` | string | yes (directory, relative) |

| Param       | Type    | Default |
| ----------- | ------- | ------- |
| `recursive` | boolean | false   |

| Out | Type |
| --------- | ---- | ------------------------------------ |
| `entries` | json | `[{ name, type: file\|dir, size? }]` |

### 8.8 Glob — `common-glob`

| In        | Type   | Required |
| --------- | ------ | -------- |
| `pattern` | string | yes      |

| Param | Type   | Default                     |
| ----- | ------ | --------------------------- |
| `cwd` | string | `.` (project root relative) |

| Out | Type |
| ------- | ---- | ----------------------- |
| `paths` | json | string[] relative paths |

Uses ripgrep/gitignore rules (same as OpenCode): paths and files listed in
`.gitignore` are excluded unless `param.respectGitignore: false`.

### 8.9 Grep — `common-grep`

| In        | Type   | Required |
| --------- | ------ | -------- |
| `pattern` | string | regex    |

| Param     | Type   | Default         |
| --------- | ------ | --------------- |
| `include` | string | `*` glob filter |
| `cwd`     | string | `.`             |

| Out | Type |
| --------- | ---- | ------------------------ |
| `matches` | json | `[{ path, line, text }]` |

Respects `.gitignore` by default (ripgrep backend).

### 8.10 Web Fetch — `common-web-fetch`

| In    | Type   | Required |
| ----- | ------ | -------- |
| `url` | string | yes      |

| Param       | Type   | Default   |
| ----------- | ------ | --------- |
| `timeoutMs` | number | 30000     |
| `maxBytes`  | number | 5_000_000 |

| Out       | Type   |
| --------- | ------ |
| `body`    | string |
| `status`  | number |
| `headers` | json   |

SSRF: block private IP ranges and `localhost` by default (configurable allowlist).

### 8.11 Role presets on LLM nodes (Plan / Coder / Explorer)

There are **no** separate `common-agent-*` palette types. Plan / Coder /
Explorer are **`rolePreset`** values on `common-openai-llm` /
`common-fake-llm` (epic 04). One implementation: LLM + internal tool-call
loop + role tool allowlist + permission posture overlay.

| Port / param                 | Type                  | Notes                                            |
| ---------------------------- | --------------------- | ------------------------------------------------ |
| In `systemPrompt`            | string                | optional; else preset system text                |
| In `userPrompt`              | string                | required                                         |
| In `feedback`                | string                | wire-only (feedback edge)                        |
| In `tools`                   | tool-registration     | **multi** — optional extra registrations         |
| Param `rolePreset`           | select                | `custom` \| `plan` \| `coder` \| `explorer`      |
| Param `toolPermissions`      | tool-permission-table | deny/ask/allow per tool; preset materializes     |
| Param `maxIterations`        | number                | default 100 (per feedback turn; no hard ceiling) |
| Param `maxFeedbackTurns`     | number                | default 50; `0` = unlimited Soft↔Hard revise cap |
| Param `providerId` / `model` | select                | from `langflower.jsonc`                          |
| Out `reasoning`              | stream string         | optional; live chunks + final value for wiring   |
| Out `draftResponse`          | stream string         | partial assistant text while the agent runs      |
| Out `response`               | string                | final text                                       |
| Out `toolLog`                | json                  | `[{ tool, input, output, error? }]`              |

#### Built-in role profiles

| Preset       | Materialized `toolPermissions` (visible; no hidden overlay)                       |
| ------------ | --------------------------------------------------------------------------------- |
| **Plan**     | read/glob/grep/sleep/ask_user allow; write/create ask; edit/delete/move/bash deny |
| **Coder**    | all allow; bash/delete/move ask                                                   |
| **Explorer** | read/sleep/ask_user allow; write/create ask; other builtins deny                  |
| **Custom**   | all builtins allow                                                                |

Selecting a preset in the Inspector **materializes** `toolPermissions`; further
edits stick until the next preset apply. Project `permission` is the **floor**.
Merge rules: [LLM_NODES.md](../../reference/LLM_NODES.md) § Author-time tool permissions.

#### Additional tools via wiring

Optional `tools` edges add registrations beyond harness builtins. Inventory =
tools whose effective decision (floor + node) is not `deny`. Runtime gates use
`mergeProjectAndNodePermissions` (no role posture).

### 8.12 Chat Input — `common-chat-input`

**Category:** AI · **Mode:** reactive · **Status:** done (epic 13)

The entry point for chat-style runs. `message` is a hidden HITL port with an
editable inline — on-node multiline (like String) and composer, no incoming
handle. Prefill on the node body or in the composer; the text is stored as
`inputs.message` so Stop then Start reuses it.

| Direction | Port      | Type   | Notes                                                 |
| --------- | --------- | ------ | ----------------------------------------------------- |
| In        | `message` | string | `hidden` + `inline`; on-node / composer; no handle    |
| Out       | `message` | string | the user's message, submitted via the feed's composer |

A workflow that contains a Chat Input node cannot be started with the plain
Run action — see [workflow-execution.md § Starting a run](workflow-execution.md) —
because there is nothing to run until a first message exists. The feed shows
a composer with **Start** (not Run) for that node's cluster; submitting it
emits `message`, which is what actually starts the run. Composer layout:
[feed-panel.md](feed-panel.md) § Composer layout. Typically wired straight
into an agent's `userPrompt`, optionally alongside a feedback edge from a
Review, Review Gate, or Chat Loop node for multi-turn conversations (see
[hitl-chat.md](hitl-chat.md)).

---
