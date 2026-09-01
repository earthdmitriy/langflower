# Node authoring conventions

Rules for writing Langflower node files. Every built-in node must follow these
conventions.

---

## 1. One folder = one node

Each node lives in its own folder. The entry point is `node.ts`.

```
packages/common-nodes/src/
├── text/
│   ├── join/
│   │   ├── node.ts           # entry point — exports the node const
│   │   ├── README.md         # optional — complex nodes only
│   │   ├── utils.ts          # optional — internal helpers
│   │   └── node.test.ts      # tests live in the same folder
│   ├── split/
│   │   └── node.ts
│   └── ...
├── logic/
│   ├── router/
│   │   └── node.ts
│   ├── if/
│   │   └── node.ts
│   └── ...
```

**Entry point:** `node.ts` — the file that exports the node const.

**Internal files:** if a node has complex logic, extract helpers into separate
files within the same folder (`utils.ts`, `helpers.ts`, etc.). Keep them
private — no re-exports from `node.ts`.

**Tests:** companion test files live in the same folder as `node.test.ts`.

**README.md:** optional — only for nodes with non-obvious behavior, multiple
parts, or architectural decisions worth documenting.

**Exports:** exactly one named export from `node.ts` — the node const. No
re-exports, no barrel files for individual nodes.

**AI exception:** built-in LLM catalog nodes live under
`packages/common-nodes/src/ai/nodes/<node>/` (not `ai/<node>/`). Shared loop,
session, path-choice, and OpenAI adapters live under `ai/features/` as named
slices. Other categories stay `category/<node>/`.

### SDK factories (`@langflower/node-sdk`)

The same **one folder = one unit** rule applies to **node factory functions**
under `packages/node-sdk/src/node-factory/`:

- `define-node/` — `defineNode` (sync/Promise `execute`, no RxJS in author file)
- `define-reactive-node/` — `defineReactiveNode` + co-located IO helpers / ctx types
- `define-tool-registrations/` — `defineToolRegistrations` + `ToolHandle` types
- `define-llm-node/` — `defineLlmNode` (import `@langflower/node-sdk/llm`)

Add a new factory as a **sibling folder**, not a loose file inside another
factory. Details: [packages/node-sdk/AGENTS.md](../packages/node-sdk/AGENTS.md).
Prefer **`defineNode`** for simple custom nodes; use `defineReactiveNode` when
you need RxJS streams. Project packs live under
`.langflower/nodes/<pack>/` (default seed `my-nodes`) — see
[ADR-030](ADR.md#adr-030--custom-node-pack-layout--npm-model) and
[`packages/server/skeleton/nodes/my-nodes/README.md`](../packages/server/skeleton/nodes/my-nodes/README.md).
Pack compile is `tsc --noEmit` from that pack’s `tsconfig.json`. If files
`import` each other with a `.ts` suffix, set `allowImportingTsExtensions`
(with `noEmit`); otherwise the pack does not compile. Built-in folder layout
below is for `@langflower/common-nodes` only.
---

## 1.1. Context-specific node groups

When multiple nodes share context, constants, or utils, group them into a
context folder. Shared utils live at the context root; nodes import them with
`../`.

```
packages/common-nodes/src/
├── harness/
│   ├── require-harness.ts     # shared context (used by all harness nodes)
│   ├── harness-tool-output.ts # shared utils
│   ├── with-tool-registration.ts
│   ├── bash/
│   │   └── node.ts            # import ... from '../require-harness.js'
│   ├── read-file/
│   │   └── node.ts
│   ├── write-file/
│   │   └── node.ts
│   └── ...
├── crawl/
│   ├── require-crawl.ts       # shared context
│   ├── crawl/
│   │   └── node.ts            # import ... from '../require-crawl.js'
│   ├── fetch-url/
│   │   └── node.ts
│   └── ...
└── ai/
    ├── NODE.md                # category note
    ├── nodes/
    │   ├── openai-llm/
    │   │   └── node.ts        # catalog entry — thin bind()
    │   ├── fake-llm/
    │   │   └── node.ts
    │   └── ...
    └── features/
        ├── llm-loop/          # shared generation + recovery
        ├── llm-session/
        └── openai/            # unbound HTTP factory
```

### When to create a context group

| Condition                                            | Action                           |
| ---------------------------------------------------- | -------------------------------- |
| Nodes share runtime checks (e.g. `requireHarness()`) | Extract to context root          |
| Nodes share constants or type definitions            | Extract to context root          |
| Nodes share 2+ utility functions                     | Extract to context root          |
| Only 1 node uses a helper                            | Keep in node folder (`utils.ts`) |

### Rules

- **Context utils are public** within the group — nodes import with `../`
- **No barrel files** at context root — import specific files
- **Context utils are NOT exported** from package entry modules
- **Node folders still own their tests** — context root has no test files

---

## 2. Self-sufficient — no internal config imports

Node files must be **self-contained**. All configuration lives directly in the
file. No importing preset maps, shared constants, or internal lookup tables.

### Allowed imports

From `@langflower/node-sdk` (published `exports` only):

| Import                    | Use for                                |
| ------------------------- | -------------------------------------- |
| `defineNode`              | Sync/Promise nodes (default custom)    |
| `defineReactiveNode`      | Reactive node definition               |
| `defineToolRegistrations` | Domain ToolHandle packs                |
| `makeInput`               | Input helper outside `bind`            |
| `configureOutput`         | Output helper outside `bind`           |
| `createTypedUISchema`     | Panel schema helper (optional subpath) |

LLM: `@langflower/node-sdk/llm` — not on `.`. MCP inventory is `ToolHandle[]`
(`@langflower/tools/build-mcp-handle`); the author SDK has no MCP type.

`combineInputs` is supplied only to the `bind` callback. Use the destructured
helper shown below; do not invent a deep import for its implementation.

### Everything else is inline

```ts
// ❌ BAD — imports a one-node preset table
import { DEFAULT_PREFIXES } from '../text-presets.js';

// ✅ GOOD — node-owned configuration is visible in the definition
export const prefixNode = defineReactiveNode({
	type: 'common-prefix',
	displayName: 'Prefix',
	category: 'Text',
	uiSchema: [{ field: 'prefix', type: 'string', default: '> ' }] as const,
	bind(ctx, { makeInput, configureOutput, combineInputs }) {
		const text = makeInput<string>('text', {
			wireType: 'string',
			required: true,
		});
		const output = combineInputs(
			[text, ctx],
			([value, ec]) => `${String(ec.params.prefix ?? '')}${value}`,
		);
		return {
			inputs: [text],
			outputs: [configureOutput('text', output, { wireType: 'string' })],
		};
	},
});
```

### Why

- Each node file is **readable in isolation** — no mental context-switching to
  find what a constant resolves to.
- Users can **copy a node file** into their workspace and customize it without
  chasing transitive imports.
- Renaming or removing an internal module never breaks unrelated node files.

---

## 3. JSDoc — extensive and purpose-driven

Every node must have a top-level JSDoc block describing **what it does** and
**when to use it**. Input/output params get inline JSDoc or descriptive meta.

### 3.1 User-facing `description` (palette + inspector)

`description` on the definition is **operator** copy, not JSDoc. It is
markdown in the palette hover popover and the inspector header. Use a
template literal and write use cases. Do **not** mention `wireType`, `ctx`,
internals, or roadmap.

```ts
description: `
Put a short constant string on the canvas and wire it onward.

Typical uses:
- A file path for Read File
- A short label or prompt fragment
`.trim(),
```

JSDoc on the exported const stays for authors.

### Template

```ts
// packages/common-nodes/src/text/join/node.ts
import { defineReactiveNode } from '@langflower/node-sdk';
import { map } from 'rxjs';

/**
 * Joins an array of strings into a single string using a separator.
 *
 * **Use when:** you need to combine multiple text values into one
 * (e.g. assembling a prompt from parts, joining lines from a file).
 *
 * **Example:** `['a', 'b', 'c']` with separator `', '` → `'a, b, c'`
 *
 * @input lines - Array of strings to join
 * @input separator - Delimiter between segments (default: `'\n'`)
 * @output result - The joined string
 */
export const joinNode = defineReactiveNode({
	type: 'common-join',
	displayName: 'Join',
	category: 'Text',
	uiSchema: [] as const,
	bind(_ctx, { makeInput, configureOutput, combineInputs }) {
		const lines = makeInput<readonly string[]>('lines', {
			wireType: 'string',
			multi: 'combine',
			required: true,
			description: 'Strings to join',
		});
		const separator = makeInput<string>('separator', {
			wireType: 'string',
			defaultValue: '\n',
			description: 'Delimiter (default newline)',
		});
		const result = combineInputs(
			[lines, separator],
			([values, delimiter]) => ({ values, delimiter }),
		).pipeValue(map(({ values, delimiter }) => values.join(delimiter)));
		return {
			inputs: [lines, separator],
			outputs: [
				configureOutput('result', result, {
					wireType: 'string',
					description: 'Joined output',
				}),
			],
		};
	},
});
```

### JSDoc sections

| Section     | Required      | Content                                |
| ----------- | ------------- | -------------------------------------- |
| Purpose     | Yes           | One sentence: what the node does       |
| When to use | Yes           | Concrete scenarios — "Use when: …"     |
| Example     | Recommended   | Input → output transformation          |
| Caveats     | When relevant | Edge cases, gotchas, performance notes |

---

## 4. Parameter documentation

Document params in two places:

1. **JSDoc** — human-readable purpose and examples
2. **Port meta** — `description` field for UI tooltip / palette hint

```ts
const pattern = makeInput<string>('pattern', {
	wireType: 'string',
	required: true,
	description: 'Regex pattern to search for in files',
});
const path = makeInput<string>('path', {
	wireType: 'string',
	defaultValue: '.',
	description: 'Root directory (defaults to project root)',
});
```

### uiSchema

Panel controls get `label` and optionally `description`:

```ts
uiSchema: [
  {
    field: 'maxRetries',
    type: 'number',
    label: 'Max retries',
    description: 'How many times to retry on failure',
    default: 3,
    placement: 'panel',
  },
],
```

---

## 5. Category and type

Every node declares a `category` for palette grouping and a unique `type` string.

```ts
defineReactiveNode({
	type: 'common-join', // must be unique across all nodes
	displayName: 'Join', // human-readable name in palette
	category: 'Text', // palette group
	// ...
});
```

| Category     | Use for                        |
| ------------ | ------------------------------ |
| `Common`     | General-purpose utility nodes  |
| `Text`       | String manipulation            |
| `Logic`      | Branching, routing, comparison |
| `Primitives` | Type conversions, constants    |
| `AI`         | Agent, Review, LLM-related     |
| `Harness`    | File system, bash, web tools   |
| `Output`     | Preview, Tool inspect, logging |
| `KB`         | Knowledge base operations      |
| `Crawl`      | Web crawling and scraping      |

---

## 6. Reactive `bind`

Declare inputs and outputs in `bind`. The definition-time probe collects port
metadata; `getInstance()` calls `bind` again to build each live graph. Keep
`bind` pure with respect to module-level state and host I/O.

**Full how-to:** [HOW_TO_WRITE_REACTIVE_NODES.md](HOW_TO_WRITE_REACTIVE_NODES.md)
(`makeInput` / `combineInputs` / `defaultValue` / `ctx` / feed / tests).

- **Registry** — stores the returned `ReactiveNodeDefinition` directly.
- **Runtime** — calls `getInstance()` once per canvas node.
- **Samples** — `define-node/test/samples/` (`defineNode`),
  `define-reactive-node/test/samples/`, and
  `packages/common-nodes/src/**/node.ts`.
- **SDK rules** — [packages/node-sdk/AGENTS.md](../packages/node-sdk/AGENTS.md).

Reactive composition rules (`StatefulObservable`, demand, pure folds, and
subscription boundaries) live in [REACTIVITY.md](REACTIVITY.md); do not
duplicate them in node docs.

---

## 7. Testing

Companion test files live in the same folder as the node:

```
text/join/
├── node.ts          # implementation
└── node.test.ts     # tests
```

Tests import from the same folder using relative paths:

```ts
import { joinNode } from './node.js';
```

See [TESTING.md](TESTING.md) for test runner setup and conventions.

---

## Checklist

Before submitting a new node:

- [ ] Own folder with `node.ts` entry point
- [ ] Imports `defineNode` or `defineReactiveNode` from
      `@langflower/node-sdk` (published path only; LLM → `/llm`)
- [ ] No references to internal presets, constants, or lookup maps
- [ ] JSDoc with purpose, use-when, and example
- [ ] Port descriptions in both JSDoc and meta
- [ ] User-facing `description` markdown (use cases; palette + inspector)
- [ ] Unique `type` string
- [ ] Correct `category`
- [ ] Companion `node.test.ts` for non-trivial logic
- [ ] Internal utils extracted to separate files if complex enough
