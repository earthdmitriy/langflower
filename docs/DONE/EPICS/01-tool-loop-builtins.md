# Epic 01 — Tool-loop + built-in harness tools

**Status:** landed (implementation) — use-cases remain Blocked until pilots / epics 02+  
**Depends on:** LLM phases 1–6 (done); prefer epic 00 for doc clarity  
**Index:** [README.md](README.md)  
**Mechanics:** [MECHANICS-tool-execution.md](MECHANICS-tool-execution.md) — **internal** loop + file-ops patterns  
**Unlocks:** almost all agent use-cases (still Blocked until pilots / follow-ons)

**Landed note:** `@langflower/tools` + `ExecutionContext.harness` + internal tool
loop on `common-openai-llm` / scripted `common-fake-llm`; eight builtins;
`toolLog` feed role `tool`; `bash` default-deny; read-class `postProcess`.

## Goal

Satisfy [use-cases agent runtime prerequisites](../../use-cases/README.md):
LLM nodes **invoke** tools in a loop; Langflower **built-in defaults** work
under a server sandbox. Listing tools in the prompt is not enough.

This epic implements the **internal** tool-loop layer only. Builtins execute
inside the LLM node; authors bind inventory via existing `tools` registration
ports + `enabledToolIds`. Observability is feed + `toolLog` — not per-call
canvas edges. File-ops patterns and read-class `postProcess` are normative in
[MECHANICS-tool-execution.md](MECHANICS-tool-execution.md).

## Built-in tools (normative)

### Read-class (non-mutating)

Observation only. Optional per-call **`postProcess`**: pure
`(res: string) => string` (agent supplies source text; see mechanics).

| Tool   | Role                                                   |
| ------ | ------------------------------------------------------ |
| `read` | Read file contents (optional line/offset range)        |
| `glob` | Path pattern → matches (gitignore-aware by default)    |
| `grep` | Regex search across files (gitignore-aware by default) |

Future non-mutating tools (list, search, …) join this class and the same
`postProcess` contract when added — not required for epic 01 acceptance.

### Mutating

No `postProcess`.

| Tool     | Role                                                          |
| -------- | ------------------------------------------------------------- |
| `edit`   | In-place exact replace / patch (ambiguity → actionable error) |
| `write`  | Write / overwrite file (create parents as needed)             |
| `create` | Create new file (or path); **fail if exists**                 |
| `delete` | Delete file / path                                            |

### Shell

| Tool   | Role                                                                             |
| ------ | -------------------------------------------------------------------------------- |
| `bash` | Shell command (permission-gated; default-deny / strong UX nudge); not read-class |

## File-ops design locks (this epic)

1. **Separate package `@langflower/tools`** (`packages/tools/`) owns builtin
   tool implementations, schemas, path-fence helpers, and read-class
   `postProcess`. Server injects a bound harness into
   `ExecutionContext.harness` ([ADR-014](../../ADR.md#adr-014--project-root-harness-io)) —
   do **not** grow a permanent tool body under `packages/server/src/harness/`
   (thin adapter / wiring only is OK).
2. Keep **create / write / edit / delete** as distinct tools (do not merge).
3. Read-class results always become a **string** for the model; if
   `postProcess` is present, run it on that string after success.
4. No third-party tool pack as product API — optional thin engines OK **inside**
   `@langflower/tools`; Langflower tool ids/schemas stay owned there.
5. Dual surface later: palette harness nodes call the same `@langflower/tools`
   handlers; out of scope to ship palette nodes in this epic unless needed for
   tests.
6. Package boundary: `@langflower/tools` ↛ server / UI / common-nodes /
   websocket-bridge; common-nodes uses `ctx.harness` only.

## Next steps

1. Scaffold **`packages/tools`** (`@langflower/tools`) and wire it into the
   monorepo build / workspace deps.
2. Design **internal** tool-loop on `common-openai-llm` (and `common-fake-llm`
   for tests): parse tool calls → execute → append results → re-complete;
   `maxIterations`, `toolLog` (feed-visible).
3. Implement tools in `@langflower/tools`: path fence, read-class + mutating +
   bash handlers, gitignore defaults, pagination/caps, LLM-shaped errors,
   read-class **`postProcess`** (isolated, timeout, size cap; fail closed).
4. Server: bind project root + config into `ExecutionContext.harness` from
   `@langflower/tools` (adapter only).
5. Bind author-time `enabledToolIds` / wired registrations to **invoke**, not
   inventory-only.
6. Wire OpenAI-compatible `tools` / `tool_calls` through
   `createChatCompletionStream` (or sibling API) as needed.
7. Unit + WS integration: fake model emits tool call → file read → final
   response; `postProcess` strips/transforms read-class output; bash off by
   default.
8. Update [docs/LLM_NODES.md](../../LLM_NODES.md) disclaimer: foundation vs
   agent-ready; note `@langflower/tools` in NAVIGATION / package docs when
   the package lands.

## In scope

- New package `@langflower/tools` + server injection into `ExecutionContext.harness`
- Internal tool-call loop, eight builtins, sandbox, allowlist → invoke
- Read-class `postProcess` contract
- Fake-LLM / mock factory paths for deterministic tests
- Docs + NODE.md updates

## Out of scope

- Per-call `toolCall` / `toolResult` ports or canvas edges for builtins
- Runtime permission ladder (epic 02) — gates stay inside this loop when added
- Review node / port-routed control tools (epic 03 / phase 7)
- Sub-Agent spawn / Loop topology (epic 07)
- MCP invoke (epic 16)
- Palette harness nodes as a full catalog ship (handlers may be shared)
- Opt-in graph-hosted tool host (deferred; see mechanics Out of scope)
- Flipping use-case Status to Partial (epic 05)

## Acceptance criteria

1. `@langflower/tools` exists as a workspace package; builtin handlers live
   there (not as the long-term home under `packages/server/src/harness/`).
2. OpenAI LLM can complete a multi-step **internal** tool turn with at least
   `read` + `write` (no call/result edges required on the canvas).
3. All eight builtins exist and are gated by allowlist.
4. `bash` does not run unless explicitly enabled; docs warn.
5. `maxIterations` stops runaway loops; failures are visible in feed/`toolLog`.
6. Read-class tools accept optional agent-supplied `postProcess`
   `(res: string) => string`; successful transform changes the string returned
   to the model; transform failure is a tool error (not silent passthrough).
7. `create` fails when the target exists; `write` may overwrite — covered by
   unit tests.
8. `verify` green; use-cases README still Blocked but Missing parts cite this
   epic as landed when done.
