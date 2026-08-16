# Custom Nodes

Author packs under `.langflower/nodes/<pack>/`. Default seed pack:
**`my-nodes/`**.

Import **`defineNode`** (default), `defineToolRegistrations` (LLM tool packs),
or `defineReactiveNode` from `@langflower/node-sdk` — not from a root
`nodes/types.ts`.

Each `*.ts` file may `export default` a definition or an array. No required
`index.ts`. Run `npm install` inside the pack when you add author dependencies;
Langflower does **not** auto-install on start, bootstrap, or palette reload.

See [`nodes/my-nodes/README.md`](nodes/my-nodes/README.md) for the full
contract.

## Seed demo

- `my-nodes/git-diff.ts` — `defineNode`; runs `git diff`, emits `diff`.
- `my-nodes/git-diff-tool.ts` — `defineToolRegistrations`; emits `git_diff`
  ToolHandle for agent `tools` ports (on demand).
- `my-nodes/review-gate.ts` — `defineReactiveNode`; runs `npm run test`,
  emits on **`ok`** or **`fail`** independently.

`git-diff` / `git-diff-tool` use `child_process` until a shell Cap exists on
`ExecutionContext`.

## Load custom nodes

Call **`compile_custom_nodes`** (no args) — on starter, Helper and Writer
already have it because **Langflower Tools** is wired — or, in the editor
Custom section, click **Update** (or reconnect). Same composer: typecheck
each pack (`tsc --noEmit` when `tsconfig.json` is present), esbuild-bundle
entries that passed, hot-swap live custom instances, refresh **Custom**.
Stop is not required for already-placed custom types. Already-wired custom
tools can be invoked later in the **same run**. New types are not auto-placed
or auto-wired mid-run. Failures write `COMPILATION_ERRORS.md` in the pack
without dropping other successful custom nodes.

## Gaps

1. No shell Cap on public `ExecutionContext` yet (seed demos use
   `child_process`).
2. Sample workflows catalog UI is not shipped — extra skeleton workflows stay
   in the packaged `skeleton/` until catalog import lands.
