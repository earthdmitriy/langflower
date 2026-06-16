# Epic 29 — Restore `defineNode` + slim `@langflower/node-sdk`

**Status:** landed (2026-07-23)  
**Depends on:** nothing (first in custom-nodes queue)  
**Index:** [README.md](README.md)  
**Next:** [30-rename-node-sdk.md](../../TODO/EPICS/30-rename-node-sdk.md)

## Landed notes

- Graph I/O nodes (Read File / KB / Crawl / Memory) use `@langflower/tools`
  `create*` inside the node — **no** public Caps types on author EC (matches
  AC #5; the “Caps for graph I/O” phrase under In scope was superseded).
- Follow-ups after AC (still valid for epic 30+): ADR-027 (SDK-owned port
  types, runtime as devDependency); slim SDK `ToolHandlerContext` =
  `{ projectDir, runId }` with host hooks on tools bag.

## Goal

1. Restore **`defineNode`** — simple `execute` authoring (sync/Promise) so
   humans and agents can write custom nodes **without RxJS**.
2. Slim the public `@langflower/node-sdk` `.` export to author core
   only: `defineNode`, `defineReactiveNode`, `defineToolRegistrations`, plus
   minimal types/helpers.
3. Narrow **`ExecutionContext`**: base = identity + panel only; second generic
   **`Caps`**. `defineLlmNode` uses **`LlmExecutionCaps`** =
   **`toolHandles` + `mcpHandles` only**. Former host fields
   (`files`/`kb`/`crawl`/`memory`/`harness`/`skillMarkdown`/streams/embedding)
   are a **misimplementation** on the author API — specialized common-nodes own
   that I/O internally (`@langflower/tools` + optional private run-host bag).

`defineNode` is an **adapter over `defineReactiveNode`** (one reactive runtime
path). Do **not** reintroduce a batch execution engine.

## Product why

Few authors know RxJS. Reactive nodes stay available for advanced cases;
`defineNode` is the default custom-node path (seed demos, README, agents).

Custom authors must **not** see LLM/host capability bags on ctx. LLM nodes
reach the outside world via **`ToolHandle`** (and MCP handles), not
`ec.files` / `ec.kb` / … Built-in graph nodes (Read File, KB, Crawl, Memory)
keep host I/O through **separate Caps**, not the default base type and not
the LLM bag.

## Target public API (`.`)

```ts
import {
	defineNode,
	defineReactiveNode,
	defineToolRegistrations,
	makeInput,
	configureOutput,
	type ExecutionContext,
	// + ReactiveNodeDefinition, …
} from '@langflower/node-sdk';
```

**Move off `.` (locked):**

| Symbol / area                                                                     | New import                 |
| --------------------------------------------------------------------------------- | -------------------------- |
| `defineLlmNode`, LLM inventory port ids, subagent wire consts, `LlmExecutionCaps` | `@langflower/node-sdk/llm` |
| `McpHandle`, `MCP_HANDLE_WIRE_TYPE`                                               | `@langflower/node-sdk/mcp` |

Update all current importers in `common-nodes`, `tools` tests, etc.

---

## `ExecutionContext<UI, Caps>` (locked)

```ts
/** Identity + panel only — default for defineReactiveNode / defineNode. */
export type ExecutionContext<
	UI extends readonly UISchemaConstItem[] = readonly UISchemaConstItem[],
	Caps extends object = Record<string, never>,
> = {
	readonly projectDir: string;
	readonly runId: string;
	readonly nodeId: string;
	readonly params: ParamsFromUISchema<UI>;
	readonly uiSchema: TypedUISchema<UI>;
	readonly amendInput?: (patch: Readonly<Record<string, unknown>>) => void;
} & Caps;

/** defineLlmNode — outside world via ToolHandle / MCP only. */
export type LlmExecutionCaps = {
	readonly toolHandles?: readonly ToolHandle[];
	readonly mcpHandles?: readonly McpHandle[];
};
```

| Factory                             | Ctx type in `bind` / `execute`           |
| ----------------------------------- | ---------------------------------------- |
| `defineReactiveNode` / `defineNode` | `ExecutionContext<UI>` (Caps = `{}`)     |
| `defineLlmNode`                     | `ExecutionContext<UI, LlmExecutionCaps>` |

### Removed from author ExecutionContext (misimplementation)

Do **not** put these on public EC / Caps for authors:

- `files`, `kb`, `crawl`, `memory`
- `createEmbedding`, `createChatCompletionStream`, `skillMarkdown`
- `harness` (including authorize-only)

Specialized common-nodes call `createProjectFilesContext` / `createKbContext` /
… from `@langflower/tools`. Server may attach private **`RunHostServices`**
(Symbol bag) for stream / skill / authorize / embedding — not part of the SDK
type surface.

### Factory / server wiring

- `DefinedReactiveNodeConfig.bind` — default `ExecutionContext<UI>`.
- `defineLlmNode` — thread `LlmExecutionCaps` into bind ctx.
- [`build-execution-context.ts`](../../../packages/server/src/bridge/build-execution-context.ts)
  seeds base + `toolHandles` / `mcpHandles`, then `attachRunHostServices`.

---

## `defineNode` API (locked for this epic’s plan)

Folder: `packages/node-sdk/src/node-factory/define-node/` (one factory
= one folder, same as other factories).

```ts
export const example = defineNode({
	type: 'example-gate',
	displayName: 'Example Gate',
	category: 'Logic',
	description: '…',
	uiSchema: [] as const,
	/** Declared ports — metas for palette; values passed into execute. */
	inputs: {
		trigger: { wireType: 'dynamic', required: true },
	},
	outputs: {
		ok: { wireType: 'boolean' },
	},
	execute(ctx, inputs) {
		// sync or Promise; throw → port/run error; no rxjs required
		// ctx: ExecutionContext<UI> — no files/kb/llm bags
		return { ok: true };
	},
});
```

### Semantics (must specify in implementation notes / tests)

| Concern      | Decision                                                                                                                                  |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime      | Adapter builds `defineReactiveNode` `bind` that combines declared inputs (+ hidden `ctx`), calls `execute`, maps return object to outputs |
| Multi-input  | When an input is `multi: 'combine' \| 'merge'`, match reactive port modes; document aggregation for bypass-style ids if supported in v1   |
| Errors       | `throw` / rejected Promise → `StatefulObservable` error (hard fail), not silent empty                                                     |
| Activation   | Default `emitOncePerActivation: true` (simple nodes = one execute per input activation)                                                   |
| Return shape | Object keys = output port ids; missing required output → error                                                                            |
| Params       | `ctx.params` from `uiSchema` (same as reactive)                                                                                           |
| Typing       | Generics from `inputs`/`outputs`/`uiSchema` as far as practical without forcing authors into SO types                                     |
| Retry        | Out of scope for v1 unless trivial to port from historical shared adapter; do not block epic on retry                                     |

Historical reference (removed from shared):
[docs/WIP/runtime-cleanup-refactor.md](../../WIP/runtime-cleanup-refactor.md)
(`wireSimpleExecuteInputs`, `wrapSimpleExecute`). Re-read for lessons; do not
copy into `@langflower/shared`.

### Author sample

- SDK sample under `define-node/test/samples/` with **zero** `rxjs` imports in
  the author file.
- HOW_TO: new top section **Simple nodes (`defineNode`)** before reactive guide;
  custom authors use **base** ctx; LLM authors use tools / `ToolHandle`, not
  `ec.files`.

## Slim `.` — keep

- Factories: `defineNode`, `defineReactiveNode`, `defineToolRegistrations`
- IO: `makeInput`, `configureOutput`, related inline/HITL port meta types needed
  by reactive authors and by the adapter
- Base `ExecutionContext` (identity + panel only)
- `CtxError`, `contextSymbol`, `TOOL_HANDLE_WIRE_TYPE`, `ReactiveNodeDefinition`,
  uiSchema helpers (`createTypedUISchema` may stay on `.` or existing subpath)

## Slim `.` — remove / relocate

- Re-exports of `defineLlmNode`, `LlmExecutionCaps`,
  subagent wire types → `./llm`
- MCP handle exports → `./mcp`
- Do **not** put `ProjectFilesContext` / `KbContext` / … on the default author
  mental model in HOW_TO for custom nodes
- Anything else not required by the three factories (audit
  `define-reactive-node.ts` re-export list)

## Deps (best-effort in this epic)

Prefer reducing value-dependency on full `@langflower/runtime` (editor/runner)
via `port-meta` / type-only imports where safe. Full dep cleanup may finish in
epic 30; do not block `defineNode` on perfect dep graph.

## In scope

- `ExecutionContext<UI, Caps>` refactor + `LlmExecutionCaps`; specialized
  common-nodes own host I/O via `@langflower/tools` (no public Caps / EC host
  fields — see Landed notes)
- New `define-node` factory + tests + sample
- `package.json` `exports` for `.`, `./llm`, `./mcp` (+ keep
  `./create-typed-ui-schema` if still used)
- Import path updates for moved LLM/MCP symbols
- Docs: AGENTS.md, HOW_TO_WRITE_REACTIVE_NODES.md (defineNode + ctx Caps),
  NODES.md, node-definitions package docs
- Remove “defineNode out of scope” language from AGENTS

## Out of scope

- Package rename to `node-sdk` (epic 30)
- Custom-node compiler / palette load (epic 32)
- Bootstrap seed `my-nodes` (epic 31/33)
- Second execution engine / batch runner
- `defineAgentNode` / revive old shared barrels
- Redesigning ToolHandle packs or removing graph Read File nodes
- Sandbox (TBD-001)

## Acceptance criteria

1. Author file can use only `defineNode` with **no** `rxjs` import and produce a
   `ReactiveNodeDefinition`-compatible result (`getInstance` works in unit test).
2. Thrown execute error fails the reactive port (observable error), visible to
   runtime tests.
3. Default `ExecutionContext` has **no** fields from today’s host bag
   (skillMarkdown, streams, harness, toolHandles, crawl, kb, memory, files,
   mcpHandles, createEmbedding).
4. `defineLlmNode` bind ctx includes `LlmExecutionCaps` and **excludes**
   `files` / `kb` / `crawl` / `memory`.
5. common-nodes Read File / KB / Crawl / Memory create host I/O internally via
   `@langflower/tools` (no Caps / no public EC host fields).
6. Public `.` does **not** export `defineLlmNode` or `MCP_HANDLE_WIRE_TYPE`;
   `./llm` and `./mcp` do; common-nodes builds after import updates.
7. `node build/tools/agent-run.mjs dead-code` → clean; `check-exports`;
   `verify` (at least `--quick`; full if reactive/execution tests touched).
8. HOW_TO documents `defineNode` first; AGENTS lists `defineNode` as in-scope;
   custom authors documented against base ctx only.

## Touch list (expected)

- `packages/node-sdk/src/node-factory/define-reactive-node/types.ts`
  (`ExecutionContext` Caps)
- `packages/node-sdk/src/node-factory/define-llm-node/**`
- `packages/node-sdk/src/node-factory/define-node/**`
- `packages/node-sdk/src/node-factory/define-reactive-node/define-reactive-node.ts`
  (re-exports)
- `packages/node-sdk/package.json` (`exports`)
- `packages/common-nodes/**` (llm/mcp imports + Caps for graph I/O nodes)
- `packages/server/src/bridge/build-execution-context.ts` (typing vs wide seed)
- `packages/tools/**`, `packages/shared/**` if they import moved symbols
- `docs/HOW_TO_WRITE_REACTIVE_NODES.md`, `packages/node-sdk/AGENTS.md`,
  `docs/NODES.md`

## Verify

```bash
node build/tools/agent-run.mjs verify --quick
# after import churn / runtime adapter tests:
node build/tools/agent-run.mjs verify
```
