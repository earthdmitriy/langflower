# Epic 45 — Global KV secrets

**Status:** landed — slices A–D  
**Depends on:** [18-settings-panel](18-settings-panel.md)
(Settings Global, write-only provider keys, config redact);
[16-mcp-optional](16-mcp-optional.md) (MCP http/stdio wire +
jsonc `mcp.servers`).  
**Index:** [README.md](README.md)  
**Related:** [settings-panel](../../use-cases/settings-panel.md),
[node-local-mcp](../../use-cases/node-local-mcp.md),
[CONFIG.md](../../CONFIG.md),
[ADR-002 amend](../../ADR.md#adr-002--langflower-project-local-storage-opencode-style),
[TBD-010](../../TBD.md#tbd-010--os-backed--encrypted-secret-storage)

## Goal

Operators keep **named secrets outside the project folder**. Workflows and
project jsonc reference them by id (`{lf_secrets:API_TOKEN}`); the value
never lands under `<project>/.langflower/` or in workflow JSON.

**Proof of usability (final slice):** `common-mcp-http` (and jsonc
`mcp.servers` http) send Cursor-style `headers`, interpolating `{lf_secrets:…}`
and `{env:…}` — e.g. `"Authorization": "Bearer {lf_secrets:API_TOKEN}"` —
without putting the token in the repo.

This epic **hides secrets from the workspace**. It does **not** claim
encryption, OS keychain, or protection from the same OS user reading the
global secrets file. That stronger bar is [TBD-010](../../TBD.md#tbd-010--os-backed--encrypted-secret-storage).

## Locked decisions

1. **Global only.** Secrets are user-global, not project-scoped. Do not write
   values into `<project>/.langflower/langflower.jsonc`, workflows, or any
   other project tree path. Team sharing = each operator fills the same **id**
   in their Global store.
2. **Sibling file, not mixed into provider jsonc.** Persist a dedicated
   user-global secrets file next to the existing global config (same OS dir as
   ADR-002: `%APPDATA%\langflower\`, `~/Library/Application Support/langflower/`,
   or XDG). Exact filename locked at impl (`langflower.secrets.json` or
   similar). Main `langflower.jsonc` stays free of KV values so copying that
   file does not copy secrets.
3. **Plaintext at rest (honest).** v1 is a JSON/JSONC map `id → string` with
   restrictive file permissions where the OS allows. Not a vault. Document
   this in CONFIG. OS credential store / DPAPI / Keychain = TBD-010, not this
   epic.
4. **Write-only UI, same hygiene as provider `apiKey`.** Settings → **Global**
   only: add / replace / delete rows (id + password field). Reopen never
   shows the stored value (`hasValue` / placeholder “Saved — enter new value
   to replace”). No reveal control. Values travel **client → server only** on
   Save (mirror `providerApiKeys`: empty field = leave existing; omit id =
   delete).
5. **Snapshots never contain values.** `langflower.config.snapshot`, session
   state, settings draft, and feed expose **ids** (and `hasValue`) at most.
   JSONL logs `langflower.secrets.save.requested` as `"REDACTED"` (event
   type, not a key walk). `apiKey` / `providerApiKeys` on config save are
   still redacted in that log.
6. **Placeholders (substring).** Resolve at connect/runtime on the server:

    | Token             | Source                                                   |
    | ----------------- | -------------------------------------------------------- |
    | `{lf_secrets:ID}` | Global KV file (`ID` = `^[A-Za-z_][A-Za-z0-9_]*$`)       |
    | `{env:VAR}`       | `process.env` (same charset; keep as CI / headless path) |

    Missing / empty secret or env → loud failure (`{ ok: false }` / MCP
    connect error). Do not echo resolved values in the error string.

7. **Do not migrate provider `apiKey` into KV in this epic.** LLM keys stay on
   `provider.*.options.apiKey` / `providerApiKeys`. KV is the generic named
   store for MCP headers and later string fields.
8. **Final slice is the proof:** HTTP MCP `headers` map (Cursor-compatible)
   on the wire node **and** `mcp.servers` http entries, with interpolation.
   Without that slice the store is unused.

## In scope

### Slice A — Store + redact + ADR

Landed (2026-08-31): user-global `langflower.secrets.json`, inbound
`langflower.secrets.save.requested` (`secretIds` / `secretValues`), snapshot
`secretIds` + `secretsPath`, JSONL payload `"REDACTED"` for that event type,
ADR-002 amend + CONFIG.

- Amend ADR-002 (or a short sibling ADR): user-global secrets file; never
  project tree; plaintext-at-rest accepted for v1.
- Types + save payload (ids + write-only values) on shared config/WS
  contracts. Snapshot shape: secret **ids** + `hasValue`, no values.
- Server read/write the global secrets file; `chmod` 0600 when possible.
- Redact layers, settings draft, bridge JSONL.
- CONFIG.md: where the file lives, what is **not** guaranteed.

### Slice B — Settings Global UI

Landed (2026-08-31): Settings Global **Secrets** group (disclaimer, write-only
rows, `secretsPath` hint); Project hint only; Save emits
`langflower.secrets.save.requested` then config save.

- New **Secrets** group on **Global** scope only (hidden or disabled on
  Project, with a one-line “stored in Global” hint).
- Add / delete rows like providers: **Id** + write-only value. Save/Discard
  through the existing settings draft session (extend draft types; never
  put values on `baseline` snapshots sent to the client).
- Path hint: global config dir / secrets file path (server-resolved, S6
  style).
- **Info block / disclaimer** (always visible above the secret list on
  Global). Near-final copy:

    > Secrets are stored in Langflower user settings on this computer, not in
    > the project. Those Langflower files can still be read — this is not
    > encryption. The goal is to keep secrets out of the workspace so agents
    > cannot retrieve them with file tools.

    Rephrase at impl if needed; keep the three facts: (1) user-global
    Langflower settings, (2) readable there, (3) workspace-hidden so harness
    file tools cannot reach them.

### Slice C — Interpolator

Landed (2026-08-31): `interpolatePlaceholders` in
`packages/tools/src/secrets/` (injected secret bag, injectable env, Result,
no re-scan of replacements). First consumer is slice D (`resolveMcpHttpHeaders`).
Provider `{env:}` in `resolveProviderCredentials` stays whole-string.

- Pure resolve helper in `@langflower/tools` (runtime I/O may read env;
  secret bag injected by server — tools must not import server).
- Unit tests: substring, missing id, missing env, no echo of values.
- Designed for reuse beyond MCP (any later string field).

### Slice D — MCP HTTP headers (proof of usability) **last**

Landed (2026-08-31): `headers` on `common-mcp-http` and jsonc http
`mcp.servers`; `{lf_secrets:}` / `{env:}` interpolated at connect;
protocol headers win; missing secret / invalid JSON → S5/S6.

- `common-mcp-http`: `headers` input (`wireType: 'json'`, multiline JSON
  textarea; parser accepts object or JSON string).
- Pass through `connectMcpHttpWithOptionalLaunch` → existing
  `connectMcpHttpClient.headers`. Protocol headers (`content-type`,
  `accept`, `MCP-Protocol-Version`, `Mcp-Session-Id`) win over user keys.
- `LangflowerMcpHttpServerConfig.headers` + jsonc schema (skeleton +
  dogfood copies) + `parseMcpServer` + `createSystemMcpHandles`.
- Interpolate `{lf_secrets:}` and `{env:}` in header **values** at connect.
- Invalid JSON / missing secret → port error (S5) / system ctx error (S6).
- Docs: CONFIG MCP example, node-local-mcp auth scenario, workflow-writer
  helper KB.

Proof recipe (manual or test with mock fetch):

```text
Settings Global → secret id API_TOKEN = <value>
common-mcp-http url = https://example.com/mcp
headers = {"Authorization":"Bearer {lf_secrets:API_TOKEN}"}
```

Expect: POST carries `Authorization: Bearer <value>`; project tree and
workflow JSON contain only the placeholder; UI never redisplays `<value>`.

## Out of scope

- OS keychain / Credential Manager / DPAPI / encrypted vault ([TBD-010](../../TBD.md#tbd-010--os-backed--encrypted-secret-storage)).
- Project-scoped secrets; secrets in `mcp.servers` values (ids only).
- Reveal / copy-out of stored values (hand-edit of the **global secrets
  file** remains the escape hatch — same honesty as provider keys on disk).
- Settings editor for MCP server list (still hand-edit jsonc).
- Inspector autocomplete of secret ids on the headers field.
- Moving LLM `apiKey` onto the KV store.
- Feed redaction of **literal** secrets an author pasted into a port
  (authoring mistake); placeholders are the supported path.

## Acceptance criteria

1. Saving a Global secret does **not** create or modify any file under the
   open project directory. Grep of `.langflower/` / workflows after Save
   finds the id placeholder at most, never the value.
2. Reopening Settings Global shows the secret id and write-only empty field
   (`hasValue`); snapshots and JSONL have no secret values. The Secrets group
   shows the disclaimer (user settings, readable there, workspace-hidden from
   file tools).
3. Delete row + Save removes that id from the global secrets file; MCP
   connect using `{lf_secrets:thatId}` fails loud.
4. `{env:VAR}` still resolves from process env (CI path) without requiring
   a KV row.
5. **Proof:** `common-mcp-http` and jsonc http `mcp.servers` send interpolated
   `headers` (unit: mock fetch sees `Authorization`; invalid headers / missing
   secret → connect error). Documented example:
   `"Authorization": "Bearer {lf_secrets:API_TOKEN}"`.
6. ADR/CONFIG state clearly: workspace-hidden, **not** encrypted at rest.
7. Use-case Missing parts for settings-panel S7 and node-local-mcp auth
   scenario marked done when slices A–D land (Status flip only after
   close-out verify).
8. Close-out verify green (below).

## Implementation notes (non-normative)

Likely touch:

- [`packages/shared/src/types/langflower-config.ts`](../../../packages/shared/src/types/langflower-config.ts)
  — save payload + snapshot ids; `LangflowerMcpHttpServerConfig.headers`
- [`packages/server/src/config/`](../../../packages/server/src/config/) —
  secrets file I/O (`writeSecrets`), redact, `writeSettings`
- [`packages/ui/src/app/features/sidebar/components/lf-settings-panel.component.ts`](../../../packages/ui/src/app/features/sidebar/components/lf-settings-panel.component.ts)
- [`packages/tools/src/mcp/mcp-http-client.ts`](../../../packages/tools/src/mcp/mcp-http-client.ts)
  — launch `headers` passthrough; interpolator
- [`packages/common-nodes/src/mcp/mcp-http/node.ts`](../../../packages/common-nodes/src/mcp/mcp-http/node.ts)
- Schema copies under `packages/server/skeleton/schemas/` + dogfood

On-node `headers` must default to a **string** (`''` / `'{}'`), not `{}`:
the textarea uses `String(value)` and would show `[object Object]`.

## Verify

- Intermediate (optional): focused vitest on config redact, secrets I/O,
  interpolator, mcp-http connect, settings draft; `verify --quick` while
  iterating.
- **Close-out (required):** `npm run test` or full `verify` — unit **and**
  integration. Do not mark the epic done on `--quick` alone.
- `dead-code` → `check-exports` if a new tools export path is added.

## Links

- [settings-panel use-case](../../use-cases/settings-panel.md) (S4 write-only
  keys; **S7** Global KV)
- [node-local-mcp](../../use-cases/node-local-mcp.md) (S2 URL; **auth headers**
  scenario)
- [settings-panel feature](../../features/settings-panel.md)
- [project-configuration](../../features/project-configuration.md)
- [CONFIG.md](../../CONFIG.md)
