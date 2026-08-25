# Configuration

## Where settings live

| Scope     | Typical path                                                    |
| --------- | --------------------------------------------------------------- |
| Project   | `<project>/.langflower/langflower.jsonc`                        |
| Global    | OS app-data `langflower.jsonc` (Settings → Global)              |
| Port / UI | `.langflower/config.json` (CLI `--port` overrides for that run) |

Project settings override global for the same keys. Prefer the **Settings**
gear in the UI for providers and models; hand-editing JSONC remains valid.

Schemas are copied into `.langflower/schemas/` on bootstrap so editors that
honour `$schema` get autocomplete.

## Providers and models

Add an OpenAI-compatible provider (OpenAI, LM Studio, or similar `baseURL`).
Cursor does not expose an official OpenAI-compatible chat API for this path.

API keys should stay in the environment. Reference them from config:

```jsonc
{
	"provider": {
		"openai": {
			"options": {
				"apiKey": "{env:OPENAI_API_KEY}",
			},
		},
	},
}
```

## Permissions

Project `permission` entries set a **floor** for harness tools (read, write,
bash, and so on). Agents and the Inspector can only tighten from there
(ask / deny), not widen a project-level deny.

Use this to keep explore-only runs from writing until you open that stage in
the workflow.

## Custom nodes and skills

MCP and skills are the common agent primitives. Custom nodes add graph
processing or custom tools via **ToolHandle**.

- Skills: markdown under `.langflower/skills/<name>/`
- Custom nodes: packs under `.langflower/nodes/<pack>/`
- MCP: palette nodes plus optional project `mcp` in `langflower.jsonc`

See [Extending Langflower](extending.md).

## Logs

Optional `serverLogs` in project or global config controls bridge diagnostics
under `.langflower/logs/`. Use Settings radios (Off / On / Default) unless you
prefer editing JSONC by hand.
