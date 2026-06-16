# Epic 32 — `@langflower/compiler` (custom node load)

**Status:** landed  
**Depends on:** [31-custom-nodes-my-nodes-contract.md](31-custom-nodes-my-nodes-contract.md)
(contract), [30-rename-node-sdk.md](30-rename-node-sdk.md) (sdk name)  
**Index:** [README.md](README.md)  
**Next:** [33-bootstrap-skeleton-my-nodes.md](33-bootstrap-skeleton-my-nodes.md) _(landed)_

## Goal

Ship **`@langflower/compiler`**: scan project custom-node packs, discover
`export default` entry files, esbuild-bundle author code (including author npm
deps), cache under `.langflower/.cache/nodes/`, return definitions for palette +
runtime resolve. `@langflower/server` only **composes** (thin server).

Custom UI / protocol surface is a dedicated **`customPalette`** bus pack (not
merged into `palette.snapshot`).

## Owns / must not

| Owns                                                     | Must not             |
| -------------------------------------------------------- | -------------------- |
| Discover `.langflower/nodes/<pack>/`                     | WS, secrets, Express |
| Find `*.ts` with `export default`                        | UI / ngDiagram       |
| esbuild ESM; bundle author deps; external host SDK       | Auto `npm install`   |
| Content-hash cache                                       | Sandbox (TBD-001)    |
| Structured compile errors + pack `COMPILATION_ERRORS.md` | Workflow execution   |

## Public API

```ts
// @langflower/compiler
compileProjectNodes(projectDir: string): Promise<{
	readonly nodes: readonly ReactiveNodeDefinition[];
	readonly errors: readonly CompilePackError[];
}>;
```

Per pack / per `export default` entry: `tsc --noEmit` (when tsconfig present)
then esbuild only for clean entries. Sibling packs and sibling entries are
independent. Snapshot status: `ok` | `partial` | `error`.

## Bridge (`customPalette`)

| Direction       | Event                            | Role                                                |
| --------------- | -------------------------------- | --------------------------------------------------- |
| Client → server | `customPalette.update.requested` | Recompile packs                                     |
| Server → client | `customPalette.snapshot`         | SoT for Custom section: `{ nodes, errors, status }` |

`palette.snapshot` = system only. `palette.compilationError` removed.

On failure: write `.langflower/nodes/<pack>/COMPILATION_ERRORS.md` with the same
diagnostics as `errors[]` — no silent fails.

## Acceptance criteria

1. `customPalette.snapshot` returns custom `defineNode` demo with `status: 'ok'`.
2. Workflow node of that type resolves and runs (integration).
3. Missing author `node_modules` / bad source → `status: 'error'`, non-empty
   `errors`, `COMPILATION_ERRORS.md`, server stays up.
4. No `index.ts` required in fixture.
5. `verify` includes unit + integration coverage.

## Verify

```bash
node build/tools/agent-run.mjs verify
```
