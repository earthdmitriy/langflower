# Langflower project config (`langflower.jsonc`)

LLM providers and default models are configured in:

`<project>/.langflower/langflower.jsonc`

Optionally, **user-wide defaults** live in a global file (ADR-002 amend). The
server merges **project over global** for overlapping keys / provider ids.
Settings UI (gear → right aside) edits either layer; hand-edit remains valid.

Format follows a subset of [OpenCode config](https://opencode.ai/docs/config/).
LLM chat nodes use the official [`openai`](https://www.npmjs.com/package/openai)
npm package (OpenAI-compatible HTTP API). Langflower does **not** use the Vercel
AI SDK for chat completions.

## JSON Schema (IDE)

First-run bootstrap copies schemas into `.langflower/schemas/` and seeds:

- `langflower.jsonc` → `"$schema": "./schemas/langflower-config.schema.json"`
- `workflows/*.json` → `"$schema": "../schemas/workflow.schema.json"`

Sources of truth live under `packages/server/skeleton/schemas/`. Workflow save
preserves a top-level `$schema` when present. Open the files in an editor that
honours `$schema` for autocomplete and docs on `permission`, `provider`, etc.

**Permission floor:** first-run seeds `permission` with all harness builtins
`allow`. Project jsonc is the **floor** — agents may only tighten via Inspector
`toolPermissions` (deny / ask / allow). A project `deny` hides that tool from
the Inspector table.

## Global config

Personal defaults shared across projects (Settings **Global** scope). Settings
v1 edits `model` / `provider` / `embedding` / `serverLogs` in that file.
Project-only keys (`currentWorkflowId`, `dividerPositions`, `paletteVisible`, `permission`,
`harness`, `mcp`, …) belong in the project file — do not put them in global;
hand-edit escape hatch still exists for power users.

### `paletteVisible` (left palette chrome)

Optional boolean on the **project** file only. Controls whether the left node
palette and its resize gutter are shown. Collapse with `<<` on the Palette
title row; restore with the floating `>>` on the canvas. The last valid
value is broadcast to all tabs (`editor.paletteVisible.snapshot`) and
written here. Hide does **not** persist `leftWidth: 0` — divider width
stays the last size.

| Value on disk         | Meaning                |
| --------------------- | ---------------------- |
| omitted / non-boolean | Palette shown (`true`) |
| `true`                | Palette shown          |
| `false`               | Palette hidden         |

### `serverLogs` (bridge diagnostics)

Optional boolean on either scope. Controls JSONL bridge diagnostics under
`.langflower/logs/`.

| Value on disk | Meaning                                            |
| ------------- | -------------------------------------------------- |
| omitted       | Default for that scope (inherit / product default) |
| `true`        | Enable logging for that scope                      |
| `false`       | Disable logging for that scope                     |

**Effective resolve:** project value wins when set; otherwise global; if both
omit, logging is **enabled** (same as the historical always-on default).
Settings radios map Off → `false`, On → `true`, Default → delete the key in
the active scope. Mid-session Save updates the live gate without restart.

| OS      | Path                                                        |
| ------- | ----------------------------------------------------------- |
| Windows | `%APPDATA%\langflower\langflower.jsonc`                     |
| macOS   | `~/Library/Application Support/langflower/langflower.jsonc` |
| Linux   | `${XDG_CONFIG_HOME:-~/.config}/langflower/langflower.jsonc` |

**Merge:** for each top-level field, a project value wins when set; provider
map merges by id with the project entry replacing the global entry for the
same id. Effective config drives runs and Inspector dropdowns via
`langflower.config.snapshot` (includes redacted `projectConfig` /
`globalConfig` layers plus `globalPath` for the Settings path hint).

**Default chat model:** top-level `"model": "providerId/modelId"`. Settings
edits it as two selects (provider + model). When an LLM/agent node leaves
`providerId` / `model` empty, the run falls back to this effective default.
Inspector empty options show `Default (provider/model)` when it is set.

## Default (LM Studio)

Bootstrap seeds a local OpenAI-compatible endpoint (LM Studio default):

```jsonc
{
	"$schema": "https://opencode.ai/config.json",
	"model": "lmstudio/local-model",
	"provider": {
		"lmstudio": {
			"name": "LM Studio",
			"options": {
				"baseURL": "http://127.0.0.1:1234/v1",
			},
			"models": {
				"local-model": {
					"name": "Local model (set id to match LM Studio)",
				},
			},
		},
	},
}
```

Start LM Studio’s local server, load a model, and set `models` / `model` to the id shown in LM Studio (or use the loaded model name).

No `apiKey` is required for the local server.

## Cloud example (OpenAI)

```jsonc
{
	"model": "openai/gpt-4o-mini",
	"provider": {
		"openai": {
			"name": "OpenAI",
			"options": {
				"baseURL": "https://api.openai.com/v1",
				"apiKey": "{env:OPENAI_API_KEY}",
			},
			"models": {
				"gpt-4o-mini": { "name": "GPT-4o Mini" },
			},
		},
	},
}
```

## Environment placeholders

`{env:VAR_NAME}` in `options.apiKey` (and other option strings resolved at
runtime) is expanded on the **server only** from `process.env[VAR_NAME]`.

- **On disk:** store `{env:OPENAI_API_KEY}` — not the literal secret.
- **Host env:** export the real key in the shell or process manager that starts
  Langflower.
- **Bridge / feed:** WebSocket snapshots (`langflower.config.snapshot`,
  `session.state.snapshot.langflowerConfig`) **omit** `provider.*.options.apiKey`
  entirely (both `{env:…}` placeholders and literal keys). The UI receives
  `name`, `models`, and non-secret options such as `baseURL`.
- **Resolve:** server code calls `resolveProviderCredentials(config, providerId)`
  when a node needs credentials — returns
  `{ ok: true, credentials } | { ok: false, message }` (never throws). Resolved
  values never go back on the bridge.

See [LLM_NODES.md](LLM_NODES.md) for secret hygiene and the phased rollout
disclaimer.

## Static vs live model lists (phase 6)

`provider.<id>.models` in `langflower.jsonc` is the **static fallback** — ids
(and optional display names in object form) authors check in for offline use or
when the provider API is unreachable.

At runtime the server pushes a **live catalog** over WebSocket (no client
refresh intent):

| Direction | Event                                | Payload                                                |
| --------- | ------------------------------------ | ------------------------------------------------------ |
| S→C       | `langflower.models.catalog.snapshot` | `{ catalogs: Record<providerId, { models, error? }> }` |

Emitted after `langflower.config.snapshot` on connect (async, non-blocking) and
after every Settings Save. The server calls OpenAI-compatible `GET /v1/models`
(`client.models.list()`) for each configured provider using the same credential
resolve path as chat streaming. **Secrets never appear** on the bridge or in
`error` strings.

Unsaved Settings edits use a separate session draft
(`langflower.config.draft.snapshot`) that can probe `models.list` with draft
Base URL / API key overrides without writing disk. The live catalog above still
reflects **saved** providers only.

**Merge policy:** the model dropdown shows the **union** of static jsonc ids and
live-fetched ids (dedupe by id). If fetch fails, static ids remain selectable.
Fetched ids are **not** written back to `langflower.jsonc`.

## Active workflow (`currentWorkflowId`)

Langflower remembers the last opened workflow in `langflower.jsonc`:

```jsonc
{
	"currentWorkflowId": "starter",
	"provider": {},
}
```

- **Value:** stem of the workflow file — `starter` → `.langflower/workflows/starter.json`
  (same id as `workflow.load.requested` / catalog entries).
- **Bootstrap:** new projects seed `currentWorkflowId: "starter"` alongside the
  onboarding starter workflow from `packages/server/skeleton/`.
- **On WebSocket connect:** server reads config, loads that workflow into the session
  editor, and includes it in `session.state.snapshot.activeWorkflow`.
- **On `workflow.load.requested`:** server updates `currentWorkflowId` on disk.
- **On delete of the active workflow:** server clears `currentWorkflowId`.

The server also emits `langflower.config.snapshot` after `session.ready` (typed
`LangflowerConfig` slice; UI subscription optional today).

## Embeddings

Embedding **providers** use the same top-level `provider` map as chat (OpenAI-compatible
`baseURL` / `apiKey` or `{env:…}`). The **default embedding identity** is one string
next to chat `model` — same `"providerId/modelId"` shape:

```jsonc
"model": "openai/gpt-4o-mini",
"embedding": "openai/text-embedding-3-small",
```

Settings → **Default embedding model** (provider + model selects) writes this field
for the active scope (Project or Global). Save with an empty embedding choice clears
that layer (same as chat `model`). Hand-edit remains valid.

**Catalog nodes** in palette group **Embeddings**:

| Type                      | Role                                                               |
| ------------------------- | ------------------------------------------------------------------ |
| `common-embed-text`       | Manual check: `text` → `vector` + `dim` + compact `preview`        |
| `common-embed-similarity` | Cosine between two JSON vectors — no HTTP, no provider panel       |
| `common-embed-provider`   | Emits typed `EmbedHandle` on **`embed`** for custom-pack consumers |

Empty panel `providerId` / `model` on embed-text / embed-provider fall back to the
effective `embedding` default (same idea as LLM empty → `defaultChat`). Secrets stay
server-side — packs wire the provider node and call `embedTexts`; they never see
`apiKey` on `ExecutionContext`.

This is **not** a revival of `.langflower/kb/` or `common-kb-*` vector storage
([ADR-033](ADR.md#adr-033--markdown-memory-tools-no-embedding-as-base)). Pack-owned
indexes (sqlite BLOBs, etc.) stay in the pack.

### Step-by-step

1. Ensure the provider exists under `provider` (same as chat).
2. Settings → set **Default embedding model**, or hand-edit `"embedding"`.
3. Optional: override provider/model on **Embed text** or **Embed provider** Inspector panels.
4. **UC1 manual check:** `common-string` → `common-embed-text` → wire **`preview`** to
   `common-preview` (optionally `vector` → `common-embed-similarity`).
5. **UC2 pack path:** one `common-embed-provider`, fan-out **`embed`** to ingest and
   search consumers. Ingest uses `embedTexts(..., { role: 'document' })`; search uses
   `{ role: 'query' }`.

HTTP uses OpenAI-compatible `POST /v1/embeddings`. Runner **Stop** aborts in-flight
embed calls when nodes pass the teardown `AbortSignal`.

### Local LM Studio example

```jsonc
{
	"model": "lmstudio/local-model",
	"embedding": "lmstudio/local-embedding",
	"provider": {
		"lmstudio": {
			"name": "LM Studio",
			"options": {
				"baseURL": "http://127.0.0.1:1234/v1",
			},
			"models": {
				"local-model": { "name": "Chat model" },
				"local-embedding": { "name": "Embedding model" },
			},
		},
	},
}
```

### OpenAI example

```jsonc
{
	"model": "openai/gpt-4o-mini",
	"embedding": "openai/text-embedding-3-small",
	"provider": {
		"openai": {
			"name": "OpenAI",
			"options": {
				"baseURL": "https://api.openai.com/v1",
				"apiKey": "{env:OPENAI_API_KEY}",
			},
			"models": {
				"gpt-4o-mini": { "name": "GPT-4o Mini" },
				"text-embedding-3-small": { "name": "Embedding 3 Small" },
			},
		},
	},
}
```

Chat and embeddings share provider credentials but use different model ids in
`model` vs `embedding`.

### Schema

| Field       | Required | Description                                                 |
| ----------- | -------- | ----------------------------------------------------------- |
| `embedding` | no       | Default `"providerId/modelId"` for Embeddings catalog nodes |

Types: `packages/shared/src/types/langflower-config.ts`.

SDK wire: `EmbedHandle` + `EMBED_HANDLE_WIRE_TYPE` from `@langflower/node-sdk`
(not `ToolHandle`). See [node-library §7.7 Embeddings](features/node-library.md#77-embeddings).

## Harness permissions

Agent and Bash nodes read OpenCode-style rules from `langflower.jsonc`:

```jsonc
{
	"permission": {
		"bash": {
			"*": "deny",
			"git status": "allow",
			"git diff*": "allow",
			"npm test": "ask",
			"rm *": "deny",
		},
		"edit": {
			"*": "deny",
			"**/*.md": "allow",
			"docs/**": "allow",
		},
		"read": {
			"*": "allow",
		},
	},
	"harness": {
		"denyPaths": [".env", ".env.*", "**/.git/config"],
		// Extra filesystem roots outside the project (Obsidian vault, …).
		// Absolute paths preferred; relative entries resolve against project root.
		// "allowedRoots": ["C:/Users/you/Documents/ObsidianVault"],
		// Optional exact hostname allowlist for Fetch URL / Crawl (SSRF).
		// "allowedHosts": ["docs.example.com", "example.org"],
	},
}
```

- **Defaults (first-run / code):** all harness builtins → `allow`. Project
  `permission` is the **floor**; node Inspector `toolPermissions` may only
  tighten (`deny` > `ask` > `allow`). Presets materialize visible
  `toolPermissions` (no hidden role overlay).
- **Glob / Grep:** respect `.gitignore` by default (when harness nodes ship).
- **Outside-root vault I/O:** `harness.allowedRoots` allowlists directories
  outside the Langflower project root (ADR-014 extension, epic 11). Harness
  builtins then accept absolute paths under those roots.
- **Crawl / Fetch URL:** private/loopback/link-local blocked; optional
  `harness.allowedHosts` exact allowlist (see epic 12).

Resolver: `@langflower/tools/permission` (pure); server wires policy into
`createProjectHarness` / run-host `authorize` (not a public
`ExecutionContext.harness` field). On `ask`, the
server emits `runner.permission.ask` and waits for `runner.permission.reply`
inside the tool-loop Promise (feed + composer Allow/Deny).

Full agent presets: [features/node-library.md](features/node-library.md) §8.11.

## MCP (optional)

External tools via the [Model Context Protocol](https://modelcontextprotocol.io/).
**Never** a substitute for harness builtins (`read`…`bash`).

Two sources, **one** runtime protocol (`ToolHandle[]`):

### System (`langflower.jsonc`)

Same entry shape as MCP nodes (`kind` + fields). Inspector **Enabled MCP**
(`enabledMcpIds`) is the only enable gate — no separate allowlist.

```jsonc
{
	"mcp": {
		"servers": {
			"ts-scan": {
				"kind": "stdio",
				"command": "npx ts-scan -mcp",
			},
			"remote": {
				"kind": "http",
				"url": "http://127.0.0.1:3100/mcp",
			},
		},
	},
}
```

### Wire (canvas)

| Node      | type               | Role                                                    |
| --------- | ------------------ | ------------------------------------------------------- |
| MCP stdio | `common-mcp-stdio` | Shell CLI → stdio; emits `tools` (`ToolHandle[]`)       |
| MCP http  | `common-mcp-http`  | URL (+ optional launch); emits `tools` (`ToolHandle[]`) |

Wire into LLM / Sub-Agent `tools` (fan-out OK). No Inspector filter — remove the
wire to disable. Agents never spawn MCP; harness has no MCP API.

Inventory ids: `<mcp_name>__<toolName>` where `mcp_name` is `serverInfo.name`
from initialize (usable under `permission`).

Fixture: `tests/fixtures/mcp/echo-server.mjs`.

See [use-cases/node-local-mcp.md](use-cases/node-local-mcp.md) and
[LLM_NODES.md](LLM_NODES.md) § MCP.

## Mock LLM (testing)

For chain testing without API keys, use the **in-process mock provider**:

```jsonc
{
	"model": "mock/test-model",
	"provider": {
		"mock": {
			"name": "Mock (in-process)",
			"models": {
				"test-model": { "name": "Test model (scripted responses)" },
			},
		},
	},
}
```

Bootstrap seeds this as the default provider. Scripted responses live in
`<project>/.langflower/mock-llm.json` (template: `mock-llm.json.tpl`).

Matching rules (in order): `callIndex`, `hasFeedback`, `promptContains`, `default`.
Supports streaming (`reasoning` + `content`).

See [features/node-library.md §14](features/node-library.md#14-mock-llm-chain-testing).
Integration tests: `tests/integration/ws/execute-simple.ws.test.ts`,
`execute-llm-hitl.ws.test.ts`, `execute-structured-output.ws.test.ts`.

## Runtime config

Server port and `projectDir` remain in `.langflower/config.json` (unchanged).

## WS access

UI reads provider/model metadata from `langflower.config.snapshot` (and the
same slice on `session.state.snapshot`). Settings Save sends
`langflower.config.save.requested`; the server persists the active scope and
re-broadcasts `langflower.config.snapshot` (no full page reload).
