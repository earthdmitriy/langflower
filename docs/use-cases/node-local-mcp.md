# Node-local MCP

**Status:** Partial — happy-path wire + system MCP tools landed; wire connect
fail → port error (S5) landed; system MCP fail → per-node ctx `error$` (S6)
landed. Authenticated HTTP `headers` / `{lf_secrets:}` landed
([epic 45](../DONE/EPICS/45-global-kv-secrets.md) S7).

## Value

Attach **workflow-specific** MCP servers (stdio CLI or HTTP) as canvas nodes, or
declare **project** servers in `langflower.jsonc` — both arrive at the agent as
**ready** `ToolHandle[]` values (never raw config for the agent to expand). One MCP
node can fan out to several agents. Failures MUST be loud: silent empty
inventory or a “successful” run that never started the MCP the author enabled
is **not** this Value.

## UX scenarios

### S1 — Stdio MCP for a coding agent

**Who:** Author wiring an agent that needs `ts-scan` (or similar) tools.

**Want:** Launch `npx ts-scan -mcp` for this workflow only.

**Do:** Place **MCP stdio**, set `command`, wire `tools` → LLM `tools`.

**Expect:**

- On run the MCP node MUST connect; the agent inventory MUST include that
  server’s tools (`<mcp_name>__<tool>`).
- Remove the wire to disable — MUST NOT require an Inspector checklist for
  wired MCP.

### S2 — Remote HTTP MCP

**Who:** Author using an already-running MCP HTTP endpoint.

**Want:** Point at a URL without spawning locally.

**Do:** Place **MCP http**, set `url` only, wire to agent(s).

**Expect:**

- Client MUST connect to the URL; optional `command` unused when empty.

### S3 — Local HTTP launch + URL

**Who:** Author whose MCP speaks HTTP and needs a local process first.

**Do:** Set both `command` (shell) and `url`; wire `tools` → agent `tools`.

**Expect:**

- Process MUST start; client retries until the endpoint answers (or fails per
  S5).

### S4 — Project MCP from jsonc (enabled-only spawn)

**Who:** Author who wants the same MCP on many workflows without wiring a node.

**Want:** Only servers they actually enabled start — unused `mcp.servers`
entries stay cold.

**Do:** Declare `mcp.servers` in `langflower.jsonc`. On agent Inspectors,
enable server ids under **Enabled MCP** only where needed.

**Expect:**

- Run MUST spawn **only** servers whose id appears in **Enabled MCP** on at
  least one node of the active workflow.
- Servers never enabled on any node MUST NOT be started.
- Each agent’s context MUST get only **its** enabled handles. Agent bind MUST
  NOT read `enabledMcpIds` — server already filtered.

### S5 — Wire MCP connect fails

**Who:** Author whose stdio/http MCP command or URL is wrong / process dies /
initialize has no `serverInfo.name`.

**Want:** Know immediately that this MCP node failed — not discover missing
tools later in chat.

**Do:** Wire MCP → agent; start a run that hits connect/initialize failure.

**Expect:**

- The MCP node’s **output port** MUST enter **error** (visible in execution /
  feed projection).
- MUST NOT swallow the failure as idle/`EMPTY` or emit a successful empty
  handle.
- Downstream agents MUST NOT treat the failed wire as a live tool source.

### S6 — System MCP connect fails (per-node ctx)

**Who:** Author with several agents; one Enabled MCP id points at a broken
command or unreachable server.

**Want:** See **which nodes** are affected; keep other agents usable; fix by
turning the bad id off in Inspector and re-running.

**Do:** Enable the broken server on some agents only; start a run.

**Expect:**

- Nodes that enabled the failing id MUST surface the failure on their
  **execution context** (author can tell which nodes are broken).
- Nodes that did **not** enable that id MUST NOT fail solely because another
  node’s MCP failed.
- Author MUST be able to clear the id from **Enabled MCP** and re-run without
  that server starting.
- MUST NOT silently omit the failed server from inventory while looking like a
  healthy start for those nodes.

### S7 — Authenticated HTTP MCP (headers + secrets)

**Who:** Author calling a remote MCP that requires `Authorization` without
putting the token in the project folder.

**Want:** Cursor-style `headers` on **MCP http** / jsonc `mcp.servers` http,
with `{lf_secrets:ID}` (Settings Global) or `{env:VAR}`.

**Do:** Set `headers` to
`{"Authorization":"Bearer {lf_secrets:API_TOKEN}"}` (node or jsonc).
Store `API_TOKEN` in Settings → Global secrets
([settings-panel S7](settings-panel.md#s7--store-a-named-secret-in-global-not-in-the-project)).
Wire `tools` → agent.

**Expect:**

- Connect MUST send the interpolated header; workflow / project jsonc MUST
  contain only the placeholder, not the token.
- Missing secret or invalid headers JSON MUST fail loud (same as S5 / S6).
- `{env:VAR}` MUST work without a KV row (CI).
- OS keychain is **not** required
  ([TBD-010](../TBD.md#tbd-010--os-backed--encrypted-secret-storage)).

## UI specs

| Spec                                                             | Scenarios covered                           |
| ---------------------------------------------------------------- | ------------------------------------------- |
| [node-library.md](../features/node-library.md)                   | S1–S3, S5, S7 (palette MCP nodes + headers) |
| [inspector.md](../features/inspector.md)                         | S4, S6 (Enabled MCP)                        |
| [project-configuration.md](../features/project-configuration.md) | S4 (`mcp.servers`); S7 http `headers`       |
| [settings-panel.md](../features/settings-panel.md)               | S7 (`{lf_secrets:}` from Global KV)         |
| [workflow-execution.md](../features/workflow-execution.md)       | S5, S6 (port / node error visibility)       |
| [feed-panel.md](../features/feed-panel.md)                       | S5, S6 (when errors project into feed)      |

## Runtime requirements

| Need                                                      | Why   | Today                                                                     | Caution                               |
| --------------------------------------------------------- | ----- | ------------------------------------------------------------------------- | ------------------------------------- |
| Wire connect fail → port `error`                          | S5    | Landed — `subscriber.error` + unit tests; empty command/url stay inactive | Do not map fail to silent `EMPTY`     |
| Spawn = union of workflow `enabledMcpIds`                 | S4    | Landed (`collectEnabledMcpIdsFromNodes`)                                  | Do not start all `mcp.servers`        |
| System connect fail → ctx `error$` on enabling nodes only | S6    | Landed — partial pool + `throwError(CtxError)` on hidden ctx              | Prefer ctx error-lane over seed abort |
| Agent merges ready handles only                           | S1–S4 | Landed                                                                    | Agent MUST NOT expand jsonc           |
| Disable id + re-run skips broken server                   | S6    | Landed                                                                    | —                                     |
| HTTP `headers` + `{lf_secrets:}` / `{env:}` interpolation | S7    | Landed — [epic 45](../DONE/EPICS/45-global-kv-secrets.md)                 | Do not put tokens in workflow JSON    |

## Status

### Missing parts

| Layer | Gap                                            | Sn  | Done when |
| ----- | ---------------------------------------------- | --- | --------- |
| —     | None for S1–S7 connect-fail / auth-header bars | —   | —         |

### Workarounds

- Wire: fix `command` / `url`; remove the wire to disable.
- System: remove the bad id from **Enabled MCP** on affected nodes and re-run
  (spawn already skips unused ids).
- Authenticated HTTP MCP: `headers` on **MCP http** / jsonc http with
  `{lf_secrets:ID}` or `{env:VAR}`. Literal tokens in `url` query are not
  the product path.

### Demo / CI

- Fixture: `tests/fixtures/mcp/echo-server.mjs` (happy path).
- Unit: openai-llm + fixture MCP tool loop; system enable filter tests.
- Unit S5: `mcp-stdio` / `mcp-http` connect fail → `output-emitted` `state:'error'`;
  empty command/url → no port error.
- Unit S6: partial `createSystemMcpHandles` (`@langflower/tools`); ctx `CtxError` → output port error.
- Epic: [45-global-kv-secrets](../DONE/EPICS/45-global-kv-secrets.md) (S7 landed).
