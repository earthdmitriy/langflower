# @langflower/node-sdk

The SDK for writing your own [Langflower](../../README.md) nodes.

A Langflower workflow is a graph. Each box on the canvas is a **node**: it has
input ports, output ports, and optional settings shown in the inspector. This
package gives you the functions to define one, as plain TypeScript.

```ts
import { defineNode } from '@langflower/node-sdk';
```

## Pick your starting point

| You want to…                                                       | Use                       | Needs RxJS? |
| ------------------------------------------------------------------ | ------------------------- | ----------- |
| Compute outputs from inputs (sync or `async`)                      | `defineNode`              | No          |
| Stream values, merge several inputs, or control loading and errors | `defineReactiveNode`      | Yes         |
| Build an LLM node that accepts tools                               | `defineLlmNode` (`/llm`)  | Yes         |
| Hand a pack of tools to an LLM node                                | `defineToolRegistrations` | No          |

Start with `defineNode`. Move to `defineReactiveNode` only when you need a
stream.

## Your first node

This node emits `ok = true` when the wired `code` input is `0`:

```ts
import { defineNode } from '@langflower/node-sdk';

export const gateNode = defineNode({
	type: 'my-gate',
	displayName: 'Gate',
	category: 'My nodes',
	description: 'Emits ok=true when input code is 0.',
	uiSchema: [] as const,
	inputs: {
		code: { wireType: 'number', required: true },
	},
	outputs: {
		ok: { wireType: 'boolean' },
	},
	execute(_ctx, inputs) {
		return { ok: Number(inputs.code ?? NaN) === 0 };
	},
});
```

- `type` is the unique id stored in saved workflows. Don't rename it later.
- `wireType` decides which ports can be connected to each other.
- `execute` may return a value or a Promise. While it runs, the node shows as
  loading.

### Add settings with `uiSchema`

Each `uiSchema` entry becomes a field in the inspector. Read it from
`ctx.params`:

```ts
uiSchema: [{ field: 'prefix', type: 'string', default: 'hi' }] as const,
execute(ctx, inputs) {
	return { text: `${String(ctx.params.prefix)}:${String(inputs.text ?? '')}` };
},
```

To group fields into collapsible inspector sections, give an item
`group: { label, collapsed?, order? }`. Share one const per group. Ungrouped
fields sit first in an always-open "General" section.

### Read secrets

`ctx.resolveSecret('lf_secret:ID')` or `ctx.resolveSecret('env:ID')` looks up
one named secret. There is no way to list secrets, and no file or network
access on the context. Nodes that need those use `@langflower/tools`.

## When you need a stream: `defineReactiveNode`

Here you write a `bind` function that wires input ports to output streams:

```ts
import { defineReactiveNode } from '@langflower/node-sdk';
import { map } from 'rxjs';

export const shoutNode = defineReactiveNode({
	type: 'my-shout',
	displayName: 'Shout',
	uiSchema: [] as const,
	bind(_ctx, { makeInput, configureOutput }) {
		const text = makeInput<string>('text', {
			name: 'text',
			wireType: 'string',
			required: true,
		});

		return {
			inputs: [text],
			outputs: [
				configureOutput(
					'shout',
					text.pipeValue(map((s) => s.toUpperCase())),
					{
						wireType: 'string',
					},
				),
			],
		};
	},
});
```

Things worth knowing before you write one:

- Ports carry `StatefulObservable`s from `@rx-evo/stateful-observable`, not raw
  RxJS `Observable`s. Each has a status (inactive, loading, value, **error**),
  and the UI shows it. To refuse visibly, make the stream error. Don't emit
  fake empty values.
- `bind` runs **twice**: once at define time to read the port list for the
  palette (that result is thrown away), then again for every node on the
  canvas. Keep it free of module-level I/O and shared mutable state.
- Panel settings (`ctx.params`) are empty until a run starts.
- Combine inputs with `combineInputs([...], map).pipe(withLoading())`. Don't use
  raw `combineLatest`.

The full walkthrough, with a rules table, is in
[docs/guides/how-to-write-reactive-nodes.md](../../docs/guides/how-to-write-reactive-nodes.md).

### Chat and human-in-the-loop nodes

An input can ask the person for something through the composer. Add `hitl` to
`makeInput` and set `chatEntry: true` on the node, as the built-in Chat Input
does:

```ts
makeInput<string>('message', {
	name: 'message',
	wireType: 'string',
	hitl: { title: 'Message', kind: 'textarea', submitLabel: 'Start' },
});
```

## Test your node

`createNodeHarness` drives a node without starting a workflow:

```ts
import { createNodeHarness } from '@langflower/node-sdk/testing';

const harness = createNodeHarness(gateNode);
const ok = harness.next<boolean>('ok');
harness.send('code', 0);
await expect(ok).resolves.toBe(true);
harness.dispose();
```

- `send(port, value)` feeds an input.
- `next(port)` resolves with the next value on an output.
- `collect(port)` records every value of a streaming output.
- Pass `{ params: { … } }` to override settings. Otherwise `uiSchema` defaults
  apply.

Working examples live next to the code:
[`define-node/test/samples/`](src/node-factory/define-node/test/samples/) and
[`define-reactive-node/test/samples/`](src/node-factory/define-reactive-node/test/samples/).

## Imports

| Import                                        | What you get                                                                                  |
| --------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `@langflower/node-sdk`                        | `defineNode`, `defineReactiveNode`, `defineToolRegistrations`, `makeInput`, `configureOutput` |
| `@langflower/node-sdk/llm`                    | `defineLlmNode`                                                                               |
| `@langflower/node-sdk/testing`                | `createNodeHarness`                                                                           |
| `@langflower/node-sdk/create-typed-ui-schema` | Typed `uiSchema` helper                                                                       |

Import only from these paths. Deep imports into `dist/` are unsupported.

## Packaging your nodes

Nodes ship as a **pack**: an npm package of node definitions. A project's
`.langflower/nodes/my-nodes` is a ready-made starting point, and the layout is
described in
[ADR-030](../../docs/adr/030-custom-node-pack-layout-and-npm-model.md).

- Packs that only use `defineNode` need `@langflower/node-sdk` as a peer
  dependency.
- Reactive packs also need `rxjs` and `@rx-evo/stateful-observable`.
- Importing local files with a `.ts` suffix needs `allowImportingTsExtensions`
  and `noEmit` in the pack's `tsconfig.json`.

## What this package deliberately does not do

The SDK is a contract for **identity, ports and settings**. It does not give
nodes file access, network access, crawling, or chat streaming. Those live in
`@langflower/tools` and in the built-in nodes. If you think you need one in a
custom node, ask first instead of widening these types. The rules are in
[AGENTS.md](AGENTS.md).

## More

- Reactive node reference:
  [docs/reference/REACTIVE_NODES.md](../../docs/reference/REACTIVE_NODES.md)
- LLM nodes and port events:
  [docs/reference/LLM_NODES.md](../../docs/reference/LLM_NODES.md)
- Contributing to this package: [AGENTS.md](AGENTS.md)

The registry version is independent of the `langflower` CLI. The product still
vendors this package for host identity; see
[docs/guides/RELEASE.md](../../docs/guides/RELEASE.md).
