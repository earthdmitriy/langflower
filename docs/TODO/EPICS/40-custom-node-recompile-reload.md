# Epic 40 — Custom node recompile, hot-swap, compile tool

**Status:** queued  
**Depends on:** [epic 32](../../DONE/EPICS/32-langflower-compiler.md) (landed —
compiler + `customPalette`); [epic 33](../../DONE/EPICS/33-bootstrap-skeleton-my-nodes.md)
(landed — `starter` + `my-nodes` seed)  
**Index:** [README.md](README.md)  
**Do not mix with:** [epic 39](39-ai-package-restructure.md) (`ai/` layout only)

## Goal

Close the **write → compile → run/call** loop for project custom nodes so an
in-product agent can author a tool-registration node, compile it, and invoke
the new tools **without a human clicking Custom Update** and without restarting
the server or reloading the workflow.

Today the Writer can put TypeScript on disk, but verification fails: Stop +
Palette **Update** still runs the **previous** in-memory `getInstance()` /
ESM module. The agent has no compile tool either.

## Problem

1. **Stale disk / ESM:** `.langflower/.cache/nodes/<pack>/<contentHash>/` is
   overwritten in place; Node can keep the previous `import()`.
2. **Stale live graph:** `CustomNodeRegistry.setNodes` replaces the map;
   already-placed canvas nodes keep the old `definition.getInstance()`
   closures until a full workflow bind.
3. **No agent compile:** Palette **Update** is UI-only
   (`customPalette.update.requested`). Starter Helper/Writer cannot compile.
4. **Frozen tool inventory:** `runAgentLoop` / `runLlmLoop` take a snapshot
   `tools: context.tools` for the whole turn. Even a successful hot-swap would
   not expose new `invoke` / new tool ids on the **next** tool-loop iteration
   unless the loop re-reads inventory. Re-emitting the LLM `tools` port would
   `switchMap`-restart the session — forbidden mid-turn.

## Product sequence (locked)

1. **User asks to write a custom node** that registers LLM tools
   (`defineToolRegistrations`). Helper / Writer writes
   `.langflower/nodes/<pack>/*.ts`.
2. **Connect the new node to the agent** (one-time **idle** topology): drop
   the compiled custom tools node from Custom palette, wire its `tools`
   output into the agent `tools` port. Graph stays locked during a run —
   this epic does **not** auto-place or auto-wire new types mid-run.
3. **User asks the agent to fix / verify the node.** No further human
   Update clicks: agent edits source → calls **`compile_custom_nodes`** →
   calls the custom tools. Same run, later tool-loop iterations must see
   the post-compile handlers.

```text
write pack .ts
  → compile_custom_nodes
  → (idle, once) wire custom tools → agent.tools
  → edit pack .ts
  → compile_custom_nodes
  → invoke custom toolIds
```

## Out of scope

- Epic 39 `ai/` folder moves.
- TBD-001 sandbox; auto `npm install` in packs.
- File-watch auto-compile; new MCP-only compile API (the **node tool** is
  the agent surface; Palette Update stays as the human surface).
- Auto-add / auto-wire a newly compiled type onto the canvas during a run.
- Re-emitting LLM `tools` / `mcp` ports mid-turn (would reset ADR-016
  session via `switchMap`).
- Changing harness `toolPermissions` keys (compile is a **wired** ToolHandle,
  not a builtin harness id).

## In scope

- Unique compile cache + fresh ESM load (no overwrite of an imported `.mjs`).
- **Hot-swap** live editor instances of custom types (idle **and** running).
- Shared compile composer used by Palette Update **and** the compile tool.
- Catalog node `common-compile-custom-nodes` (`defineToolRegistrations`)
  exposing `compile_custom_nodes`.
- Seed **starter**: that node wired into Helper (and Writer) `tools`.
- Tool-loop inventory re-read each iteration (getter / ref — not a new
  `tools` port event).
- Skills / helper KB / STATUS / compiler AGENTS honesty on land.

---

## Locked mechanics

### A. Compiler cache + ESM

Every `compileProjectNodes` with packs:

- Write artifacts under a **new stamp dir**:
  `.langflower/.cache/nodes/<pack>/<cacheKey>-<compileStamp>/`.
- Best-effort prune of previous pack dirs (`EBUSY` / `EPERM` ignored on
  Windows).
- `import()` that new file URL (query bust optional extra).
- Never overwrite a `.mjs` Node already imported.

Empty / missing `nodes/` stays a no-op (no cache dir).

### B. Hot-swap in runtime

`CustomNodeRegistry.setNodes` is not enough.

After a successful (or partial) compile, for each live `RuntimeEditor` node
whose `type` is in the new custom set:

- Materialize a new instance via `getInstance()`.
- Keep the same `nodeId`, persisted params/inputs/ui, and incident edges.
- Reconnect existing edges onto the new ports (no `addNode` / `removeNode`
  — those fail while `editor.locked`).

This must work **while `runnerStatus === 'running'`**. Topology (which
nodes/edges exist) does not change. If a type **vanishes** from the compile
result, keep the old instance until idle rebind (do not drop canvas nodes
mid-run).

New RuntimeEditor API (name TBD, e.g. `hotSwapNode`) is allowed; do not
unlock the whole graph to reuse `removeNode`+`addNode` during a run.

Palette Update when **idle** may still full-`bindWorkflowToSessionEditor`
if that is simpler for vanished types; when **running**, only hot-swap.

### C. Compile composer (one path)

UI Update and the compile tool must call the **same** server composer:

1. `compileProjectNodes(projectDir)`
2. `registry.setNodes`
3. Hot-swap live custom instances
4. Emit `customPalette.snapshot` (so the Custom section matches)
5. Refresh in-flight agent inventory **without** a `tools` port event

Do not grow compile logic inside `@langflower/common-nodes`. Inject a host
hook from server (same pattern as `RunHostServices` / LLM factories). The
catalog node only exposes a `ToolHandle`; the hook owns FS + registry +
editor.

Suggested hook shape (normative intent, not a frozen import path):

```ts
compileCustomNodes(): Promise<{
  readonly status: 'ok' | 'partial' | 'error';
  readonly errors: readonly { readonly packageName: string; readonly message: string }[];
  readonly nodeTypes: readonly string[];
}>
```

`common-nodes` must **not** depend on `@langflower/compiler`. Compiler stays
server-composed.

### D. Catalog node + tool

| Field         | Value                                                                       |
| ------------- | --------------------------------------------------------------------------- |
| `type`        | `common-compile-custom-nodes`                                               |
| `displayName` | Compile Custom Nodes                                                        |
| `category`    | Tools                                                                       |
| Factory       | `defineToolRegistrations` (same as Memory / Crawl tools)                    |
| `toolId`      | `compile_custom_nodes`                                                      |
| Args          | none required (`additionalProperties: false`)                               |
| Result        | human-readable status + pack errors (same facts as `COMPILATION_ERRORS.md`) |

Handler: call the injected compile hook; return `{ ok: false }` style text on
hook missing (node used outside a server run).

Register in `catalog.ts`. `paletteSecondary` optional (Tools / Advanced) —
starter still places it explicitly.

### E. Starter wiring

[`packages/server/skeleton/workflows/starter.json`](../../../packages/server/skeleton/workflows/starter.json)
(+ dogfood `demo-project`):

- Add node `compile` (`common-compile-custom-nodes`).
- Edges: `compile.tools` → `helper.tools` **and** `writer.tools` (fan-out).
  Writer must be able to compile while drafting; Helper must compile then
  call custom tools after the custom pack is wired.

Do not require a full `starter` topology redesign. Positions: keep existing
Chat / Helper / Writer / Review; place Compile near Helper.

Existing seed `git-diff-tool.ts` is the **example** custom tools node to
wire in step 2 of the product sequence (not pre-wired on starter — author
loop is the point).

### F. Same-turn inventory refresh

`runLlmLoop` / `runAgentLoop` must resolve the ToolHandle list **each
iteration** (and when dispatching `invoke`), not once at turn start.

After `compile_custom_nodes` returns:

- Existing custom `toolId`s: next `invoke` is the new handler.
- **New** `toolId`s from an already-wired custom tools node: included in the
  next provider round’s tool definitions.
- Do **not** push a new value on the LLM `tools` input (session `switchMap`).

Implementation sketch: pass `getTools: () => readonly ToolHandle[]` (or a
mutable ref the compile hook updates after hot-swap). Wired `ToolHandle`
objects from a rematerialized custom tools node must be what `getTools`
returns — typically by reading current editor outputs / registry, not the
frozen `combineInputs` snapshot.

### G. Palette Update (human)

Keep Custom → **Update**. It runs the same composer as the tool. After this
epic, Stop is **not** required for the new code to take effect on already
placed custom nodes (hot-swap). Stop remains the way to cancel a run.

---

## Docs / skills on land

- [packages/compiler/AGENTS.md](../../../packages/compiler/AGENTS.md) — stamp
  cache + ESM reload.
- [docs/STATUS.md](../../STATUS.md) row 6 Reload nodes — custom path done if
  AC green (system `palette.reload` unchanged).
- Helper KB + `langflower-node-writer`: after file changes call
  `compile_custom_nodes` (or Custom Update); do **not** tell authors that
  Stop + Update is the only path.
- [FOUND_BUGS.md](../../FOUND_BUGS.md) if stale ESM / `getInstance()` is
  reproduced as a design-flaw entry.
- Skeleton + dogfood copies of starter / skills.

Do not flip a use-case to Implementable unless that UC’s Missing parts are
only this loop.

---

## Blast radius

| Area                                      | Touch?                  | Notes                                                                                                                     |
| ----------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `packages/compiler`                       | **Yes**                 | Stamp dir, prune, fresh import                                                                                            |
| `packages/runtime`                        | **Yes**                 | Locked-graph hot-swap API                                                                                                 |
| `packages/server` palette / bridge        | **Yes**                 | Shared composer; inject hook; Update + tool                                                                               |
| `packages/common-nodes`                   | **Yes**                 | Compile tools node; loop `getTools`; catalog                                                                              |
| `packages/server/skeleton` + demo-project | **Yes**                 | starter edges; skills                                                                                                     |
| `packages/ui`                             | No (unless Update copy) | Existing Update button                                                                                                    |
| Epic 39 `ai/` layout                      | **No**                  | Independent; if 39 lands first, put the new node under `ai/` only if it is an LLM node — it is **Tools**, not `ai/nodes/` |
| TBD-001 sandbox                           | **No**                  |                                                                                                                           |

---

## Acceptance criteria

1. **Cache:** two compiles of the same pack write distinct artifact dirs;
   second `import` is a new module (updated `displayName` / `execute` /
   tool `handler`). Helper-only source edits reload. Stale dirs pruned
   best-effort.
2. **Hot-swap idle:** place custom node → run (old output) → edit source →
   Update or `compile_custom_nodes` → run again **without** `workflow.load`
   or server restart → **new** output.
3. **Hot-swap running:** during an agent turn, `compile_custom_nodes` then
   a later tool call in the **same** `runLlmLoop` uses the new custom
   `invoke` (and new tool ids on the next provider round). Session is not
   reset (no dropped history from `switchMap`).
4. **Compile node:** `common-compile-custom-nodes` is in the system palette;
   starter wires it to Helper and Writer `tools`. Tool result surfaces pack
   errors; `COMPILATION_ERRORS.md` still written as today.
5. **Human Update** and the compile tool share one composer (same snapshot,
   same live instances).
6. Mid-run compile does **not** add/remove canvas nodes or edges.
7. Skills / helper KB / compiler AGENTS match shipped behaviour.
8. Close-out gate green.

## Verify

- Intermediate (optional): focused vitest on compiler, runtime hot-swap,
  `run-agent-loop` inventory refresh, compile-node unit tests;
  `verify --quick` while iterating.
- **Close-out (required):** `npm run test` or full
  `node build/tools/agent-run.mjs verify` — unit **and** integration.
  Do not mark the epic done on `--quick` alone.

Integration acid tests (minimum):

- Custom `defineNode` execute string changes after Update, no workflow load.
- Custom `defineToolRegistrations` handler changes: Fake-LLM (or scripted)
  turn calls `compile_custom_nodes`, then calls the custom `toolId`, sees
  new return value in the same run.
- Update / compile while a non-agent run is in progress does not crash;
  topology unchanged.
