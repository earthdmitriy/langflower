# Extending Langflower

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

Built-in catalog nodes and your packs share the same authoring SDK. Default
path for a simple node:

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

Restart Langflower (or follow the product’s pack reload path when available)
so the runtime picks up new node types. New nodes should appear in the node
library for that project.

## Deeper guides (monorepo)

Full SDK and packaging details live in the Langflower repository (not in this
npm package), under `docs/HOW_TO_WRITE_REACTIVE_NODES.md` and
`docs/NODES.md`.
