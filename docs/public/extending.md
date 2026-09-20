# Extending Langflower

Langflower uses common agent primitives — **MCP** and **skills** — and
lets you define **custom nodes** on top: processing in the graph, or
custom tools for agents via the same **ToolHandle** contract as built-ins.

## MCP and skills

Optional `mcp` entries in `.langflower/langflower.jsonc` declare stdio/http
servers; palette MCP nodes emit **ToolHandle**s. Agents do not spawn MCP
themselves. Permission floors for harness tools live in project config.
Skills are markdown playbooks under `.langflower/skills/` (next section).

See [Configuration](configuration.md).

## Skills

Skills are markdown playbooks the agent can load. Add a folder:

```text
.langflower/skills/my-skill/
  SKILL.md
```

First-run bootstrap already seeds helper skills (for example
`langflower-helper`). Keep skill text concrete: what the agent can and cannot
do in your project.

## Custom nodes

Custom nodes share the same authoring SDK as the built-in catalog. Use them
for graph processing, or to expose custom tools to agents as **ToolHandle**s
on `tools` ports.

Default path for a simple node:

```ts
import { defineNode } from '@langflower/node-sdk';

export const myNode = defineNode({
	type: 'my-pack/example',
	displayName: 'Example',
	category: 'Custom',
	uiSchema: [] as const,
	inputs: {
		text: { wireType: 'string', required: true },
	},
	outputs: {
		text: { wireType: 'string' },
	},
	run: async ({ inputs }) => ({
		text: inputs.text,
	}),
});
```

Pack layout lives under `.langflower/nodes/<pack>/` (see the seeded
`my-nodes` pack). Run `npm install` inside a pack when you add dependencies —
Langflower does not auto-install pack deps.

Use `defineReactiveNode` only when you need streaming / RxJS ports. Prefer
`defineNode` for sync or Promise work.

## After you change a pack

No restart needed: open the **node library** sidebar, expand the **Custom**
section, and press **Update**. Langflower recompiles the packs under
`.langflower/nodes/` and hot-swaps the catalog — new or changed node types
appear in the library for that project. Compilation errors are listed under the
same section.

Restart Langflower only when you added pack **dependencies** (run `npm install`
inside the pack first).

## After you upgrade Langflower

Your packs are compiled against the SDK that ships **inside the installed
Langflower**, not against the `@langflower/node-sdk` version written in the pack
`package.json` (that entry is an editor hint). An upgrade therefore recompiles
every pack on next use:

- Compatible SDK change — nothing to do.
- A pack using API that the new SDK removed or renamed fails to compile: the
  errors are listed in the **Custom** palette section and in that pack's
  `COMPILATION_ERRORS.md`. Only that pack is skipped; other packs keep working.
  Fix the source and press **Update**.

## Deeper guides (monorepo)

Full SDK and packaging details live in the Langflower repository (not in this
npm package), under `docs/HOW_TO_WRITE_REACTIVE_NODES.md` and
`docs/NODES.md`.
