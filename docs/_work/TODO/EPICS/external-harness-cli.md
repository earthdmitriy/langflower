---
kind: work
owner: docs
covers: []
status: current
---

# External harness CLI

**Status:** unscheduled. No epic number until it is placed on the queue.

## Problem statement

A provider subscription often runs only inside that vendor's harness CLI
(Claude Code, Cursor `agent`, OpenCode). The same subscription is not
offered as an OpenAI-compatible API.

Community projects already wrap those CLIs as `/v1/chat/completions`.
Langflower can point an OpenAI LLM at that base URL today. The call still
lands in the vendor chat loop. That process uses only its own tools.
Langflower `ToolHandle`s, `feedback`, and path-choice never enter it.
Treating the wrapper as a normal tool-calling model hides that split.

The graph needs an explicit harness node: no `tools` input, no extra
ports such as `feedback`. An OpenAI-compatible LLM keeps orchestration.
Implementation runs on the CLI the operator already pays for, either as a
wired print step or as one subagent `ToolHandle`.

### Legal notice

This is not legal advice. It records how the vendors classify two
different uses. The operator's own agreement controls.

**Running the published CLI.** The process is the vendor binary, already
installed, with that vendor's own login. Langflower only passes a prompt
and reads the result.

- Anthropic's [legal and compliance](https://code.claude.com/docs/en/legal-and-compliance)
  page allows a product to run Claude Code only as the binary Anthropic
  published: unmodified, no auth method removed, each person signed in as
  themselves, and no one reselling or intermediating that usage. Consumer
  Terms still forbid automated access except through an Anthropic API key
  or an explicit permission. Pro and Max limits assume ordinary individual
  use of Claude Code. OAuth from Free, Pro, or Max is for Claude Code and
  other native Anthropic apps, not for a third-party product that logs the
  user in itself.
- Cursor staff classify the published CLI (`agent`, including print mode)
  and the Agent SDK as the supported way to automate outside the IDE.
  Both still run Cursor's harness. They do not provide an
  OpenAI-compatible model API. The
  [Terms](https://cursor.com/terms-of-service) restrict reverse
  engineering and derivative access to the Service. The
  [acceptable use policy](https://cursor.com/acceptable-use-policy) also
  restricts bots and scripts, and circumvention of billing or metering.
- OpenCode's open-source CLI is MIT. The
  [hosted terms](https://opencode.ai/legal/terms-of-service) govern the
  website and hosted inference, not that binary. Spawning `opencode run`
  is use of OpenCode.

**Mimicking the vendor harness.** A foreign client uses the subscription
by calling private endpoints, replaying OAuth or session tokens, or
presenting itself as the official app. That includes a local
OpenAI-compatible proxy in front of those endpoints.

- Anthropic classifies OAuth from Free, Pro, or Max inside any other
  product, including the Agent SDK, as a violation of the Consumer Terms.
  Offering Claude.ai login, or collecting, storing, or relaying those
  credentials, is not permitted. They may enforce without notice.
- Cursor staff classify an unofficial proxy that sends the account token
  to private client endpoints as a breach of Terms §1.5, whether or not
  anyone else can use the proxy. It is not an authorized client. Abuse
  enforcement can include an account ban. A local OpenAI-compatible
  bridge to those endpoints is the same case.
- OpenCode Zen's free tier is rejected unless the request is from
  OpenCode (`OpenCode's free tier can only be used from within
OpenCode`). That limit is the free tier, not the MIT CLI.

This epic is only the first use: spawn the unmodified binary on `PATH`.
It does not read subscription tokens, call private client endpoints, or
present Langflower as Claude Code, Cursor, or OpenCode. Plain-text
attribution is allowed; the UI must not imply the vendor built or
endorses Langflower.

## Goal

A subscription that exists only inside a vendor harness (Claude Code,
Cursor `agent`, OpenCode) becomes a canvas node. An OpenAI-compatible LLM
keeps orchestration (`tools`, `feedback`, `accept`). Implementation is one
shot of the vendor CLI. Two shapes share one runner: a print node
(`prompt` in, parsed text out) and a subagent node that announces the same
CLI as one `ToolHandle`. The CLI keeps its own transcript. Langflower
stores only the vendor session id.

Pointing an OpenAI LLM at a community `/v1/chat/completions` wrapper is
already possible and is not this epic. That path stays chat-shaped: the
harness uses its own tools, and Langflower `ToolHandle`s do not apply.

## Tradeoff

The published CLI is a narrow capability. One activation sends one prompt
and returns one text result. Langflower tools, `feedback`, and path-choice
stay on the OpenAI LLM. They do not enter the vendor process. The node
remembers only `cliSessionId`. File writes, permissions, and project rules
are whatever that CLI already does in print mode.

That limit is the stable contract. The node speaks the documented
print/run flags and the JSON result those flags already publish. It leaves
the vendor binary and the vendor login in place.

The private client protocol behind a vendor harness is not that contract.
It changes with the app, often without a versioned schema. A wrapper that
mimics the official client, or that calls those private endpoints, has to
be patched on each of those changes. Pinning argv and the documented JSON
fields avoids that chase, and it stays on the CLI use the legal notice
describes.

## In scope

Six palette nodes, one shared runner, one process per activation.
No interactive TUI. Print nodes take a wired `prompt`. Subagent nodes
take the parent tool argument `task` as that prompt.

| Node                           | Default binary | Notes                                   |
| ------------------------------ | -------------- | --------------------------------------- |
| `common-claude-cli`            | `claude`       | Claude Code print mode                  |
| `common-cursor-cli`            | `agent`        | Panel override for older `cursor-agent` |
| `common-opencode-cli`          | `opencode`     | `opencode run`                          |
| `common-claude-cli-subagent`   | `claude`       | Same CLI, one `ToolHandle`              |
| `common-cursor-cli-subagent`   | `agent`        | Same CLI, one `ToolHandle`              |
| `common-opencode-cli-subagent` | `opencode`     | Same CLI, one `ToolHandle`              |

Category **AI**. `defineReactiveNode`, not `defineLlmNode`.
`defineLlmNode` always adds `tools`, `steerControl`, `toolLog`, and
`recovery`
([define-llm-node.ts](../../../../packages/node-sdk/src/node-factory/define-llm-node/define-llm-node.ts)).

Print-node ports: `prompt` (string in) and `response` (string out). No
`tools`, `feedback`, `accept`, `toolLog`, `steerControl`, or
`subagent-registration`. A print node does not register a `ToolHandle`.

`response` is the parsed assistant text, not raw stdout and not the vendor
tool log. Vendor tool events are not ports. The work log may show the node
as busy; it does not grow a second output.

Panel:

- Binary override. Empty uses the default command on `PATH`.
- `model` string. Empty omits `--model`.
- `resetSessionOnInput`, default off, same meaning as on OpenAI LLM.

Spawn lives in `@langflower/tools`: argv array, `shell: false`,
`cwd` = `projectDir`, stdin closed after the write (or immediately when the
prompt is only an argv slot). Do not reuse internal `spawnCapture` (grep).
Add a public spawn that accepts stdin and an abort signal. The common-nodes
runner is the consumer. Server stays thin.

Graph shape for a print node: OpenAI LLM `response` wires to harness
`prompt`. Harness `response` wires onward, including back to the
orchestrator `feedback`. Subagent shape is below. Thin node files sit next to
[openai-llm](../../../../packages/common-nodes/src/ai/nodes/openai-llm/node.ts).
The shared runner is under `ai/features/`.

## CLI as a Sub-Agent tool

`common-claude-cli-subagent`, `common-cursor-cli-subagent`, and
`common-opencode-cli-subagent` expose that CLI as a specialist the parent
calls. The parent is an OpenAI LLM, or a canvas Sub-Agent, with this
handle wired into `tools`. The vendor CLI still uses only its own tools.
Langflower does not pass a tool inventory into the process.

Same runner, argv, permissions, model string, and `{ cliSessionId }` as
the print node of that vendor. `task` is the prompt. Resume and fork rules
do not change.

Ports: one output, `subagent-registration`, wire type
`TOOL_HANDLE_WIRE_TYPE`, one `ToolHandle`. No `prompt`, `response`,
`tools`, `feedback`, `accept`, `toolLog`, `steerControl`, or `recovery`.
This is the inventory wire from
[ADR-021](../../../adr/021-sub-agent-registration-port-routed-spawn-nodeid-filter.md).
It is not `common-sub-agent`: no OpenAI tool loop, no Settings provider,
no skill multiselect.

Handle shape, matching that ADR where it is the same idea:

- `toolId` is the slug of `{displayName}(subagent)`, otherwise `nodeId`.
- `name` keeps the `(subagent)` suffix.
- `inputSchema` is `{ task: string }` required. No `skillId`.
- The description says this specialist runs the named vendor CLI and that
  CLI's own tools, then returns text. It tells the parent not to treat the
  handle as files, shell, or MCP.

`invoke` is serial per node. Overlapping calls queue. A call runs one CLI
process. Success returns the parsed assistant text. Failure returns a
string `Error: …` (missing binary, non-zero exit, bad JSON, missing vendor
session, abort), not `''`. There is no graph port to put that error on.

Each successful invoke is one CLI turn and may replace `cliSessionId`.
A failed invoke does not. `resetSessionOnInput` applies to the next
`task`: that call starts a new vendor session and omits resume flags.
A print node and a subagent node do not share an id.

The parent tool result is the only text the orchestrator sees. These
nodes add no second output for stderr or the vendor tool log.

## Out of scope

- OpenAI-compatible wrapper servers and base URL on the OpenAI LLM node.
- A `session_id` port, and `--continue` / `-c` without an id.
- Deleting vendor session files on Reset session.
- Passing Langflower `ToolHandle`s into the CLI (`--mcp-config`, `--tools`,
  `--approve-mcps`, a `tools` input on either node shape). The three
  subagent nodes emit one handle; they do not accept one.
- Skill multiselect, `skillId`, or an OpenAI provider on the CLI subagent.
- A CLI subagent hosting another registration. It has no `tools` input.
- Permission bypass: `--dangerously-skip-permissions`,
  `--permission-mode` (`bypassPermissions`, `acceptEdits`, `auto`,
  `dontAsk`), `--allowedTools`, `--allow-dangerously-skip-permissions`,
  `--force`, `--yolo`, `--trust`, `--sandbox disabled`, `--auto`.
- A second port for stderr, tool log, or a token stream.
- System-prompt replacement, `--effort`, `--variant`, `--thinking`.
- `--bare`, `--worktree`, `--attach`, `--cloud`, `--bg`.
- `opencode serve`.
- Mediating each vendor tool call through Langflower `toolPermissions`.
- A live subscription run in CI.
- An Inspector dropdown that shells out to `agent models` or
  `opencode models`.

## CLI mechanics

Sources:

- Claude: [headless](https://code.claude.com/docs/en/headless),
  [CLI reference](https://code.claude.com/docs/en/cli-reference)
- Cursor: [headless](https://cursor.com/docs/cli/headless),
  [parameters](https://cursor.com/docs/cli/reference/parameters),
  [output format](https://cursor.com/docs/cli/reference/output-format)
- OpenCode: [CLI](https://opencode.ai/docs/cli/),
  [permissions](https://opencode.ai/docs/permissions/),
  [run.ts](https://github.com/anomalyco/opencode/blob/HEAD/packages/opencode/src/cli/cmd/run.ts)

The prompt is one argv element after the flags. `spawn` does not use a
shell, so a leading `-` stays data. Stdin is closed: Claude warns on
stderr and keeps the argv query; OpenCode reads non-TTY stdin to EOF and
appends it; Cursor `-p` used to hang on an open stdin pipe.

Working directory is `projectDir`. Cursor also receives
`--workspace <projectDir>`. OpenCode also receives `--dir <projectDir>`.

Auth is the CLI's existing subscription login (`claude auth login`,
`agent login`, `opencode auth login`). Do not pass Langflower secrets,
`--api-key`, `ANTHROPIC_API_KEY`, or `CURSOR_API_KEY`. `--bare` drops
Claude subscription login, so it is forbidden.

`--model` is present only when the panel string is non-empty.
Resume flags are present only when node state has `cliSessionId` and
`resetSessionOnInput` is off.

- Claude, new: `claude -p --output-format json --permission-prompts none [--model <model>] <prompt>`
- Claude, continue: `claude -p --output-format json --permission-prompts none --resume <cliSessionId> --fork-session [--model <model>] <prompt>`
- Cursor, new: `agent -p --output-format json --workspace <projectDir> [--model <model>] <prompt>`
- Cursor, continue: `agent -p --output-format json --workspace <projectDir> --resume <cliSessionId> [--model <model>] <prompt>`
- OpenCode, new: `opencode run --format json --dir <projectDir> [--model <model>] <prompt>`
- OpenCode, continue: `opencode run --format json --dir <projectDir> --session <cliSessionId> --fork [--model <model>] <prompt>`

Stdout:

- Claude `--output-format json`: one object. `response` is string `result`
  when exit code is 0. Otherwise the port errors with stderr plus a stdout
  tail. A failure such as missing auth may print on stdout with a non-zero
  code; that is still a port error.
- Cursor `--output-format json`: success is exit 0 and
  `type: result`, `subtype: success`, `is_error: false`, text in `result`.
  Failure is non-zero and stderr, with no JSON object. Do not parse
  `stream-json` in this epic.
- OpenCode `--format json`: NDJSON `{ type, timestamp, sessionID, ... }`.
  `response` is the concatenation of `type: text` parts (`part.text`) in
  order. Ignore `tool_use`, `step_start`, `step_finish`, and `reasoning`.
  A `type: error` event or a non-zero exit is a port error.

Permissions stay outside Langflower. The node never passes the bypass
flags listed under Out of scope. What the CLI does instead:

- Claude `-p` with no permission host denies calls that would prompt.
  `--permission-prompts none` (CLI 2.1.259+) also tells Claude not to retry
  and removes `AskUserQuestion`. That is deny, not approve. If the binary
  rejects the flag, the port errors with stderr. Do not fall back to
  skip-permissions.
- Cursor headless without `--force` proposes edits and does not write
  files. That proposal text is a valid `response`. The Using page mentions
  full write access in print mode; this epic follows the headless page.
  Do not pass `--trust`. If the process exits because the workspace is
  untrusted, the port error tells the operator to trust it in the Cursor
  CLI.
- OpenCode `run` without `--auto` replies `reject` to `permission.asked`
  (`permission requested: …; auto-rejecting`). Non-interactive sessions
  deny `question`, `plan_enter`, and `plan_exit`. An explicit OpenCode
  `deny` still holds. Exit 0 after a rejection is `response` text, not a
  port error.

`toolPermissions` do not apply inside the child. The operator sets trust
and allow lists in the CLI before the run.

Stop follows the runner abort. Send SIGINT, then SIGTERM if the child is
still alive. Claude exits 143 on SIGTERM and kills its Bash tree. The port
errors. It does not emit an empty `response`.

Missing binary, non-zero exit, unparseable success JSON, and a vendor
session id the CLI no longer finds are port errors. A denied vendor tool
inside an otherwise successful process stays in `response`.

## Model

`model` is a panel string. It is not the Settings chat catalog and not
`ec.chat`. Empty omits `--model` and the CLI uses its subscription
default. A non-empty value is passed on every launch, including resume:

- Claude: alias (`sonnet`, `opus`, `haiku`, `fable`) or a full model id.
  `--model` overrides the CLI setting and `ANTHROPIC_MODEL` for that
  launch.
- Cursor: an id from `agent models`.
- OpenCode: `provider/model`.

Changing the string does not rewrite the stored transcript. The next turn
goes out with the new `--model`. History stays in the vendor session.

## Context

The CLI stores the turn context. Langflower does not.

Workflow session head stores `{ cliSessionId: string }` only, via
`NodeStateHook`
([SESSIONS.md](../../../reference/SESSIONS.md)). No messages, tool
results, or file snapshots. OpenAI, Fake, Review, and Critique persist
`{ history }`. These nodes do not.

The vendor transcript is the Claude session, the Cursor chat, or the
OpenCode session. Because `--bare` is not passed, the CLI also loads its
own project context (`CLAUDE.md`, skills, hooks, project MCP, Cursor
rules, OpenCode config). Langflower `promptContext` is not injected.

Each activation sends only the current `prompt` string. Earlier graph
prompts are not replayed. Anything the orchestrator needs in this turn
belongs in that string.

Each node has its own `cliSessionId`. A print node, a subagent node, and
the OpenAI LLM do not read each other's ids.

`resetSessionOnInput` (default off): a non-blank `prompt` starts a new
vendor session and omits resume flags. **Reset session** clears
`nodeStates` for the tab and also starts fresh. Neither deletes CLI
session files.

`persist$` emits the full `{ cliSessionId }` after a successful turn,
once the id is read (`session_id` for Claude and Cursor, `sessionID` for
OpenCode). A failed turn does not replace the stored id.

## Workflow session resume

A later Run on the same workflow session can continue the vendor
transcript.

The runner restores head `nodeStates` and calls `restore` before wiring.
The node then passes `--resume` or `--session` and only the new `prompt`.
Stop, process restart, and the next Run keep that context when the head
flush wrote the id (1000 ms debounce; Stop and detach flush immediately;
a crash inside the window drops the last id, same as any node state).

**Continue from…** restores the point's `nodeStates`. So the id captured
at the boundary is not appended to by later turns:

- Claude and OpenCode fork on every continue
  (`--resume <id> --fork-session`, `--session <id> --fork`). The source
  id stays put. The id in the new JSON becomes the head. A point keeps
  the old id and still names the transcript at that boundary.
- Cursor documents `--resume [chatId]` and no fork. A head Run continues
  the same chat. Continue from a point passes that same id, which may
  already contain turns from after the point. Do not invent a fork flag.
  Record this limit in the use-case.
- Do not pass `--continue` without an id. That selects the latest session
  in the directory, which may belong to another tool.
- There is no `session_id` port and no picker of foreign CLI sessions.
- `restore` of JSON that is not `{ cliSessionId: string }` returns
  `{ ok: false }` and the node starts fresh, per the hook contract. If
  the id is well-formed but the CLI cannot find it, a print node port
  errors and a subagent `invoke` returns `Error: …`. Do not silently
  start a new chat.
- A new session tab gets `restore(null)` and a new CLI chat. Resetting
  one tab does not delete another tab's vendor sessions.

## Acceptance criteria

1. The palette lists `common-claude-cli`, `common-cursor-cli`, and
   `common-opencode-cli` under AI. Each definition uses
   `defineReactiveNode` and exposes only `prompt` and `response`.
2. A fake binary test proves the argv table above, including omitted
   `--model` when the panel is empty, resume and fork flags when
   `cliSessionId` is restored, and the absence of every bypass flag in
   Out of scope. Stdin is closed. `cwd` is the project directory.
3. The same tests map a fixture stdout to `response` (Claude `result`,
   Cursor success object, OpenCode text parts) and map non-zero exit,
   bad JSON, an OpenCode `error` event, and a missing binary to a port
   error rather than `''`.
4. After a successful turn, `persist$` emits `{ cliSessionId }` and does
   not emit messages. `resetSessionOnInput` drops resume flags for that
   activation. A second activation in the same run uses the id from the
   first success.
5. Abort kills the child (SIGINT, then SIGTERM). A print node port
   errors. A subagent `invoke` returns `Error: …`.
6. The palette lists `common-claude-cli-subagent`,
   `common-cursor-cli-subagent`, and `common-opencode-cli-subagent`. Each
   emits one `ToolHandle` on `subagent-registration` and has no other
   ports. A fake invoke with `task` `fix the test` uses the same argv as
   that vendor's print node with that prompt, and the tool result is the
   parsed text or `Error: …`.
7. A use-case under `docs/product/use-cases/` states both graph shapes,
   the no-bypass rule, and the Cursor point-resume limit. Status
   flips only when these criteria and the verify gate are green. The
   helper skill Can / Cannot matches that use-case. Do not claim a live
   subscription run; CI proof is the fake binary
   ([TESTING.md](../../../guides/TESTING.md#live-openai-compatible--mcp-tool-calling)).

## Verify

- Intermediate: fake-binary unit tests and package typecheck while
  iterating.
- **Close-out (required):** `npm run typecheck` and `npm run test` (or
  full `verify`). Do not mark done on `verify --quick` or on tests
  without typecheck.
