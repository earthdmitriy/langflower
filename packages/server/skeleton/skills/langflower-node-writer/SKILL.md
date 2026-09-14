---
name: Langflower node writer
description: >-
    Guides authors writing project custom nodes under .langflower/nodes packs
    (defineNode / defineToolRegistrations / defineReactiveNode, ADR-030 layout,
    reload via compile_custom_nodes or Custom Update).
---

# Langflower node writer

You help the user write **custom nodes** for Langflower.

## Honesty (do not invent)

- Custom nodes are **TypeScript** via `@langflower/node-sdk` only — first-class
  language; `tsc` / IDE types are the compile-time validators. **Not** plain JS
  as the authoring path, Go, Python, Rust, or other runtimes.
- Do **not** claim sandboxed execution of arbitrary user-node code is shipped.
- After file changes **call `compile_custom_nodes` yourself** (no args) — on
  starter, Writer has it because **Langflower Tools** is wired. Custom →
  **Update** is the same composer. Failures land in `COMPILATION_ERRORS.md`.
  Do **not** only remind the user to click Update.
- Pack `tsconfig.json` is the `tsc --noEmit` gate. `from './lib/x.ts'`
  requires `"allowImportingTsExtensions": true` next to `"noEmit": true`
  (copy `hello-embed/tsconfig.json`). Without it the pack does not compile.
  Extensionless imports (`my-nodes`) do not need the flag.
- Langflower does **not** auto-`npm install` pack dependencies.
- Do **not** claim you can place a newly compiled type on the canvas or wire
  it mid-run. Already-placed types hot-swap; already-wired custom tools can
  be invoked later in the **same run**.

## Contract (do not invent forks)

- Default pack: `.langflower/nodes/my-nodes/` (one folder = one `package.json`).
- Prefer **`defineNode`** for sync/Promise nodes (`execute` stamps pending
  on outputs). Use
  **`defineToolRegistrations`** for LLM-callable `ToolHandle` packs on a
  `tools` port. Use **`defineReactiveNode`** only when exclusive multi-output
  branches, streams, or advanced bind wiring are required.
- Import from **`@langflower/node-sdk`** — never from a generated
  `nodes/types.ts` or a required `index.ts` barrel.
- Each `*.ts` / `*.tsx` may `export default` a definition or an array.
  Skip `*.test.ts`, `*.d.ts`, `dist/`, `node_modules/`.
- Peer deps on the host SDK / RxJS are supplied by Langflower; author libs go
  in pack `dependencies`. The user runs `npm install` in the pack.
- After file changes: call **`compile_custom_nodes`** (wired on starter
  Helper / Writer via **Langflower Tools** — not ambient on every agent) or
  Custom section → **Update**. Stop is not required for already-placed
  custom types. An already-wired custom tools pack can be invoked later in
  the **same run** after compile. Failures land in `COMPILATION_ERRORS.md`
  in that pack.
- Sibling packs: any folder under `.langflower/nodes/` with its own
  `package.json` is discovered (no `langflower.jsonc` registration). Seed
  `my-nodes` is the default; extra packs sit next to it (`hello-embed`).

## Author patterns (do not invent forks)

### Factory

| Need                                                                        | Factory                   | Not                                                  |
| --------------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------- |
| One `execute` result on **all** outputs together                            | `defineNode`              | Exclusive `ok` / `fail`                              |
| LLM-callable `ToolHandle[]` on a `tools` port                               | `defineToolRegistrations` | `defineNode` that returns inventory as a string wire |
| Emit on one port and **stay silent** on the other; streams; `inferTypeFrom` | `defineReactiveNode`      | `defineNode`                                         |

**Wrong:** a review / QA gate with `defineNode` that returns `{ ok: true }`
or throws on failure. `execute` maps onto every declared output at once.
Throwing is a node error stream — it does **not** drive a separate `fail`
branch. **Right:** `defineReactiveNode` + `of` / `EMPTY` (seed
`review-gate.ts`).

### Multi-file imports

Pack `tsconfig` is NodeNext. Relative `from './lib/x'` **without** a suffix
fails `tsc` (`TS2835`). Either keep one-file nodes with no local imports
(seed `git-diff.ts`) **or** `from './lib/x.ts'` plus
`"allowImportingTsExtensions": true` next to `"noEmit": true` (copy
`hello-embed/tsconfig.json`).

### LLM tools (`defineToolRegistrations`)

- `handler` returns `Promise<string>`. Expected command / test failure is
  **text to the model**, not `throw`. Throw only for contract (empty
  `ctx.projectDir`).
- Agent-facing text is a **short signal**: success → one line `ok  <toolId>`.
  Failure → failed tests / `TS####` / ESLint errors only. Strip ANSI. Drop
  `✓`, coverage tables, npm lifecycle banners, raw stdout dumps. When
  slicing an `Issues:` block, do **not** use `$` with the `/m` flag (that
  is end-of-line, so the match stops after the first line).
- No shell Cap on public `ExecutionContext` yet — `child_process` like seed
  `git-diff-tool.ts`. `shell: true` only with an **allowlisted literal**
  (`npm run format`); never splice user paths into a shell string. Resolve
  user paths under `ctx.projectDir` and reject `..` escapes.
- Do not register hanging processes (`start`, `dev`, `test:watch`) as tools.

### QA / review gates (`defineReactiveNode`)

- Exclusive ports: pass → emit on `ok`, silent `fail`; fail → emit on
  `fail`, silent `ok`.
- Two honest `ok` shapes — pick from the graph, do not mix them:
    - **Pulse** — seed `review-gate.ts` emits `boolean` `true`
      (`wireType: 'boolean'`). Downstream only needs “passed”.
    - **Passthrough** — when the next stage must keep the original payload:
      `configureOutput('ok', ok$, { inferTypeFrom: trigger })`. Do **not**
      emit `boolean` `true` on that wire (it breaks typing and the
      continue-the-graph edge).
- `fail` is a **string** (prefer stripped tool-handler text, not raw
  stderr dumps).
- A rewrite step (formatter) may run as a **side effect** and must not
  fail the gate if the product intent is “format then typecheck/test”.
  Typecheck / tests may fail the gate and skip later steps.

### Tests

Pack compile **skips** `*.test.ts`. Drive nodes with
`createNodeHarness` from `@langflower/node-sdk/testing`. Subscribe to
exclusive `ok` / `fail` **before** `send('trigger')` or you miss the
emission. Mock `child_process` — do not spawn a real monorepo `build`
from a unit test. Host `npm test` only sees pack tests if the project
Vitest config **includes** that glob; do not assume it.

## When drafting a node

1. Pick a stable `type` string (pack-unique) and `displayName`.
2. Declare `inputs` / `outputs` with `wireType`s; keep `uiSchema` honest
   (`defineToolRegistrations` owns a `tools` output — no custom inputs).
3. Implement `execute` (`defineNode`), `tools` handlers
   (`defineToolRegistrations`), or `bind` (`defineReactiveNode`).
4. Show the full file the user can paste into `my-nodes/` **or write it**
   under `.langflower/nodes/<pack>/`.
5. Call **`compile_custom_nodes`**. If the snapshot lists errors, `read`
   that pack’s `COMPILATION_ERRORS.md`, fix, and compile again. Tell the
   user to place **new** types from Custom; already-placed types are live.

## References in the project

- `.langflower/instructions.md`
- `.langflower/nodes/my-nodes/README.md`
- Seed demos: `git-diff.ts` (`defineNode`), `git-diff-tool.ts`
  (`defineToolRegistrations`), `review-gate.ts` (`defineReactiveNode`)
- Multi-file + `.ts` imports: `.langflower/nodes/hello-embed/` (`tsconfig.json`
  already has `allowImportingTsExtensions`)
