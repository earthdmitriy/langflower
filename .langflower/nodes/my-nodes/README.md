# my-nodes — project custom node pack

This folder is your **default** custom-node pack under
`.langflower/nodes/my-nodes/`. It is a normal npm package: copy it, share it,
or publish it. Sibling packs live as other folders next to this one, each with
its own `package.json`.

## Desired layout

```text
.langflower/nodes/
  my-nodes/                 ← this pack (default seed)
    package.json            ← peerDeps: @langflower/node-sdk (+ rxjs when reactive)
    tsconfig.json           ← IDE / tsc --noEmit
    README.md               ← this file
    git-diff.ts             ← export default defineNode({…})
    git-diff-tool.ts        ← export default defineToolRegistrations({…})
    review-gate.ts          ← export default defineReactiveNode({…})
    # add more *.ts files as needed
  other-pack/               ← optional second shareable pack
    package.json
    …
```

Rules:

- **One pack = one folder** with its own `package.json`.
- **No required `index.ts`.** Each `*.ts` / `*.tsx` may `export default` a node
  definition or an array of definitions. Langflower discovers those defaults.
- Skip `*.test.ts`, `*.d.ts`, `dist/`, and `node_modules/` when scanning.
- Import from **`@langflower/node-sdk`** directly — not from a root
  `nodes/types.ts`.

## Install

**Peer-only packs** (this seed: only `peerDependencies` on
`@langflower/node-sdk`, `rxjs`, `@rx-evo/stateful-observable`) do **not** need
`npm install` in the pack or in the project folder. Langflower supplies those
host peers from its own install (including `npm i -g langflower`).

You install dependencies yourself when you add **author** libraries. Langflower
does **not** run `npm install` on start, bootstrap, or palette reload.

Extra libraries go in this pack’s `dependencies`:

```bash
npm i lodash
```

Langflower bundles author dependencies into the pack artifact; the host SDK
and RxJS stay external.

## Author API

Prefer **`defineNode`** for sync/Promise nodes (no RxJS in the author file).

Use **`defineToolRegistrations`** when the node should emit LLM-callable
`ToolHandle`s on a `tools` port (wire into an agent / LLM `tools` input).

Use **`defineReactiveNode`** when you need exclusive multi-output branches
(emit on one port, silence the other), streams, or advanced bind wiring.

| Seed file          | API                       | Role                                      |
| ------------------ | ------------------------- | ----------------------------------------- |
| `git-diff.ts`      | `defineNode`              | One output (`diff`) — default author path |
| `git-diff-tool.ts` | `defineToolRegistrations` | `tools` pack with on-demand `git_diff`    |
| `review-gate.ts`   | `defineReactiveNode`      | Independent `ok` / `fail` branches        |

### `defineNode` (simple)

```ts
import { defineNode } from '@langflower/node-sdk';

/** See seed `git-diff.ts` for the full file. */
export default defineNode({
	type: 'my-git-diff',
	displayName: 'Git Diff',
	uiSchema: [] as const,
	inputs: {
		trigger: { wireType: 'any', required: true, dynamic: true },
	},
	outputs: {
		diff: { wireType: 'string' },
	},
	async execute(ctx) {
		/* run `git diff` in ctx.projectDir → { diff: string } */
		return { diff: '' };
	},
});
```

### `defineToolRegistrations` (LLM tools)

```ts
import { defineToolRegistrations } from '@langflower/node-sdk';

/** See seed `git-diff-tool.ts` for the full file. */
export default defineToolRegistrations({
	type: 'my-git-diff-tool',
	displayName: 'Git Diff Tool',
	tools: [
		{
			toolId: 'git_diff',
			description: 'Runs `git diff` in the project directory.',
			inputSchema: {
				type: 'object',
				properties: {
					path: { type: 'string' },
				},
				additionalProperties: false,
			},
			handler: async (args, ctx) => {
				/* run `git diff` in ctx.projectDir → patch string */
				return '';
			},
		},
	],
});
```

Wire the node’s **`tools`** output into an LLM / agent **`tools`** input. The
model calls `git_diff` on demand (optional `path` scopes the diff). Prefer this
over `defineNode` when the value should be inventory for the tool loop, not a
graph wire.

### Common mistake: `defineNode` for `ok` / `fail` gates

**Wrong:** a review / QA gate with `defineNode` that returns `{ ok: true }` or
`throw`s on failure.

`defineNode` maps one `execute` result onto **all** declared outputs together.
It cannot emit on `ok` and stay silent on `fail` (or the reverse). Throwing
fails the node as an error stream — it does **not** drive a separate `fail`
branch for downstream wiring.

**Right:** `defineReactiveNode` + `combineInputs(...).pipeValue(...)`, then
split with `of` / `EMPTY` (see seed `review-gate.ts`):

```ts
import { defineReactiveNode } from '@langflower/node-sdk';
import { EMPTY, mergeMap, of } from 'rxjs';

export default defineReactiveNode({
	type: 'my-review-gate',
	displayName: 'Review Gate',
	uiSchema: [] as const,
	bind(ctx, { makeInput, configureOutput, combineInputs }) {
		const trigger = makeInput<unknown>('trigger', {
			dynamic: true,
			required: true,
			defaultValue: null,
		});
		const result$ = combineInputs([trigger, ctx], ([_t, ec]) => ({
			projectDir: String(ec.projectDir ?? ''),
		})).pipeValue(
			mergeMap(async ({ projectDir }) => {
				/* … → { ok: true } | { ok: false, detail: string } */
				return { ok: true as const };
			}),
		);
		const ok$ = result$.pipeValue(
			mergeMap((r) => (r.ok ? of(true) : EMPTY)),
		);
		const fail$ = result$.pipeValue(
			mergeMap((r) => (r.ok ? EMPTY : of(r.detail))),
		);
		return {
			inputs: [trigger],
			outputs: [
				configureOutput('ok', ok$, { wireType: 'boolean' }),
				configureOutput('fail', fail$, { wireType: 'string' }),
			],
		};
	},
});
```

If the product needs independent `ok` and `fail` wires, **always** choose
`defineReactiveNode`. Do not “simplify” to `defineNode`.

## Why TypeScript

TypeScript is your friend: it catches many mistakes in the **IDE** and at
**compile / check time**, not after a workflow run.

- Open a `*.ts` file with this pack’s `tsconfig.json` wired into the editor —
  red squiggles and quick-fixes show up **while you edit**.
- Wrong port shapes, missing `export default`, bad `execute` / `bind` return
  types, and SDK misuse surface before palette reload or a live run.
- Prefer fixing those errors in the editor over “happy path” runtime debugging
  (start workflow → wait → guess which node broke).

`tsconfig.json` here is for IDE highlight and `tsc --noEmit`. Keep using it
even though Langflower bundles with esbuild for load.

## Add a node

1. Create a `*.ts` file in this pack (or in a sibling pack).
2. `export default defineNode({ … })`, `defineToolRegistrations({ … })` for an
   LLM `tools` pack, **or** `defineReactiveNode({ … })` when exclusive `ok` /
   `fail` (or other silent-branch) ports are required.
3. Run `npm install` in the pack if author deps changed.
4. Call **`compile_custom_nodes`** (starter Helper / Writer) or Custom →
   **Update**. The type appears under **Custom**. Already-placed instances
   hot-swap (no Stop). Place **new** types on the canvas yourself.

## Second shareable pack

1. Create `.langflower/nodes/<other-pack>/`.
2. Add its own `package.json` (peer `@langflower/node-sdk`).
3. Add `*.ts` files with `export default`.
4. Run `npm install` inside that pack.
5. Reload the palette.
