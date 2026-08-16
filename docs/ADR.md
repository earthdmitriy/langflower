# Architecture Decision Records (ADR)

Log **non-obvious** architectural choices — decisions where reasonable alternatives
exist and we accepted specific tradeoffs.

**Related:** [FOUND_BUGS.md](FOUND_BUGS.md) records **reproduced bugs** and design flaw
signals for retrospective. ADRs capture **chosen** architecture; the bug log captures
**wrong assumptions** we discovered in production or QA — promote repeated themes here
into a new ADR. Long-horizon goals that are **not** decided yet live in
[TBD.md](TBD.md) (migrate into an ADR when tradeoffs settle).

**Do not add an ADR for:** framework defaults, linter settings, or team preferences
that have no meaningful downside (e.g. "we use git", "we format code"). Those belong
in `PRINCIPLES.md` or package READMEs.

**Do add an ADR when:** the choice constrains future work, was debated, or rejects a
viable alternative with real cost. **Adapter or glue layer:** every unavoidable adapter
must have its own ADR — see [PRINCIPLES.md](PRINCIPLES.md) § No adapters, no glue code.

Statuses: `accepted` · `proposed` · `pending` · `superseded` · `deprecated`

---

## ADR-001 — npm workspaces monorepo

**Status:** accepted · **Date:** 2026-06-16

**Context:** Stage 1 ships CLI, server, UI, and shared types as one product with a
fixed build order.

**Alternatives considered:**

- **Separate repos per package** — simpler CI per artifact, but cross-package refactors
  and atomic Stage 1 delivery become painful.
- **Single package (no workspaces)** — fewer `package.json` files, but blurs CLI vs
  server vs UI boundaries and couples Angular build to Node publish.

**Decision:** Single repository with npm workspaces: `shared → server → ui → cli`.

**Tradeoffs accepted:**

- (+) One clone, one PR, shared types always in sync.
- (−) Build pipeline must enforce order; cannot publish UI alone as npm lib without
  extra packaging work.
- (−) Heavier root tooling (ESLint/Prettier span all packages).

**Consequences:**

- `@langflower/shared` compiled first; the **root** `langflower` package is the
  only publishable npm product (`bin` + bundled `vendor/`); `@langflower/cli` is
  a private workspace package (see [RELEASE.md](RELEASE.md)).
- `build/build-all.mjs` encodes dependency order.

---

## ADR-002 — `.langflower/` project-local storage (opencode-style)

**Status:** accepted · **Date:** 2026-06-16

**Context:** Tool runs inside the user's existing repo (e.g. an app repo), not a
dedicated Langflower project.

**Alternatives considered:**

- **Global config dir** (`~/.langflower`) — simpler path logic, but workflows/nodes
  are not portable with the project and multi-project use gets messy.
- **Inline config in repo root** (`langflower.json`, `workflows/`) — visible without
  dot-prefix, but pollutes user tree and increases collision risk with user files.

**Decision:** All tool state under `<project-root>/.langflower/` (hidden, colocated).

**Tradeoffs accepted:**

- (+) Zero writes outside one folder; easy "delete tool data" story.
- (+) Matches opencode-style mental model for agent tooling.
- (−) Users must discover hidden folder; document in CLI/UI.
- (−) Dot-folder may still be committed by mistake unless `.gitignore` guidance is clear.

**Mitigation:** root `.gitignore` ignores `**/.langflower/**/.cache/` (esbuild node
bundler output). Demo seed files under `demo-project/.langflower/` remain tracked;
machine-specific `config.json` is ignored.

**Consequences:**

- Server FS code paths scoped to `.langflower/` only.
- Bootstrap copies templates from `packages/server/templates/`.

### Amend — global user config layer (2026-07-20)

**Context:** Settings panel needs user-wide provider/model defaults shared
across projects, with project overrides. ADR-002 deliberately rejected a
global dir for _workflows/nodes_; that still holds. Provider credentials and
defaults are a different concern — operators should not copy the same
`provider` block into every repo.

**Decision:** Keep all **project** tool state under
`<project-root>/.langflower/`. Additionally, allow a single **global**
`langflower.jsonc` outside the project for user-wide defaults (providers,
default model, embedding block only for Settings v1). Merge precedence:
**project > global** for overlapping keys / provider ids. Workflows, nodes,
runs, skills, and permissions stay project-local (global does not own them).

**OS paths** (server-resolved; see [CONFIG.md](CONFIG.md) § Global config):

| OS      | Path                                                        |
| ------- | ----------------------------------------------------------- |
| Windows | `%APPDATA%\langflower\langflower.jsonc`                     |
| macOS   | `~/Library/Application Support/langflower/langflower.jsonc` |
| Linux   | `${XDG_CONFIG_HOME:-~/.config}/langflower/langflower.jsonc` |

**Tradeoffs accepted:**

- (+) One place for personal LLM defaults; project file still wins and stays
  portable for team-shared providers.
- (−) Server may write outside the project tree — only this global config
  path; not a general escape from ADR-002's project scoping.
- (−) Operators must discover two files; Settings UI surfaces the resolved
  global path (use-case S6).

**Consequences:**

- `LangflowerConfigService` reads/writes project + global layers; effective
  config for runs and `langflower.config.snapshot` is the merge.
- Project-only fields (`currentWorkflowId`, `dividerPositions`, `permission`,
  `harness`, `mcp`, …) remain project file only.

---

## ADR-003 — `@langflower/shared` as the product/protocol kernel

**Status:** accepted · **Date:** 2026-06-16 · **Updated:** 2026-07-22

**Context:** CLI, server, UI, and MCP must agree on persisted workflow/config
shapes and the internal WebSocket protocol. Runtime and node-authoring
contracts have separate package owners and must not be mirrored in shared.

**Alternatives considered:**

- **Duplicate types in server + UI** — faster early iteration, guaranteed drift.
- **OpenAPI / JSON Schema as source of truth** — useful for a public HTTP
  contract, but the co-versioned product uses a typed internal WebSocket bus.
- **Single `types` package + Zod runtime validation** — stronger runtime checks,
  but would incorrectly pull runtime/SDK ownership into one horizontal package.

**Decision:**

- `@langflower/shared` owns persisted product shapes, config helpers, internal
  WebSocket registry/payloads, and small pure cross-package helpers.
- `@langflower/runtime` owns runner, graph, port-state, and runtime event types.
- `@langflower/node-sdk` owns node-authoring and port metadata types.
- Cross-package consumers import declared concrete `package.json` exports.
  `index.ts` barrels and mirror DTOs are forbidden.

**Tradeoffs accepted:**

- (+) Single compile-time contract across all packages.
- (+) Shared stays framework- and I/O-free.
- (−) Every domain change rebuilds dependents.
- (−) Ownership must be explicit when a shape crosses product, runtime, and SDK
  boundaries.

**Consequences:**

- Import only published package paths; never another package's `src/` tree.
- Reuse runtime/SDK owner types in shared protocol definitions where the
  internal co-versioned bus intentionally exposes them (ADR-012).

---

## ADR-004 — Functional / reactive style with RxJS

**Status:** accepted · **Date:** 2026-06-16 · **Updated:** 2026-07-22

**Context:** The editor, registry, internal WebSocket bridge, and runtime expose
facts and intents over time. Mutable service fields and command-shaped UI state
create stale reads, duplicate server state, and hidden ordering between features.
The runtime itself is reactive-only: nodes bind `StatefulObservable` ports and
execution demand enters through `RuntimeFacade.runner`.

**Alternatives considered:**

- **Imperative services + mutable fields** — lower RxJS learning curve, harder to
  compose bridge facts, hydration, execution, and canvas updates without stale
  reads.
- **NgRx / Akita store** — structured global state, but adds a second event/store
  model beside the typed internal bridge and node/runtime streams.
- **Angular signals-only** — fine for UI-local state; less natural for server-side
  streams, cross-feature temporal folds, and WebSocket orchestration already
  standardized on RxJS.
- **RPC/command-first UI state** — each request owns a response and local mutation;
  rejected because the bridge is broadcast, server facts are authoritative, and
  reconnect hydration must be reconciled explicitly with live deltas.

**Decision:**

- **Bridge-first UI state:** clients emit typed `*.requested` intents and consume
  authoritative bridge facts/snapshots as Observables. Normalize them to tagged
  actions, `merge`/`combineLatest` deliberately, reduce each concern through one
  pure immutable `scan` fold, then expose selectors/projections.
- Hydration, new-run identity, interrupt/done, and other resets are explicit fold
  actions with defined precedence over live deltas; they are not incidental
  resubscriptions or mutable service flags.
- UI-local signals are projections or ephemeral drafts. Cross-feature execution
  concerns may live in UI services as one fold consumed by multiple feature
  surfaces.
- Node authoring uses `defineReactiveNode.bind` and `StatefulObservable`.
  Execution uses `RuntimeFacade.editor` plus `RuntimeFacade.runner`; the bridge
  carries `runner.*` intents/facts. There is no parallel batch engine or
  `ReactivePortBus` contract.
- Immutable updates use `readonly` types (not `Object.freeze`).
- Side effects remain named edges. Allowed forms are imperative host boundaries
  (HTTP, FS, WebSocket, process, storage, ngDiagram), Angular `effect()` for
  derived-signal → host synchronization, telemetry-only RxJS `tap`, and owned
  terminal subscriptions with cleanup. None may act as a hidden state reducer.

**Tradeoffs accepted:**

- (+) Reconnect hydration and live bridge ordering have explicit, unit-testable
  policies instead of hidden mutable writers.
- (+) Runtime, server, and UI share a demand/fact model without DTO stores or
  execution-mode adapters.
- (+) Pure folds make ordering, reset, and stale-hydration bugs reproducible.
- (−) Tagged actions and selectors add vocabulary for small concerns.
- (−) RxJS operator choice and subscription lifecycle require discipline.
- (−) ngDiagram remains an imperative host boundary requiring a real shape
  conversion where its model differs from Langflower domain types (ADR-008).

**Consequences:**

- Follow [PRINCIPLES.md § Standard flow](PRINCIPLES.md#standard-flow) for UI
  orchestration and its side-effect allow-list.
- Prefer `async` pipe / `toSignal` projections; terminal subscriptions require
  explicit edge ownership and cleanup.
- Keep one concern in one fold; split independent concerns and combine their
  projections instead of duplicating state.
- Graph/fold updates return new objects, never mutate upstream values.

---

## ADR-005 — Strict TypeScript, no `any`

**Status:** accepted · **Date:** 2026-06-16

**Context:** Stage 2 execution will wire untyped user node code at boundaries; we need
clear internal types before adding that surface.

**Alternatives considered:**

- **Gradual strictness** — faster scaffolding, defects found at runtime instead of
  in editor.
- **`any` at integration boundaries only** — convenient for ngDiagram/third-party
  gaps, tends to spread inward.

**Decision:** `strict: true` repo-wide; ESLint forbids `any`; boundaries use
`unknown` + guards.

**Tradeoffs accepted:**

- (+) Refactors and API changes fail fast in CI.
- (−) More upfront typing work on stubs and third-party adapters.
- (−) UI needs tsconfig override for Angular composite (ADR-009) — strictness kept,
  project-reference model split.

**Consequences:**

- No `@ts-ignore` without tracked removal plan.

---

## ADR-006 — Express + ws, localhost only, no auth (Stage 1)

**Status:** accepted · **Date:** 2026-06-16

**Context:** Stage 1 is a local dev tool; no multi-user or remote deployment yet.

**Alternatives considered:**

- **Fastify / Hono** — performance/lighter stack; team familiarity and middleware
  ecosystem less critical for local CRUD.
- **Separate WS server** — simpler HTTP handler, more port/process management for CLI.
- **Auth + bind 0.0.0.0** — enables LAN access; scope creep and security burden for
  Stage 1.

**Decision:** Express + `ws` on same HTTP server; bind **127.0.0.1**; no auth.
**WebSocket is the default UI transport;** REST limited to bulk workflow payloads
(see ADR-012).

**Tradeoffs accepted:**

- (+) Minimal Stage 1 complexity; single process for CLI to manage.
- (+) One port for static, WS, and bulk REST.
- (−) Must revisit binding, CORS, and auth before desktop/LAN/remote scenarios.
- (−) Express REST surface kept intentionally tiny — most handlers live on WS router.

**Consequences:**

- Document security assumptions in spec; no "just open the port" shortcuts in Stage 1.
- Implement `websocket/ws-handler.ts` as primary API gateway, not an afterthought.

---

## ADR-007 — esbuild for custom node packages

**Status:** accepted · **Date:** 2026-06-16 · **Updated:** 2026-08-15

**Context:** User node packs may import npm deps; load path needs a single ESM
artifact per entry (or pack) for palette metadata and later execution. Pack
layout / npm model: [ADR-030](#adr-030--custom-node-pack-layout--npm-model).

**Alternatives considered:**

- **tsc emit per package** — respects types, slow, does not bundle dependencies.
- **webpack / rollup in server** — flexible, slower cold start and heavier config for
  arbitrary user `package.json`.
- **Dynamic `import()` of user TS without bundle** — requires user ts-node/tsx;
  inconsistent UX.

**Decision:** esbuild bundle to ESM; cache in `.langflower/.cache/nodes/` at
stable `<pack>/<entry>.mjs` paths. Each `compileProjectNodes` **deletes** that
cache root first (fail loud if wipe fails), then rewrites the same files so
`git diff` shows bundle content. Load uses a unique temp copy of the stable
`.mjs` so the ESM module cache cannot pin the git path. Owned by
`@langflower/compiler` (`compileProjectNodes`), not grown as server domain
logic. Discovery: each pack `*.ts` / `*.tsx` with `export default` (definition
or array); **no** required `index.ts`. Port metadata comes from the definition
object (`inputs` / `outputs` / `bind` probe) — **not** from a TypeScript
Compiler API scan of `execute` signatures.

**Compile pipeline (per pack, per entry):** (0) wipe `.langflower/.cache/nodes/`
before any write; (1) when the pack has `tsconfig.json`, run `tsc --noEmit` and
attribute errors to individual `export default` entry files (shared non-entry
errors fail all entries in that pack); (2) esbuild only entries that passed
typecheck, to stable `<pack>/<entry>.mjs`. One pack or one entry failing does
not block siblings. Failures write `COMPILATION_ERRORS.md` in the pack and
surface on `customPalette.snapshot` (`partial` when some nodes still loaded).

**Host peer types for `tsc`:** resolve `@langflower/node-sdk`, `rxjs`, and
`@rx-evo/stateful-observable` from the **compiler’s install tree**
(`import.meta.resolve` + package.json `types` / `exports.types`), not via a
`.js` → sibling `.d.ts` guess and not from the user project’s `node_modules`.
`@types/node` is a compiler dependency so `typeRoots` works under
`npm i -g langflower` when the project folder has no `node_modules`. Peer-only
packs therefore typecheck without a pack-local `npm install`; author
`dependencies` still require pack `node_modules`.

**Host peer runtime for load:** the same peers stay **external** in the esbuild
artifact (shared module identity with the host), but bare specifiers are
rewritten to absolute `file://` URLs resolved from the compiler install tree.
Native `import()` of a unique temp copy of
`.langflower/.cache/nodes/<pack>/<entry>.mjs` therefore works in an empty
project with no project/`pack` `node_modules`. Each compile wipes that cache
directory so install upgrades and the rewrite policy cannot leave a stale
bundle on disk.

**Tradeoffs accepted:**

- (+) Fast rescans; one file to load for metadata (and later sandbox).
- (+) Handles user dependencies in one shot.
- (+) Pack `tsconfig.json` gates Update via `tsc --noEmit` before esbuild.
- (+) Peer-only packs work with global Langflower and an empty project tree
  (typecheck **and** runtime load).
- (−) Wipe-then-rewrite of the same path; compile fails if the cache dir cannot
  be deleted (e.g. Windows file lock).
- (−) Shared (non-entry) type errors fail every entry in that pack.
- (−) Cache `.mjs` embeds absolute host paths (local machine / install layout).

**Consequences:**

- Compiler returns definitions for palette + runtime merge; server only composes.
- Do not revive `node-compile/` / TS-API signature inference.
- Sandboxed execution of arbitrary custom code remains deferred ([TBD-001](TBD.md)).

---

## ADR-008 — Persisted workflow ↔ ngDiagram boundary

**Status:** accepted · **Date:** 2026-06-16 · **Updated:** 2026-07-22

**Context:** The server session owns the persisted Langflower workflow shape;
ngDiagram owns an imperative interactive model whose node/edge representation
differs at real vendor boundaries (notably tuple ports versus prefixed handle
ids). Mirroring the domain graph in a client store created extra writers and
resynchronization paths.

**Alternatives considered:**

- **Persist ngDiagram model JSON directly** — couples storage to a vendor
  schema and forces migrations when the canvas library changes.
- **Client WorkflowStore plus bidirectional mapper** — duplicates authoritative
  bridge state and makes every canvas edit a two-store synchronization problem.
- **Use only the persisted shape inside ngDiagram** — conflicts with the host
  APIs that require vendor node/edge objects.

**Decision:**

- `LangflowerBridgeClient` is the UI domain source of truth.
- `workflow.current.snapshot` initializes the canvas; subsequent `editor.*`
  facts update the live `NgDiagramModelService`.
- `bridge-diagram.service.ts` contains one-way persisted-shape → ngDiagram
  conversions only where the vendor shape genuinely differs.
- Feature components derive presentation such as resolved port rows from the
  live diagram signals. There is no client `WorkflowStore`, reverse graph
  mapper, or cached domain mirror.
- User edits return as typed bridge intents; the server session updates the
  authoritative workflow document and broadcasts facts/snapshots.

**Tradeoffs accepted:**

- (+) Persistence remains independent of ngDiagram.
- (+) Domain state has one bridge/session owner; canvas-local state stays with
  the canvas.
- (+) Derived presentation cannot drift through a second synchronization
  pipeline.
- (−) The imperative host boundary still needs small, tested conversions and
  lifecycle subscriptions.

**Consequences:**

- Never write raw ngDiagram JSON to workflows.
- Do not add a reverse mapper or WorkflowStore-like bridge cache.
- Keep persisted → vendor conversions pure; keep model mutation at the
  ngDiagram host edge.

**Addendum (2026-07-11) — the predicted mapper risk materialized twice; both
fixed by removing the extra type/adapter instead of patching it:**

1. **Mirrored edge type.** `WorkflowEdgePersisted` duplicated `RuntimeEdge`
   (same edge data, different field names/shape:
   `source`/`sourceHandle` string vs `fromNodeId`/`fromPort` tuple), requiring
   an encode/decode adapter (string handle splitting) at every boundary that
   touched edges. Per [PRINCIPLES.md § No adapters, no glue
   code](PRINCIPLES.md#no-adapters-no-glue-code), the fix was **not** a better
   adapter — it was deleting `WorkflowEdgePersisted` and using `RuntimeEdge`
   directly everywhere (runtime, server, UI), leaving only the genuinely
   necessary `RuntimeEdge → ng-diagram Edge` conversion
   (`persistedEdgeToDiagram`), which is a real shape change (tuple ports →
   prefixed string port ids), not a mirrored duplicate.
2. **Cached, adapter-synced derived port data.** `LfNodeData` cached resolved
   multi-input/bypass port rows (`ports`, `lookups`) as if they were part of
   persisted node data. Keeping that cache in sync with live edge add/remove
   required a second adapter — `buildDynamicPortUpdates` in
   `bridge-diagram.service.ts` (~300 lines) — patching `data.ports` in place
   on every `editor.addEdges`/`editor.deleteEdges` delta. That adapter read
   from the **live** diagram edges, while an unrelated code path
   (`editor.updateNodes` → `persistedNodeToDiagram`) rebuilt the same cached
   field from a **different, frozen** source (`graphInput().edges`, an
   init-only snapshot — see `docs/NG_DIAGRAM.md`). Two divergent sources
   feeding one cached field meant any node-level update silently reverted the
   adapter's work — [`BUG-2026-07-11`](FOUND_BUGS.md) introduced the adapter,
   [`BUG-2026-07-11c`](FOUND_BUGS.md) is the adapter's own staleness bug.
   Fixed by deleting the cache and the adapter: `LfNodeComponent` now derives
   `inputPortRows`/`bypassPortRows` as `computed()`s reading directly from the
   single live `NgDiagramModelService.edges()` signal — nothing on node `data`
   to keep in sync.

**Design flaw signal (generalizes beyond this ADR):** an adapter that exists
to keep a **cached/mirrored copy** of derived data in sync with a live source
is the same smell as a mirrored type — it adds a second place that can drift
from the source of truth. Prefer deriving directly from the live source
(here: an Angular `computed()` over `NgDiagramModelService.edges()`) over
caching the derived result and writing an adapter to keep the cache fresh.
Treat any new "resync ports/data after mutation X" pipeline as a design smell
requiring its own ADR justification, per PRINCIPLES.md.

---

## ADR-009 — Separate Angular tsconfig from composite base

**Status:** accepted · **Date:** 2026-06-16

**Context:** Node packages use TypeScript project references (`composite: true`) for
incremental builds; Angular application build does not emit declarations.

**Alternatives considered:**

- **Drop composite for entire monorepo** — simpler tsconfig, slower/inconsistent
  incremental builds for Node packages.
- **UI package not extending base tsconfig** — duplicates strict flags.

**Decision:** UI extends `tsconfig.base.json` but overrides `composite: false`,
`declaration: false`, `declarationMap: false`.

**Tradeoffs accepted:**

- (+) Node packages keep project references; UI keeps strict inherited options.
- (−) Two tsconfig "profiles" agents must know about (documented in `packages/ui/AGENTS.md`).
- (−) Accidentally removing override breaks `ng build` with TS6304.

**Consequences:**

- Verify `ng build` after any change to `tsconfig.base.json`.

---

## ADR-010 — Stage 1 without execution engine

**Status:** superseded · **Date:** 2026-06-16 · **Superseded by:** ADR-013 (demo
executor), then full reactive/batch runtime — see
[EXECUTION_ARCHITECTURE.md](EXECUTION_ARCHITECTURE.md)

**Context:** Spec splits visual editor + CRUD (Stage 1) from sandboxed execution
(Stage 2); partial execution risks wrong architecture locked in early.

**Alternatives considered:**

- **Minimal "run workflow" in Stage 1** — demo value, tempts one-off eval/in-process
  execution without sandbox.
- **Defer entire server** — UI-only mock; cannot validate real node registry or FS.

**Decision (historical):** Stage 1 stubs only: execute endpoint, WebSocket runs,
`execute()` calls.

**Tradeoffs accepted:**

- (+) Editor and persistence ship without blocking on sandbox design.
- (+) Forces explicit Stage 2 ADR for execution/isolation.
- (−) No end-to-end "run chain" demo until Stage 2.
- (−) Stubs must not grow into de facto executor.

**Consequences:**

- Obsolete as product framing — do not plan with Stage labels ([PRODUCT.md](PRODUCT.md)).
- Sandboxed **user-node** execution remains deferred; built-in execution is shipped.

---

## ADR-011 — Cross-platform build scripts (Node + bash)

**Status:** accepted · **Date:** 2026-06-16

**Context:** Agents and developers run on Windows without guaranteed bash; raw
`npm run -ws` output is hard to parse on failure.

**Alternatives considered:**

- **bash-only scripts** — fine on macOS/Linux, fails on Windows CMD/PowerShell.
- **npm scripts only, no wrapper** — no structured error summaries for agents.
- **Make / just / task runners** — extra install, less universal in Node ecosystem.

**Decision:** Node `.mjs` implementations with formatted errors; optional bash
wrappers; `build/tools/agent-run.mjs` for Windows.

**Tradeoffs accepted:**

- (+) One implementation (Node), multiple entrypoints.
- (+) Readable failure output for CI and agents.
- (−) Duplication of entrypoint names (`.sh` + `.mjs` + `agent-run.mjs`).
- (−) `npm run build` assumes bash on PATH where configured.

**Consequences:**

- Agents on Windows: prefer `node build/tools/agent-run.mjs <cmd>`.

---

## ADR-012 — Internal WebSocket bus; REST for bulk escape hatches

**Status:** accepted · **Date:** 2026-06-16 · **Updated:** 2026-06-24

**Context:** The backend emits many live facts (editor graph changes, palette
changes, execution telemetry, progress, errors). Polling or REST-for-everything does
not scale and duplicates connection overhead. Earlier attempts to keep separate DTO
contracts between runtime, server, and UI created adapter chains: one contract change
caused cascades through glue layers, and refactors tended to create even more
adapters.

**Alternatives considered:**

- **REST-only API** — simple, familiar; poor fit for high-volume server push and
  streaming execution events; encourages polling.
- **REST + SSE for push** — one-way push works; still two channels and no unified
  client/server event bus.
- **Stable DTO protocol separate from runtime** — cleaner public API boundary, but
  reintroduces drift and adapter maintenance for a local, co-versioned product.
- **WebSocket for every payload, regardless of size** — single pipe, but large
  payloads may still deserve HTTP/browser tooling.

**Decision:**

- UI opens **WebSocket on load** — primary transport for intents, queries,
  snapshots, and all server-initiated events.
- `packages/shared/src/langflower-bus-config.ts` is the canonical internal bus
  registry. It owns route names, payload types, and default transport (`/ws`, port
  `4010`) so client and server share one source of truth.
- Runtime APIs are allowed to define protocol payloads directly via `Parameters<>`
  / `ReturnType<>`. This is intentional compile-time coupling: runtime contract
  changes should become visible to server/UI immediately instead of being hidden
  behind stale DTO adapters.
- No RPC envelope and no per-command `requestId` in the bus registry. Clients emit
  `*.requested` intents; the server emits `*.delta`, snapshots, telemetry, and
  lifecycle facts. The UI projects the authoritative event stream.
- **REST only** as a bulk escape hatch when payload size or tooling clearly justifies
  leaving the WebSocket bus.

**Tradeoffs accepted:**

- (+) Natural fit for execution logs, progress, and live registry updates.
- (+) Runtime/server/UI refactors fail fast at compile time instead of drifting
  through adapter layers.
- (+) Shared transport settings prevent client/server port/path mismatches.
- (+) RxJS-friendly: all facts arrive as Observables over one authoritative stream.
- (−) The bus is not a stable public WebSocket API; packages must be co-versioned.
- (−) Runtime method-shape changes can intentionally break UI/server compilation.
- (−) Route tables are object-merged; namespace prefixes must stay unique to avoid
  silent shadowing.

**Consequences:**

- Do not add DTO adapter layers for the bus unless the protocol becomes public or
  independently versioned; file a superseding ADR if that changes.
- Do not add REST routes for event-bus work without updating this ADR.
- `docs/ARCHITECTURE.md`, `spec.md` §3.1.1, and
  `packages/shared/src/langflower-bus-config.ts` describe the current bus model.
- Each partial route config owns a unique prefix (`editor.*`, `runner.*`,
  `session.*`, `palette.*`, `workflow.*`) before the final spread merge.

---

## ADR-013 — Demo executor for common nodes only

**Status:** superseded · **Date:** 2026-06-16 · **Supersedes:** part of ADR-010 ·
**Superseded by:** `@langflower/runtime` + common-nodes catalog execution
([EXECUTION_ARCHITECTURE.md](EXECUTION_ARCHITECTURE.md))

**Context:** Stage 1 defers full sandboxed execution (ADR-010), but the runnable demo
requires **Run** on built-in common nodes. A narrow in-process executor unblocked the
demo without esbuild import of user bundles at runtime.

**Alternatives considered:**

- **Defer Run until Stage 2** — demo Definition of Done cannot be met.
- **Full sandbox now** — too large for demo milestone; conflicts with ADR-010 timeline.
- **eval / dynamic import of user nodes** — rejected on security and complexity grounds.

**Decision (historical):** in-process executor for registered common nodes only;
user/custom node types rejected.

**Tradeoffs accepted:**

- (+) Demo milestone without Stage 2 sandbox.
- (+) Same port/input model as later runtime.
- (−) Not a security boundary for user nodes.
- (−) Partial ADR-010 exception.

**Consequences:**

- Historical path names under `workflow-executor` may differ; current entry is the
  runtime session / bridge. User-node sandbox still deferred ([STATUS.md](STATUS.md)).
- Load-path split for built-in vs custom: [ADR-020](#adr-020--built-in-vs-custom-node-loading).

---

## ADR-014 — Project-root harness I/O

**Status:** accepted · **Date:** 2026-06-17

**Context:** Stage 1 server services (workflow CRUD, config, node bundler cache) write
only under `<project>/.langflower/`. The common-nodes program requires harness tools
(Read File, Write File, Grep, Bash) that operate on the **user project tree** (parent
of `.langflower/`). Flowise-style path-traversal CVEs require explicit sandboxing.

**Alternatives considered:**

- **Keep all I/O under `.langflower/`** — blocks real agent workflows (read/edit source).
- **Unrestricted fs in node execute** — rejected on security grounds.
- **Separate worker process now** — deferred to Stage 2+ sandbox; too large for demo.

**Decision:** Harness handlers resolve every user path via `resolveProjectPath`
(project root + deny list). Generic services remain `.langflower/`-only. Builtin
tool bodies live in `@langflower/tools` (`packages/tools/`); the server injects a
bound harness through `ExecutionContext.harness` — not direct `fs` in nodes or
`@langflower/shared`.

**Tradeoffs accepted:**

- (+) Enables Plan/Coder agent presets without rewriting server layout.
- (+) Centralized deny list and permission checks before file/shell/web calls.
- (−) Two filesystem boundaries to document and test (`.langflower/` vs project root).
- (−) Symlink escape and SSRF need ongoing hardening as harness nodes land.

**Consequences:**

- `@langflower/tools` — path fence, builtin handlers, read-class `postProcess`,
  SSRF `webFetch`, crawl persist, KB store, MCP stdio runtime (structural
  factories; no dependency on `shared` / `node-sdk`).
- Server `buildExecutionContext` is a thin composer: credentials + WS HITL
  hooks → inject `ExecutionContext` fields.
- Shared nodes call `ctx.harness` / `ctx.kb` / `ctx.crawl` only.
- OpenAI unbound adapters live in `@langflower/common-nodes` (`ai/openai/`);
  server only binds secrets.
- Revisit when sandboxed user-node execution (ADR-010 Stage 2) supersedes in-process model.

**Extension (2026-07-19, epic 11):** `langflower.jsonc` may set
`harness.allowedRoots: string[]` — absolute (preferred) or project-relative
directories trusted **outside** the Langflower project root (typical: Obsidian
vault). `resolveProjectPath` / `resolveFenceRoot` accept paths under those
roots; deny-path globs still apply inside each fence. Empty/missing
`allowedRoots` preserves the original project-root-only default. Not a blanket
escape hatch — each vault path must be listed explicitly.

**Extension (2026-07-19, thin server):** Domain implementations moved out of
`packages/server/src/{crawl,kb,mcp,llm}/` into `@langflower/tools` (project
runtime I/O) and `common-nodes/ai/openai/` (provider adapters).

**Extension (2026-07-20, ADR-019):** Domain pack invocation is **not** a
second harness `toolId` registry. Invokers ship as configs from
`@langflower/tools/domain-tool-configs` and become `ToolHandle.invoke`; see
[ADR-019](#adr-019--toolhandle-invocation-not-harness-toolid-registry).

---

## ADR-015 — Output-driven run completion, never idle settle

**Status:** accepted · **Date:** 2026-06-18 · **Updated:** 2026-07-22

**Context:** Reactive ports may pause, stream repeatedly, or wait indefinitely
for human feedback. “Nothing emitted recently” is not a stable completion
signal. Earlier idle/settle heuristics raced with streaming output and feedback
turns.

**Alternatives considered:**

- **Idle/settle heuristics** — timers, pass counts, or pending-state guesses;
  rejected because they cannot distinguish waiting from completion.
- **Special-case interactive graph classification** — keeps selected HITL
  topologies alive but makes completion depend on catalog types and graph-shape
  recognition.
- **Explicit output-driven lifecycle (chosen)** — completion is a graph/runtime
  fact, not inferred inactivity.

**Decision:**

1. `RuntimeRunner` wires a run scope and leaves it `running`; port inactivity
   does not complete the run.
2. The first watched output from a node with `stopsRun: true` emits runner
   `done` and returns status to `idle`. Starting an empty graph also completes
   immediately.
3. `RuntimeRunner.completeRun()` is an explicit fallback for an active run that
   cannot reach its finish output (for example after an upstream failure).
   `RuntimeRunner.interrupt('cancel')` is the explicit external stop: it tears
   down an active run and sets status to `stopped`; when no run is active it is
   a runtime no-op.
4. There is no feedback-loop classifier or separate HITL completion engine.
   Interactive graphs normally omit a finish path and remain running between
   turns. One-shot graphs include an explicit `common-finish` sink.
5. Runtime events carry `runId`; UI folds scope lifecycle facts to the current
   run.

**Tradeoffs accepted:**

- (+) Completion is deterministic and independent of stream timing.
- (+) The same lifecycle applies to one-shot, streaming, and HITL graphs.
- (+) No catalog-specific graph classifier in the runtime.
- (−) A graph without a demanded `stopsRun` output remains locked until Stop.
- (−) Authors must make intended completion visible in graph topology.

**Consequences:**

- Runtime contract: `packages/runtime/src/runtime-runner.ts` and `types.ts`.
- Finish node: `packages/common-nodes/src/output/finish/node.ts`.
- Bridge lifecycle: `packages/server/src/bridge/wire-runner-handlers.ts` and
  `forward-runner-event.ts`.
- UI projection: `packages/ui/src/app/services/execution-run-gate-fold.ts`.
- See [EXECUTION_ARCHITECTURE](EXECUTION_ARCHITECTURE.md).

**Revisit trigger:** A future first-class conversation-complete signal may map
to a `stopsRun` output; it must not restore idle heuristics.

---

## ADR-016 — LLM session: init vs feedback turns

**Status:** accepted · **Date:** 2026-07-19

**Context:** HOW_TO locked optional ports to `defaultValue` (runtime seeds when
unwired — not `startWith` in `bind`). Soft↔Hard debate graphs wired
`feedback` into the same `combineInputs` as `userPrompt`; wired slots skip
`applyPortDefaults`, so Soft waited forever for Hard (BUG-2026-07-19). Product
needs an agent-style session: init context, feedback as later turns with
conversation history on the real OpenAI node.

**Alternatives considered:**

- **Runtime `primeWhenWired` on all `defaultValue`s** — rejected: priming wired
  `tools` with `[]` then the real list double-fires LLM cycles.
- **`take(1)` freeze on init** — rejected: must never ignore init input changes;
  tools/prompt/skill changes are intentional and recreate the session.
- **Shared `agent-session` module** — rejected: keep provider nodes co-located;
  future APIs may diverge.
- **Restore `startWith` on every optional port** — rejected: undoes the
  `defaultValue` contract for inventory ports.
  **Decision:**

1. **Init ports** (`userPrompt`, `systemPrompt`, `tools`, `mcp`, `ctx`):
   `combineInputs` + `defaultValue` only. Any new init emission
   **`switchMap`s** a new session (empty history).
2. **`feedback` is not an init peer.** Prime turn 0 with `startWith('')`, then
   use the shared `runLlmSessionMachine` `mergeScan(..., 1)` fold so feedback
   arriving mid-turn is queued while history/counters remain immutable owned
   state.
3. **`startWith` carve-out is only for that feedback turn stream** — never on
   `tools` / `mcp` / other init peers.
4. **`common-openai-llm` / Critique / Review** share LLM-summary context
   compaction (`prepareChatCompletion`): approx token budget from Inspector
   `contextSize`, optional `compactOnError` pre-stream retry, and
   `historySync` so session history stays truncated.
5. **`common-fake-llm`** imitates streaming for users/demos with the same
   init/feedback split, but is **not** a mechanics test twin (no history oracle)
   and does **not** expose compaction params.
6. **Storm caps ask HITL continue:** when `maxFeedbackTurns` or agent
   `maxIterations` is exhausted, emit a `toolLog` and
   `runner.permission.ask` (`agent.maxFeedbackTurns` /
   `agent.maxIterations`). **Allow** resets the counter for another full
   configured budget; **Deny** (or missing ask hook) keeps the prior stop —
   `maxFeedbackTurns` → `toolLog` + **error** the cycle; agent
   `maxIterations` → soft-complete response. Must not `EMPTY`-drop further
   feedback. No fake success values to clear loading
   ([LLM_NODES.md](LLM_NODES.md) § Port events). Review/Critique
   `maxIterations` stay fail-closed (no continue ask).
7. Every turn uses the shared `runLlmLoop` `expand` machine. Recoverable
   provider idle/5xx/network failures retry from a committed checkpoint and
   suspend for Steer after the retry budget; they do not error the session
   Observable. Fatal authentication/configuration/protocol failures do.

**Tradeoffs accepted:**

- (+) Soft↔Hard and HITL feedback loops can start without runtime priming hacks.
- (+) Reviewers keep a bright line: no `startWith([])` on `tools` / `mcp`.
- (+) Init changes intentionally discard conversation state.
- (+) Cap / policy stops are visible in feed + port chrome (not a “dead” canvas).
- (−) Authors must learn two layers (init vs turn); HOW_TO must stay explicit.
- (−) Compaction uses approx tokens (`JSON length / 4`) and may still need
  `compactOnError` when the server window is smaller than `contextSize`.

**Consequences:**

- `packages/common-nodes/src/ai/nodes/openai-llm/node.ts` — session + history.
- `packages/common-nodes/src/ai/nodes/fake-llm/node.ts` — minimal split for demos.
- `packages/common-nodes/src/ai/features/llm-session/llm-session-shell.ts` — shared
  `createLlmSessionCycle$` for **all** LLM nodes (openai / fake / critique /
  review); `maxFeedbackTurns` → continue HITL then Deny → `toolLog` + stream
  error; path-choice turn drivers use `primeTurn0: false` + `historySync`
  chunks.
- `packages/common-nodes/src/ai/features/openai/prepare-chat-completion.ts` —
  shared pre-stream compaction runner for both tool loops.
- `packages/common-nodes/src/ai/nodes/critique/node.ts` /
  `review/node.ts` — must not invent a second history mechanism.
- [HOW_TO_WRITE_REACTIVE_NODES.md](HOW_TO_WRITE_REACTIVE_NODES.md) — init vs
  turns; feedback `startWith` carve-out; no fake events / no silent refusals.
- [LLM_NODES.md](LLM_NODES.md) — unified session table.
- FOUND_BUGS BUG-2026-07-19 → fixed.

**Revisit trigger:** Tokenizer-accurate budgets; a second provider node that
cannot share openai’s message shape (still co-located).

---

## ADR-017 — Canvas multiline: node flex fill, not textarea self-resize

**Status:** accepted · **Date:** 2026-07-19

**Context:** Native `resize: vertical` on canvas `text-multiline` grew the
field without growing the ng-diagram node box, so content overflowed and
wires did not remeasure. Per-field height persistence (`ui.inlineHeights` +
ResizeObserver → `resizeNode`) would fix that but couples layout to every
keystroke/grip drag and adds tab/reload sync surface. Node SE resize already
persists node height; authors need a way to say which prompt fields absorb
extra height.

**Alternatives considered:**

- **A — Textarea grip + `ui.inlineHeights`** — grow the node from each field’s
  measured height; persist per-port heights. Rejected for now: high cost
  (measure → `resizeNode` → invalidate → save/load/tab sync) and fights
  content-auto vs width-locked sizing modes.
- **B — No grip; equal CSS flex on every multiline** — cheap, but authors
  cannot weight `systemPrompt` vs `userPrompt` or opt a field out of grow.
- **B+ (chosen)** — No grip; extend `InlineConfig` with object
  `{ type: 'text-multiline', flex?, minHeightPx? }`. Shorthand
  `'text-multiline'` means `flex: 1`, min height 100px. Canvas port rows with
  `flex > 0` share leftover node height; only node height is persisted.

**Decision:**

1. **Canvas** multiline textareas use `resize: none`, min height 100px
   (override via `minHeightPx`), overflow scrolls (`.lf-scroll`).
   **Inspector** (no `fill`) allows ephemeral `resize: vertical` without
   height persistence.
2. `resolveMultilineInlineLayout` maps shorthand/object forms; canvas
   `lf-node-port-row` applies `--grow` + `fill` only when `flex > 0`.
3. Do **not** persist per-field inline heights; SE resize / row-count height
   re-fit remain the sole height writers.

**Tradeoffs accepted:**

- (+) No grip/node desync; wires stay aligned with the diagram node box.
- (+) Authors control grow weights without UI persistence schema changes.
- (+) Inspector (no `fill`) allows ephemeral `resize: vertical` — safe
  outside the node box; height is not persisted.
- (−) Users cannot drag an individual canvas prompt taller than the node
  without resizing the node.
- (−) Unequal prompt importance needs an explicit `flex` on the node
  definition (defaults are equal for shorthand).

**Consequences:**

- `packages/node-sdk/.../io-helpers.ts` — `InlineTextMultilineConfig`,
  `resolveMultilineInlineLayout`.
- `packages/ui` — `lf-inline-field` / `lf-node-port-row` / `node-port-layout.css`.
- Docs: [UI 01](DONE/UI/01-resizable-prompt-textareas.md) acceptance reversed;
  [DIAGRAM_CANVAS.md](../packages/ui/docs/DIAGRAM_CANVAS.md) § Node sizing.

**Revisit trigger:** Product requires independent per-prompt grip heights that
must survive reload without enlarging the whole node (reconsider approach A).

---

## ADR-018 — Durable workflow checkpoints

**Status:** accepted · **Date:** 2026-07-19 · **Amended:** 2026-07-21
(decision D)

**Context:** Long multi-stage jobs must survive Stop and process restart without
replaying finished stages. In-memory `eventLog` / WebSocket session state dies
with the process. Epic 14 landed a store + `RuntimeRunner.resume` overlay, but
**auto persist on every completed node / Stop** produced confusing Continue UX
on trivial graphs. Product direction: **explicit** checkpoint boundaries and a
**checkpoint picker**.

**Alternatives considered:**

- **A — Persist only the feed event log and replay on reconnect** — restores UI
  chrome, but does not skip completed nodes or seed downstream after restart.
- **B — Reuse `startNode` weakly-connected cluster as “Continue”** — wrong
  scope (not directional resume) and re-runs completed upstream.
- **C — Auto durable checkpoint on every completed node + Stop** _(landed, then
  rejected)_ — store + resume overlay work, but Continue appears without
  author intent.
- **D — Explicit checkpoint node / port flag + picker UX** — author places
  boundaries; operator chooses which checkpoint to continue from.

**Decision (D — accepted):**

1. Keep path/schema/resume overlay from C:
   `.langflower/runs/<workflowId>/<runId>/checkpoint.json`;
   `schemaVersion: 1` + `workflowFingerprint`; JSON-safe values only;
   `RuntimeRunner.resume` skip + snapshot replay.
2. **Persist only at explicit boundaries** — when an output with
   `createCheckpoint: true` emits (primary authoring: `common-checkpoint`
   passthrough node; advanced escape: the same flag on any output meta).
   Optional human-readable `label` from node `inputs.label`, else
   `checkpointLabel` meta, else canvas `ui.label`.
3. **Stop without a prior boundary does not write** a resumable checkpoint.
   Stop/complete after a boundary updates the existing run snapshot
   (`stopped` / `completed`).
4. **Picker UX** — on load, `runner.checkpoints.snapshot` lists labeled
   summaries (time, status, label, stale/corrupt). Operator Continues from a
   chosen entry, Discards, or Runs fresh — not latest-only Continue.
5. Fingerprint mismatch → summary `stale: true`; resume →
   `runner.resume.failed` (`STALE_WORKFLOW`) + Discard. Corrupt → same with
   `CORRUPT`.
6. WS channels: `runner.resume.*`, `runner.checkpoints.snapshot`,
   `runner.checkpointed`, `runner.checkpoint.discard.requested`.
7. Auto every-node / every-Stop persist (alternative C) remains rejected.

**Tradeoffs accepted:**

- (+) Author-visible boundaries; no surprise Continue on short runs.
- (+) Multi-entry picker; labeled history per workflow.
- (−) One checkpoint file per run (latest boundary for that run); picking
  among boundaries inside one continuous run is not a separate history yet.
- (−) HITL / Memory still out of payload.

**Consequences:**

- Server: `RunCheckpointSession` accumulates always; persists on boundary /
  post-boundary Stop; bootstrap and workflow-load broadcast resumable lists.
- UI: `lf-continue-button` is a checkpoint picker.
- Demo `checkpoint-resume` + integration
  `execute-checkpoint-resume.ws.test.ts` exercise the explicit contract.
- Use-case
  [resumable-checkpoint-jobs](use-cases/resumable-checkpoint-jobs.md)
  Implementable-bar under explicit boundaries (Status flip owned by
  orchestrator).

**Revisit trigger:** Multi-boundary history within one run, or durable HITL /
Memory in the same checkpoint payload.

---

## ADR-019 — ToolHandle invocation, not harness toolId registry

**Status:** accepted · **Date:** 2026-07-20

**Context:** Domain packs (crawl / KB / Memory) were advertised on
`tool-handle` wires by `toolId` only, then invoked through a hidden
`domainHandlers[toolId]` map inside `harness.invoke`. That implies a closed
registry: custom nodes cannot define callable tools without growing the map.
`toolId` must remain only the LLM function name.

**Alternatives considered:**

- **A — Keep harness toolId → handler map** — simple for built-in packs, but
  custom / third-party registration nodes cannot attach invoke without server
  changes. Rejected.
- **B — Graph ports for every tool call** — conflicts with Option 3 (internal
  tool loop). Rejected.
- **C (chosen) — Emit callable `ToolHandle`s** — packs import configs from
  `@langflower/tools`; the loop calls `handle.invoke(args, toolCtx)`. The
  server wraps permitted builtins with an invoker that closes over
  `harness.invoke`.

**Decision:**

1. `ToolHandle.invoke` carries invoke for pack/custom tools.
   `defineToolRegistrations` emits one handle per configured tool.
2. `@langflower/tools/domain-tool-configs` exports
   `CRAWL_TOOL_CONFIGS` / `KB_TOOL_CONFIGS` / `MEMORY_TOOL_CONFIGS`.
3. `common-nodes` may depend on `@langflower/tools` for those configs only;
   runtime facades still come from `ExecutionContext` / `ToolHandlerContext`.
4. `createProjectHarness.invoke` handles **builtins only**; the server turns
   permitted builtins into `ToolHandle`s (`EC.toolHandles`, filtered by
   `enabledToolIds`) before seeding. Wired packs arrive on port `tools`.
   Agent merges EC ∪ port and invokes only `handle.invoke` — no
   `kind: 'harness'` and no agent-side catalog list.
5. Same dual-ingress pattern as MCP: permanent EC ∪ port, not a deferred seed
   into the port.

**Tradeoffs accepted:**

- (+) Extensible: any node can emit a callable registration without a registry.
- (+) No hidden invoke lookup; wire payload is the source of truth.
- (−) `common-nodes` → `tools` dependency (handler wiring only).
- (−) Handlers on the wire are not JSON-serializable (runtime graph only).

**Consequences:**

- `node-factory/define-tool-registrations/`, `run-internal-tool-loop.ts`, Review
  inventory invoke, pack nodes under `common-nodes/{memory,crawl,kb}`.
- Docs: [MECHANICS](DONE/EPICS/MECHANICS-tool-execution.md),
  [HOW_TO_WRITE_REACTIVE_NODES.md](HOW_TO_WRITE_REACTIVE_NODES.md),
  [node-library.md](features/node-library.md) §11.3.

**Revisit trigger:** Need to persist/replay tool registrations across process
boundaries (handlers would need a stable id + reload contract).

---

## ADR-020 — Built-in vs custom node loading

**Status:** accepted · **Date:** 2026-07-20 · **Updated:** 2026-07-24

**Context:** Product requires one **authoring** contract so built-in nodes prove
the extension path for `.langflower/nodes/` packs ([PRODUCT.md](PRODUCT.md)).
Loading every built-in through the custom-node esbuild scan on each start would
hurt startup time. Pack layout: [ADR-030](#adr-030--custom-node-pack-layout--npm-model).

**Alternatives considered:**

- **Same bundler/scan path for built-ins and custom** — maximum parity; slower
  cold start; harder to ship a fixed catalog with the npm package.
- **Different authoring APIs** — faster shortcuts for built-ins; breaks the
  “write custom like built-in” guarantee.
- **Sandbox + scan everything including built-ins at runtime** — deferred with
  user-node sandbox ([TBD.md](TBD.md) TBD-001).

**Decision:**

- **Authoring:** built-ins (`@langflower/common-nodes`) and custom packs use the
  same SDK (`@langflower/node-sdk`). Default author path is **`defineNode`**;
  `defineReactiveNode` is advanced (RxJS / StatefulObservable).
- **Loading:** built-ins are imported from the published package into the
  palette/registry (no per-start bundler). Custom packs under
  `.langflower/nodes/<pack>/` are scanned and esbuild-bundled
  ([ADR-007](#adr-007--esbuild-for-custom-node-packages)) by
  `@langflower/compiler`, exposed on `customPalette.snapshot` (system catalog
  stays on `palette.snapshot`).

**Tradeoffs accepted:**

- (+) Fast startup; one mental model for writing nodes.
- (+) Custom path exercises the real extension surface.
- (−) Two load paths to keep in sync (registry shape, port metadata).
- (−) Sandboxed execution of arbitrary custom code still deferred.

**Consequences:**

- UI merges system `palette.snapshot` with `customPalette.snapshot` for canvas
  / execution lookups; the Custom section reads only `customPalette.snapshot`.
- Do not move built-ins onto the scan path “for purity” without a startup budget.
- Revisit when sandboxed user-node execution ships.

---

## ADR-021 — Sub-Agent: registration + port-routed spawn (nodeId filter)

**Status:** accepted · **Date:** 2026-07-20 · **Implementation:** partial
(L0 shipped: registration + spawn + `subagentResult` router; body on canvas;
serial spawn; nesting = graph wiring; depth caps later)

**Context:** Product wants main agents to **spawn** specialists with selected
skills while keeping Sub-Agents as **first-class canvas nodes** (transparent to
users and runtime). Nested workflow/subgraph runtime is far future. Runtime
today can extend **outputs** dynamically only for bypass ports — not a clean
per-target spawn fan-out from one LLM node. Hidden in-LLM spawn without graph
nodes violates MECHANICS C2/C8 and the hard-harness product story
([PRODUCT.md](PRODUCT.md)).

**Alternatives considered:**

- **In-LLM spawn only (OpenCode-style)** — model invents sub-agents; no canvas
  topology; skips QA/review stages; rejected for Langflower.
- **Nested workflow / subgraph runtime** — true isolation and reuse; deferred
  (far future).
- **Dynamic spawn outputs per Sub-Agent** — ideal routing; blocked until runtime
  output-extension exists beyond bypass ports.
- **Wire-only handoff (no spawn tool)** — author draws every task edge; main
  cannot choose skill/target at runtime; too weak for agent-driven delegate.
- **Keep map-collect Sub-Agent forever** — useful for fixed body wiring; does not
  expose registration/skills/spawn tool to the main LLM.

**Decision:**

1. **Sub-Agent is a separate node** (`common-sub-agent`, evolve in place).
   Inspector: **multiselect** of skills from `.langflower/skills/*.md`.
2. **Registration** — Sub-Agent emits `SubAgentRegistration` on `registration`
   (`wireType: subagent-registration`). Main LLM has a dedicated
   **`subagentRegistration`** input (**multi:combine**). This is **not**
   `ToolHandle` / not merged into `tools`.
3. **Spawn tool** — when that input is non-empty, the main LLM exposes an
   orchestrator control tool `spawn_subagent` (same class as Review
   `accept`/`feedback`). Calling it emits on a dedicated **`subagent`** output
   (`wireType: subagent-spawn`).
4. **Single spawn output** — one output fans out to Sub-Agent `task` inputs
   (same `subagent-spawn` wire). Payload: `{ callId, nodeId, skillId, task }`.
   Each Sub-Agent **ignores** tasks not addressed to its `nodeId`.
5. **Result** — Sub-Agent emits `{ callId, result }` on `result`
   (`wireType: subagent-result`) → main **`subagentResult`** (**multi:merge**).
   The agent node’s **internal router** correlates `callId` and injects a tool
   result into the turn. ≠ `feedback`. Do **not** use generic `json` for these
   peer contracts — named wires keep RuntimeEditor connection checks useful.
6. **In-node chat** — Sub-Agent runs the same OpenAI-compatible tool loop /
   session cycle as `common-openai-llm` (own `providerId` / `model` /
   compaction). Parent contract remains `registration` / `task` / `result`.
   Nesting = wire further registrations into any LLM/`subagentRegistration`
   inventory (graph-controlled). Body-on-canvas extras (`item` / `bodyResult`)
   are **retired**.
7. **Sequential skills / serial spawn** — skills on one Sub-Agent are sequential
   in the spawn copy; default spawn concurrency is **serial**
   ([ADR-022](#adr-022--sub-agent-layers-swarm-nested-monte-carlo)).
8. **Loop** remains the primitive for dynamic N≥2 map-collect bodies; Sub-Agent
   is the registration/spawn specialist path.

Wire consts for custom nodes:
`@langflower/common-nodes/ai/sub-agent-protocol`.

**Tradeoffs accepted:**

- (+) Canvas-visible specialists + agent-chosen spawn (hard harness topology).
- (+) Result is a normal tool result via internal router.
- (+) Works without nested workflows or dynamic outputs.
- (−) Broadcast + `nodeId` filter is coarser than true routed edges.
- (−) Miswired graphs can hang waiting for `subagentResult` (known L0 gap).
- (−) Authors must wire registration, spawn, and result ports correctly.

**Consequences:**

- Normative detail:
  [MECHANICS-tool-execution.md](DONE/EPICS/MECHANICS-tool-execution.md#sub-agent-registration--spawn-target).
- Product summary: [PRODUCT.md](PRODUCT.md#sub-agent-spawn-target).
- Evolve `packages/common-nodes/src/ai/nodes/sub-agent/` + LLM ports; update
  [NODE.md](../packages/common-nodes/src/ai/nodes/sub-agent/NODE.md).
- Revisit when runtime gains non-bypass dynamic outputs or nested workflows —
  may drop `nodeId` broadcast filter.
- Layered extensions (swarm concurrency, nested spawn, Monte Carlo via Loop):
  [ADR-022](#adr-022--sub-agent-layers-swarm-nested-monte-carlo).

---

## ADR-022 — Sub-Agent layers: swarm, nested, Monte Carlo

**Status:** accepted (partial) · **Date:** 2026-07-20 · **Depends on:**
[ADR-021](#adr-021--sub-agent-registration--port-routed-spawn-nodeid-filter)

**Context:** After locking registration + port-routed spawn (ADR-021), we need a
clear extension ladder for **agent swarm**, **nested subagents**, and
**Monte Carlo–style** repeated trials — without a second spawn system or
hidden in-LLM managers. Local LLM hardware is often the bottleneck, so default
parallelism must stay conservative.

**Alternatives considered:**

- **Parallel-by-default swarm** — better for cloud multi-key setups; wastes
  little on a single local GPU/CPU where N streams share one bottleneck.
- **Nested workflow files for nesting** — true isolation; far future (ADR-021).
- **Cross-model bake-off as N Sub-Agents** — same task, own provider/model each
  (locked below); not Loop Monte Carlo.
- **Separate spawn runtime for Monte Carlo** — duplicates Loop; rejected.

**Decision (locked):**

| Layer  | Name                     | Rule                                                                                                                                                                                                                                                      |
| ------ | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **L0** | ADR-021                  | Registration + spawn out + `nodeId` filter + `subagentResult` → tool result; skills sequential per Sub-Agent node                                                                                                                                         |
| **L1** | Swarm                    | Multiple Sub-Agent nodes → one main registration inventory. Default spawn concurrency: **serial** (one outstanding spawn). Opt-in **`parallel-by-nodeId`** later, **low priority** (cloud). Reason: local LLM HW bound. Add `callId` when parallel lands. |
| **L2** | Nested                   | Any LLM with a wired registration input may spawn (same ports recursively). Nesting is call ownership on a **flat** canvas, not a subgraph file. Depth cap TBD at implement time.                                                                         |
| **L3** | Monte Carlo (same model) | Prefer **Loop** + trial envelope (`trialId` / `seed` in payload) + reduce/score on the graph. Same specialist template; dynamic N without cloning nodes.                                                                                                  |
| **L∞** | Nested workflow file     | Far future (unchanged).                                                                                                                                                                                                                                   |

**Implementation order (guidance):** L0 → L1 (`serial` only first) → L3 trial
fields on Loop path → L2 depth enforcement → L∞.

**Cross-model bake-off (locked)**

**Status:** accepted · **Date:** 2026-07-23

**Decision:** run the **same task** on **separate models/providers** by placing
**N Sub-Agent nodes** on the canvas — each with its own `providerId` / `model` /
`contextSize` / compaction. Parent registers all of them and spawns as needed.
Do **not** invent a second topology (`Loop.items` of `{ provider, model }`) for
model compare; Loop remains the same-model Monte Carlo (L3) path.

**Pending decision — cross-model ensemble**

**Status:** superseded by bake-off lock above (kept for history of open questions).

**Intent (was parked):** run the **same task** on **separate models/providers**
(bake-off / ensemble), not only N× same-model seed trials.

**Former open questions (resolved by N Sub-Agents):**

- Variation axis: models only vs trials × models matrix.
- Topology: `Loop.items` of `{ provider, model }` vs one Sub-Agent/LLM node per
  model on the canvas vs hybrid.
- Who sets the model set / N: author-only vs orchestrator tool vs both with caps.

Classic same-model Monte Carlo via Loop (L3) remains the planned repeated-trial
path.

**Tradeoffs accepted:**

- (+) One spawn contract scales to swarm/nested/MC without new mythologies.
- (+) Serial default matches local LLM reality; cloud parallel stays optional.
- (−) True parallel swarm waits for opt-in + `callId`.
- (−) Bake-off is author-wired N Sub-Agents (no auto ensemble reduce yet).

**Consequences:**

- [MECHANICS](DONE/EPICS/MECHANICS-tool-execution.md#sub-agent-layers-swarm-nested-monte-carlo)
  mirrors this ladder.
- [PRODUCT.md](PRODUCT.md#sub-agent-spawn-target) summarizes layers + bake-off.
- Revisit ensemble **reduce/score** UX when a concrete use case needs automatic
  cross-model merge (topology stays N Sub-Agents).

---

## ADR-023 — Palette `paletteSecondary` → collapsed **Advanced**

**Status:** accepted · **Date:** 2026-07-21

**Context:** The shipped common-node catalog (~45 types) made the left palette
noisy: dual-surface domains (KB / Crawl / Memory) list both **tool registration
packs** (`*-tools` → LLM `tools`) and **graph I/O** nodes that call the same
capabilities on canvas ports. Authors almost always want packs for agent
workflows ([MECHANICS C5](DONE/EPICS/MECHANICS-tool-execution.md) — avoid
canvas noise for high-rate tool calls). Less-common Flow nodes (`Loop`,
`Checkpoint`) and KB curation / Obsidian helpers added more vertical bulk.
All Level-2 categories used to expand on first `palette.snapshot`, so nothing
fit on screen.

**Alternatives considered:**

1. **Nested “Graph I/O” (or similar) under each domain category** — e.g. Crawl
   Tools visible, then a second collapse inside Crawl for Fetch/Crawl/….  
   **Rejected:** third UI level next to the pack; registration and secondary
   share one category header; label “Graph I/O” is too domain-specific for
   Flow/curation later.
2. **Collapse whole primary categories** (Crawl / Memory / KB by default) —  
   **Rejected:** hides packs and other primary nodes the user still needs
   first; does not encode dual-surface priority.
3. **Hide secondary from the palette** (search / “show advanced” only) —  
   **Rejected:** breaks discoverability and demo graphs that still use graph
   I/O (crawl-research, kb-contradiction, checkpoints).
4. **Delete graph I/O / dual-surface nodes** (packs only) —  
   **Rejected:** hard-harness and UC paths need port-typed contracts (MECHANICS
   C3); catalog already ships both surfaces.
5. **Rename node `category` metadata to `Advanced`** for secondary types —  
   **Rejected:** loses domain affinity in NODE.md / STATUS / docs; UI can
   regroup without rewriting author metadata.
6. **Flat Advanced list** (no domain subgroups inside Advanced) —  
   **Deferred then rejected for v1 UX:** too mixed when opening Advanced;
   authors asked for the same category split as primary **inside** Advanced.
7. **Per-domain sibling categories** (`Crawl · Advanced`, …) —  
   **Deferred:** workable, but one shared **Advanced** Level-2 is simpler and
   uses a general name; revisit if Advanced grows too large to scan.
8. **Full port-preview cards in the palette list** —  
   **Rejected for density:** popover/`lf-palette-node-preview` stay for detail;
   list rows stay displayName + chrome border.

**Decision:**

- Add optional `paletteSecondary?: true` on
  `defineReactiveNode` / `ReactiveNodeDefinition` (flows into
  `PaletteNodeDefinition` via `toPaletteDefinition`).
- UI projection
  ([`palette-projection.ts`](../packages/ui/src/app/features/palette/types/palette-projection.ts)):
  non-secondary nodes stay under their `category`; secondary nodes collect
  into one Level-2 group **Advanced** (seed **collapsed**), subdivided by
  original `category` (subcats expanded by default once Advanced opens).
- Filter expands Advanced (and matching subcats) like other groups.
- Product marking (updated for palette clarity):
    - **Primary Tools:** MCP stdio/http, `common-memory-tools`,
      `common-crawl-tools`.
    - **Primary Flow:** Router only; other Flow nodes → Advanced.
    - **Logic:** entire category → Advanced (`paletteSecondary`).
    - **Crawl graph I/O** → Advanced (packs live under Tools).
- Chrome: compact category headers; bordered node rows (canvas-like); nested
  `pl-*` indent; collapse chevron on the **right**.

**Tradeoffs accepted:**

- (+) Packs and everyday Flow stay scannable; Advanced is one deliberate open.
- (+) Flag on the node (not a hardcoded UI allowlist) scales to future
  secondary types / orphans.
- (+) Domain `category` preserved for docs and Advanced sub-grouping.
- (−) Authors must know Advanced exists (filter still finds types by name).
- (−) One Advanced bucket mixes domains until opened (mitigated by subcats).
- (−) Marking which nodes are secondary is a product judgment; wrong marks
  hide useful nodes or re-noise primary.

**Consequences:**

- Docs: [node-library.md](features/node-library.md) §9; UI
  [`AGENTS.md`](../packages/ui/AGENTS.md) palette table.
- Implementation: `packages/node-sdk` flag;
  `packages/common-nodes` marks; `packages/ui` projection + sidebar.
- **Revisit if:** Advanced subcats still overflow; then consider per-domain
  Advanced siblings or persisted expand state. Revisit marking when harness
  palette FS/shell nodes ship (dual-surface again).

---

## ADR-024 — Dev MCP control plane over internal WS bus

**Status:** accepted · **Date:** 2026-07-21

**Context:** Cursor / coding agents in this monorepo need to observe and drive a
**already running** local Langflower instance (workflows, runner, HITL,
permissions) without hand-maintaining a parallel API. The UI already speaks the
internal WebSocket bus ([ADR-012](#adr-012--internal-websocket-bus-rest-for-bulk-escape-hatches)).
Outbound MCP in `@langflower/tools` is the opposite direction (workflow →
external tools) and must not be overloaded for this.

**Alternatives considered:**

- **Treat the raw WS bus as a public agent API** — rejected; ADR-012 keeps the
  bus internal and co-versioned; no stable external contract.
- **New REST control plane for agents** — rejected for MVP; duplicates bus
  intents and fights ADR-012’s “WS is default.”
- **Hand-listed MCP tools mirroring selected intents** — rejected; drifts from
  `langflowerWsConfig` on every bridge change.
- **Dev MCP stdio adapter over `createClient(langflowerWsConfig)`** — chosen:
  same client surface as UI/integration tests; tools derived from the bus
  registry via an exposure policy.

**Decision:**

- Ship `@langflower/mcp` — a **stdio MCP server** for Cursor (and similar hosts)
  that connects to `ws://127.0.0.1:<port>/ws` using `langflowerWsConfig`.
- **Source of truth** remains [`langflower-bus-config.ts`](../packages/shared/src/langflower-bus-config.ts).
  MCP tools for client→server intents are generated from registry keys filtered
  by an allowlist policy (`workflow.*`, `runner.*`; **not** `editor.*`).
  Adding/changing an allowlisted bridge intent auto-exposes a tool after rebuild
    - MCP restart (codegen for descriptions/schemas + runtime key reflection).
- Observe/wait helpers and thin curated tools (`wait_session_ready`,
  `wait_event`, feed tail) wrap the broadcast bus so calls feel RPC-like.
- Consumer is **dev agents in this repo**, not a product public API or hosted
  remote control ([TBD-003](TBD.md#tbd-003--hosted-multi-tenant-cloud-product)).
- Does not start/stop Langflower by default; agent or human runs
  `langflower start` / `npm run dev`. Same localhost / no-auth assumptions as
  ADR-006.
- Headless browser / screenshots stay out of this ADR
  ([TBD-006](TBD.md#tbd-006--headless-ui-access-for-agents)).

**Tradeoffs accepted:**

- (+) One contract with UI and integration tests; no REST/DTO fork.
- (+) Policy globs keep editor mutations out of agent reach by default.
- (+) Co-versioned with the monorepo — intentional compile/codegen coupling.
- (−) Not a stable public MCP product surface; hosts must use matching
  Langflower revision.
- (−) Broadcast bus has no per-command `requestId`; MCP correlates with
  field predicates where payload fields exist (see exit criteria).
- (−) MCP client has the same power as any local WS client on the machine.

**Consequences:**

- Implement under `packages/langflower-mcp/`; do **not** grow
  `packages/server/src/` with MCP-server domain logic (ADR-014).
- Wire Cursor via `.cursor/mcp.json`; document lifecycle in `AGENTS.md` and
  how-to [LANGFLOWER_MCP.md](LANGFLOWER_MCP.md) (prefer `verify` when a live
  instance is not needed; do not leave the server running unless asked).
- Expand `editor.*` exposure only by changing the policy allowlist (and ADR
  revisit), not by inventing a second catalog.
- **Exit criteria (closed 2026-07-22):**
    - **Feed:** `get_execution_feed_tail` is snapshot-canonical —
      last `executionFeed.snapshot.events` plus live appends of `eventLog`
      kinds only (`output-emitted` / `input-received` / `done`); progress
      status from runner gate (`runner.snapshot` / start / interrupt / done)
      via `deriveExecutionProgressStatus` — not a second ad-hoc feed model.
    - **Correlation:** field predicates (`resolveWaitPredicate`) are sufficient
      for single-agent / CI on one session. Empty-payload intents
      (`list` / `save` / `create` / `interrupt`) remain next-broadcast-wins.
      Bus-wide `requestId` is **won't-do for now** — revisit only if multiple
      agents share one live session and predicates cannot disambiguate.
- **Revisit if:** agents need LAN/remote access, auth tokens, a versioned
  public control plane separate from the internal bus, or multi-agent
  same-session races that predicates cannot cover.

---

## ADR-025 — Review Accept: wire artifact vs Work log decision

**Status:** pending (do not implement as product lock yet) · **Date:** 2026-07-22

**Context:** `common-review` finishes with private tools `accept` / `feedback`.
Graph wiring needs **Accept** to forward the reviewed artifact: today
`accept` → port `response` = **passthrough** of input `result` (e.g.
`critique.response → review.result`, `review.response → Finish`). Work log
bubbles use `feed.role: 'result'`, so that same passthrough appears as the
important bubble — identical to the upstream proposer packet. Tool `accept`
already allows optional `notes`; the loop parses them into
`{ kind: 'accept', notes }` and may log `→ accept(…)` on `toolLog`, but
**no result-facing port** emits those notes. Users reading adversarial /
review feeds see “input again,” not Accept vs Feedback as decisions.

**Symptom (not yet a chosen fix):** demo **Adversarial — agree then Review** —
Red-team Review / Review result bubbles repeat Claim/Defense after Agree.

**Alternatives considered (unresolved):**

1. **`response` feed `none` + new `acceptNotes` (or similar) feed `result`**
    - Wire unchanged (passthrough stays on `response`).
    - Bubble = `notes.trim()` or fallback `"Accepted"`.
    - Unwired decision port still emits via runtime empty-subscribe on
      terminal outputs.
    - (−) Extra catalog port; authors must learn wire vs feed split.
    - (−) Empty-notes fallback string is product copy, not model output.

2. **Change `response` wire value to notes / `"Accepted"`**
    - Feed and port align; no new port.
    - (−) Breaks every graph that treats `response` as the accepted
      artifact (adversarial, coding-agent, prompt-refining, …).
    - (−) Needs a second passthrough port anyway → same shape as (1) with
      a rename migration.

3. **UI-only upstream-echo suppression for Review `response`**
    - Hide bubble when text equals an earlier `result` section.
    - (−) Glue in feed-timeline; `accept.notes` still unused.
    - (−) False negatives when Accept notes equal the artifact; false
      positives if two agents legitimately emit identical text.

4. **Protocol `feed.displayValue` (or dual payload) separate from wire**
    - One port carries artifact for edges and decision text for feed.
    - (−) New feed/protocol surface across palette, fold, and docs.
    - (−) Easy to invent one-off display rules per node type.

5. **Structured `response` (e.g. `{ artifact, notes }`)**
    - Both concerns on one port.
    - (−) Breaks `string` wireType and all string-typed edges / Finish.
    - (−) Forces adapters at every consumer — rejected by default under
      [PRINCIPLES](PRINCIPLES.md) § No adapters.

6. **Hide Accept in feed; only `feedback` is `result`**
    - Removes duplicate Claim bubbles on Agree.
    - (−) Violates “show both accept and feedback” as decision outputs.
    - (−) Agree path looks like “node went quiet” unless Finish alone
      shows the artifact.

**Decision:** **Not locked.** Park until Accept feed UX vs wire contract is
chosen explicitly. Current shipped behaviour remains: `response` =
passthrough + `feed.role: 'result'`; `accept.notes` parsed but not
result-ported.

**Tradeoffs to settle before accepting:**

| Concern           | Tension                                                                                                                      |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Graph path choice | `response` must keep pulling/forwarding the artifact for demos and Review Gate–like wiring.                                  |
| Work log honesty  | Result bubble should read as Accept/Feedback **output**, not a replay of `result` input.                                     |
| `accept.notes`    | Optional today — either become first-class feed content, stay toolLog-only, or become required.                              |
| Port catalog      | New decision port vs rename/migration vs protocol display override.                                                          |
| Fallback copy     | Who authors `"Accepted"` / `"Agreed"` when notes are empty — product vs model.                                               |
| HITL parity       | Human Review Gate also passthroughs approve as `response` artifact; same feed echo class may need one rule for agent + HITL. |

**Consequences (while pending):**

- Do **not** ship `acceptNotes`, change `response` feed role, or add
  Review-specific echo hacks in UI until this ADR moves to `accepted` /
  `proposed` with a chosen alternative.
- Keep documenting today’s contract in
  [NODE.md](../packages/common-nodes/src/ai/nodes/review/NODE.md) /
  [LLM_NODES.md](LLM_NODES.md) (passthrough on accept).
- Revisit when locking adversarial / review Work log UX, or when
  `accept.notes` must be visible as a first-class decision.

**Related:** [feed-panel](features/feed-panel.md) ·
[adversarial-red-team](use-cases/adversarial-red-team.md) ·
[REACTIVE_NODES.md](REACTIVE_NODES.md) § Review · ADR-022 pending block
(same “parked until tradeoffs settle” pattern).

---

## ADR-026 — Unified `McpHandle` (system + wire; no harness MCP)

**Status:** accepted · **Date:** 2026-07-23

**Context:** Epic 16 wired MCP via id-only `mcp-server-config` +
`harness.listMcpRegistrations` / `wrapHarnessWithMcp`. Agents depended on
harness MCP API and could not receive a ready transport. Node-local MCP needed
the same consume path as project system servers.

**Alternatives considered:** Keep harness MCP invoke (rejected — dual protocol).
Drop jsonc system servers (rejected — authors still want project-wide MCP).
Inspector checklist for wired tools (rejected — remove the wire instead).

**Decision:** Both sources supply live **`McpHandle`** values; agents only consume
(inventory + handler invoke). Harness has **no** MCP API. Agent nodes never
receive MCP server config to expand, connect, or filter.

| Source                                        | Lifecycle                            | Agent ingress           | Gate                                                      |
| --------------------------------------------- | ------------------------------------ | ----------------------- | --------------------------------------------------------- |
| Wire (`common-mcp-stdio` / `common-mcp-http`) | MCP node                             | `mcp` port              | Wire only                                                 |
| Project (`langflower.jsonc` `mcp.servers`)    | Run spawn → per-node `EC.mcpHandles` | context (ready handles) | Server applies Inspector `enabledMcpIds` when building EC |

Agent merges `EC.mcpHandles` ∪ port `mcp` (two arrays — OK; permanent dual
ingress, not a temporary compromise). `enabledMcpIds` remains on agent `params`
(Inspector) but the agent bind does **not** use it. Each `McpHandle.tools` is
eager `ToolHandle[]` (no `listRegistrations`).

`mcp.servers.<id>` uses the **same connect fields** as the MCP nodes
(`kind: stdio|http`, shell `command` / `url`). No author `name`/`description`
(server name from `initialize`). No `allowlist`, no `command`+`args` shape, no
migration shims.

**Tradeoffs accepted:** (+) One protocol, fan-out 1→N, shell CLI for any
command. (−) Live handles are not JSON-serializable (ADR-019 class);
persist/replay of MCP sessions is out of scope.

**Consequences:** See [use-cases/node-local-mcp.md](use-cases/node-local-mcp.md),
[CONFIG.md](CONFIG.md) § MCP, `@langflower/tools/create-system-mcp-handles`.

---

## ADR-027 — Author SDK owns port types (no production runtime dep)

**Status:** accepted · **Date:** 2026-07-23

**Context:** Custom-node packs must peer on the author SDK
(`@langflower/node-sdk`) plus
`rxjs` / `@rx-evo/stateful-observable` — **not** the full
`@langflower/runtime` tree (editor/runner). Meanwhile
`defineReactiveNode` / `getInstance()` must remain structurally usable by
`RuntimeEditor.addNode`. Importing `PortMeta` / `RuntimeNode` /
`RuntimeWireType` from runtime into the SDK reintroduced that dependency
even for `import type`.

**Alternatives considered:**

- **Keep SDK → runtime dependency** — single source of truth for port types;
  rejected: custom authors inherit runtime as a peer/transitive concern.
- **Invert ownership (runtime imports port types from SDK)** — one owner;
  rejected: execution kernel would depend on the authoring package (wrong DAG
  direction for a thin runtime).
- **New leaf package (`@langflower/wire` / port-types)** — both depend on it;
  deferred: YAGNI for four types; revisit if twins proliferate beyond this
  boundary.
- **Structural twins in SDK + compile-time parity (chosen)** — SDK purity;
  drift risk mitigated by tests.

**Decision:**

1. Author SDK **owns** `PortMeta`, `WireType`, `MetaFromStatefulObservable`,
   and `ReactiveNodeInstance` under
   `packages/node-sdk/.../port-meta.ts` / `types.ts`.
2. Production `package.json` of the SDK lists **only** `rxjs` and
   `@rx-evo/stateful-observable`. `@langflower/runtime` is a **devDependency**
   (samples / parity only).
3. `WireType` keeps the same TypeScript brand string as runtime
   `RuntimeWireType` (`'RuntimeWireType'`) so bypass maps stay assignable
   without casts at the editor boundary.
4. Lock the twin with
   [`runtime-parity.types.test.ts`](../packages/node-sdk/src/node-factory/define-reactive-node/runtime-parity.types.test.ts):
   `ExpectEqual` on `PortMeta` / `WireType`, bidirectional assignability of
   instance core ↔ `RuntimeNode` (minus `nodeId` / `bypassConnections`), and
   the `addNode` argument shape.

This is an **acceptable twin** for node-sdk purity — same class of tradeoff as
ADR-014 structural matches between tools and node-sdk, but narrower
and explicitly gated.

**Tradeoffs accepted:**

- (+) Custom / `defineNode` authors do not take a production dependency on
  runtime.
- (+) Runtime stays free of an upward dependency on the authoring SDK.
- (−) Two declarations of port meta / wire brand; must update both when the
  contract changes.
- (−) Brand string shared by convention (`'RuntimeWireType'`) — renaming
  either side without the other breaks assignability and the parity test.

**Consequences:**

- Package DAG: SDK does not depend on runtime in production; see
  [PRINCIPLES.md](PRINCIPLES.md) § Package DAG.
- Changing `PortMeta` / wire / instance fields requires updating **both**
  packages and keeping `runtime-parity.types.test.ts` green.
- Revisit trigger: prefer a shared leaf package if a third consumer needs the
  same types, or if parity failures become frequent.

---

## ADR-028 — Persisted `inputs` are visible overrides; defaults from definition on load

**Status:** accepted · **Date:** 2026-07-23

**Context:** Saving Fake LLM (and other LLM-class) nodes baked every
`defaultValue` into `node.inputs` (`tools: []`, `systemPrompt: ""`, …). Older
demo workflows used `"inputs": {}`. Load only `connect`'d keys present in JSON,
so empty inputs left inventory ports inactive; with a CJS/ESM dual-package
miss on `isInactive`, `applyPortDefaults` skipped seeds and
`combineInputs` stalled after `userPrompt` arrived — workflows looked
“broken” unless the user recreated the node (which re-baked defaults). Baking
defaults into JSON also freezes stale values across node upgrades.

**Alternatives considered:**

- **Always persist definition defaults into `inputs`** — recreate “worked”;
  rejected: upgrades / changed defaults diverge from disk; masks runtime seed
  bugs; noisy git diffs.
- **Rely only on run-time `applyPortDefaults`** — correct long-term seed path;
  insufficient alone while Symbol-identity guards fail across dual packages.
- **Visible overrides on disk + inject current defaults on materialize
  (chosen)** — file stays sparse; load uses _current_ definition; runtime seed
  remains a safety net with structural inactive detection.

**Decision:**

1. **Persist** `node.inputs[port]` only when the port has a **visible UI field**
   (`hidden !== true`, editable `inline`, not preview-*) **and** the value is
   **not** deep-equal to the current definition `defaultValue`.
2. **On load / materialize**, for each input with `defaultValue` and no saved
   override, `connect(of(currentDefault))` from the live definition (not from
   a historical baked copy).
3. **Normalize** on load and save: strip unknown / non-persistable /
   default-equal keys (in-memory; disk cleaned on next Save).
4. **Runtime** treats `{ state: Symbol }` structurally as inactive/loading so
   dual-package Symbol identity cannot skip `applyPortDefaults` or emit `{}`
   on the bus (extends BUG-2026-07-23).

**Tradeoffs accepted:** (+) Sparse JSON, upgrade-safe defaults, recreate no
longer required to “fix” empty inputs. (−) UI must treat missing keys as
“show definition default”; materialize must disconnect seeds when edges wire
(existing BUG-2026-07-12b). (−) Structural Symbol checks are a pragmatic
guard until `@rx-evo` is single-resolved.

**Consequences:**

- `applyEditorAddNode` no longer merges `defaultInputsFromDefinition` into
  persisted inputs; `WorkflowService` load/save run
  `normalizeWorkflowDocumentInputs`.
- `WorkflowNodePersisted.inputs` docs updated; FOUND_BUGS for empty-inputs
  stall; revisit if port UI metadata cannot express “visible field”.

---

## ADR-029 — Workflow identity is the filename stem

**Status:** accepted · **Date:** 2026-07-23

**Context:** Catalog rows used `metadata.id` from inside each workflow JSON.
Copy-pasting a file (e.g. `fake-llm.json` → `fake-llm-copy.json`) kept the
same embedded id, so the UI listed two workflows that both resolved to one
path — or competed as duplicates. The filesystem already keys files as
`{id}.json`.

**Alternatives considered:**

- **Keep embedded `metadata.id` as source of truth** — rejects: copy-paste and
  external edits desync id from filename; list/load collide.
- **Require unique id inside JSON and reject duplicates on list** — still
  invites silent wrong-file loads when filename ≠ id.
- **Filename stem is identity; omit `id` on disk (chosen)** — one source of
  truth; bridge/session carry `workflowId` (= stem), never inside `metadata`.

**Decision:**

1. On-disk workflow JSON is `{ metadata, graph }` only — no identity field.
2. Bridge/session payloads use sibling `workflowId` (filename stem). Catalog
   rows use `workflowId`; save rename uses `previousWorkflowId`.
3. `WorkflowMetadata` has no `id`. Legacy `metadata.id` on disk is ignored on
   parse (not copied). Display `name` remains a separate user-facing field.
4. No hydrate/toDisk mappers — load/list attach `workflowId` from the stem in
   one object literal; save writes `{ metadata, graph }` to `{workflowId}.json`.

**Tradeoffs accepted:** (+) Copy-paste of files works; catalog cannot collide
on a stale embedded id; no glue adapters mirroring filename into metadata.
(−) Renaming the file outside Langflower changes the workflow id (and
`currentWorkflowId` / checkpoint paths keyed by that id). (−) Legacy files
with embedded `id` are ignored for identity (filename wins).

**Consequences:**

- `WorkflowLoadedPayload` / `WorkflowListEntry` / `WorkflowSavePayload` carry
  `workflowId`; bootstrap example written without id.
- Revisit if we need a stable UUID distinct from the human-editable filename.

**Addendum (2026-07-23):** First pass hydrated identity into `metadata.id`
via `hydrateWorkflowDocument` / `toDiskWorkflowDocument`. That was glue —
identity now lives only as the bridge field `workflowId` (= filename stem);
those adapters are removed.

---

## ADR-030 — Custom node pack layout & npm model

**Status:** accepted · **Date:** 2026-07-24

**Context:** Before shipping `@langflower/compiler` and bootstrap seed copy,
the product must lock how project custom nodes live on disk: folder layout,
default pack id, entry discovery, and who runs `npm install`. Ambiguity here
forks epic 32/33 and dogfood demos.

**Alternatives considered:**

- **Single root `.langflower/nodes/package.json`** — simpler multi-file start;
  weak reuse / publish story; rejected as default seed.
- **Per-pack `package.json` (chosen)** — each subdirectory under
  `.langflower/nodes/` is a shareable unit; one seed pack start cost ≈ one
  `npm i`.
- **Required `index.ts` barrel** — rejected; compiler discovers `export default`
  on `*.ts` / `*.tsx` files.
- **Generated root `nodes/types.ts` re-export** — rejected for demos/seed;
  authors import `@langflower/node-sdk` directly.
- **Server silent `npm install`** — rejected; author (or agent) installs in the
  pack; bootstrap never auto-installs.

**Decision:**

1. Default seed pack id **`my-nodes`** at `.langflower/nodes/my-nodes/`.
2. Each pack has its own `package.json` with peer/dependency on
   `@langflower/node-sdk` (not the full runtime tree as author concern).
3. Entry files: **no** required `index.ts`; `export default` a definition or
   array. Author API default: **`defineNode`**.
4. Draft skeleton lives at
   [`packages/server/skeleton/nodes/my-nodes/`](../packages/server/skeleton/nodes/my-nodes/)
   (epic 33 copies into projects; future `dist/skeleton/` is packaging S1).
5. Author dependencies allowed in pack `dependencies`; bundled later by the
   compiler ([ADR-007](#adr-007--esbuild-for-custom-node-packages)).

**Tradeoffs accepted:**

- (+) Pack can be copied or published; clear peer on the host SDK.
- (+) One seed pack keeps first-run ceremony low (`npm i` once in `my-nodes/`).
- (−) Slightly more ceremony than a single root `package.json`.
- (−) Authoring packs need Custom → Update after edits; peer deps come from
  the host.

**Consequences:**

- Docs / demo / skeleton must not reintroduce `index.ts` or `nodes/types.ts`
  as the contract.
- Epic 32 discovers packs as subdirs of `.langflower/nodes/` (ignore
  `node_modules`, cache, dotfiles).
- Epic 33 copies the locked skeleton path
  (`packages/server/skeleton/`, shipped in package `files`); never overwrites
  an existing `nodes/my-nodes` (or other minimum-seed paths).

---

## ADR-031 — Stop (hard cancel) vs Pause (soft interrupt) vs Steer

**Status:** accepted (docs lock) · **Date:** 2026-07-24

**Context:** The palette mockup and operator mental model need three distinct
run controls: kill the run, soft-interrupt an agent turn, and send mid-turn
feedback. Live UI still exposes a single amber **Stop** that maps to
`runner.interrupt.requested` with reason `'cancel'` only
(`packages/shared/src/langflower-bus-config.ts`). Feature docs and
[run-interruption](use-cases/run-interruption.md) must lock the product
split without claiming soft Pause / Steer as shipped.

**Alternatives considered:**

- **Single Stop (cancel only)** — matches today’s bus; conflates abort with
  course-correction; rejected as product target.
- **UI-only Pause that still calls `'cancel'`** — lies to the operator;
  rejected.
- **Stop / Pause / Steer with typed interrupt reasons** — rejected for soft
  Pause; hard cancel stays `'cancel'` only. Soft Pause mechanism is
  [ADR-032](#adr-032--soft-pause-via-hidden-steercontrol-hitl-port) (node
  await), not a new interrupt reason.
- **Reuse Checkpoint Continue for Steer** — rejected; checkpoints are
  author-placed durable boundaries
  ([ADR-018](#adr-018--durable-workflow-checkpoints)), not mid-turn feedback.

**Decision:**

1. **Stop** = hard cancel = interrupt reason `'cancel'`. Encoding: **error ·
   rose** round icon, composer footer **left** while running or while a soft
   Pause await is open. Tooltip: `Stop — cancel run`.
2. **Pause** = soft interrupt = workflow stays alive; **one** agent (last feed
   section) enters HITL-class await — per-node, not a global run pause.
   Encoding: **warning · amber** round icon, footer **right** while that agent
   is pausable. Tooltip: `Pause — soft interrupt`. Mechanism:
   [ADR-032](#adr-032--soft-pause-via-hidden-steercontrol-hitl-port).
3. **After Pause (Steer):** HITL composer unlocks — textarea + **Send**
   (`steerControl` `config.hitl`); tabs when 2+ awaiting agents/gates. Stop
   still hard-cancels. Not checkpoint Continue; not browser disconnect
   ([detachable-long-run](use-cases/detachable-long-run.md)).
4. Pause/Steer + composer shell shipped (DONE epics 35–36); UI MUST NOT wire
   Pause to cancel.
5. Retire the feed-panel rule that forbade “error-red Stop” and required amber
   Stop in the shared Start/Stop primary slot — that layout is replaced by
   corner Stop/Pause while running.

**Tradeoffs accepted:**

- (+) Clear operator mental model; amber reserved for soft interrupt / warning.
- (+) Hard cancel path stays the existing bus reason — no fake Pause.
- (+) Composer shell layout + Pause/Steer loops landed (DONE 34–36).
- (−) Multi-tab draft/active-tab state stays per-browser-tab; awaiting gates
  sync via bus facts.

**Consequences:**

- Mechanism details live in
  [ADR-032](#adr-032--soft-pause-via-hidden-steercontrol-hitl-port) — do not
  invent ExecutionContext runControl or new `runner.softPause.*` messages.
- Update [feed-panel](features/feed-panel.md), [hitl-chat](features/hitl-chat.md),
  [workflow-execution](features/workflow-execution.md),
  [run-interruption](use-cases/run-interruption.md), [STATUS](STATUS.md).
- Epics 34/36 implement against ADR-031 (chrome) + ADR-032 (mechanism).

---

## ADR-032 — Soft Pause via hidden `steerControl` HITL port

**Status:** accepted · **Date:** 2026-07-24

**Context:** Soft Pause must pause one or more active agent turns without
tearing down the run (unlike `interrupt('cancel')`). Architecturally this is
the same class as HITL — **node-internal await** — not a runner interrupt
kind. Multi-tab UI and multi-agent Pause need a shared signal and a composer
shape (textarea + Send; tabs when 2+).

**Alternatives considered:**

- **ExecutionContext runControl / SoftPauseCoordinator** — host side-channel;
  duplicates HITL await semantics; rejected.
- **New `runner.softPause.*` bus family** — unnecessary; `pushIntoInput` already
  broadcasts `input-received` for multi-tab sync; rejected.
- **Extend `interrupt` with `'pause'`** — conflates teardown with await;
  rejected.
- **Hidden `steerControl` + `config.hitl` + `runner.hitl.event` (chosen)** —
  node await; reuses HITL composer; per-node Pause on the last feed section;
  fold from `input-received`.

**Decision:**

1. Every `defineLlmNode` inventory includes input **`steerControl`**:
   `hidden: true` (not author-wired / no canvas port), with
   `config.hitl: { kind: 'textarea', submitLabel: 'Send' }` (and title as
   needed). **Port mode MUST be `single` (default)** — never
   `multi: 'merge' | 'combine'`. `RuntimeRunner.pushIntoInput` accepts only
   single, edge-free inputs ([runtime spec §6.3](../packages/runtime/spec.md);
   [EXECUTION_ARCHITECTURE](EXECUTION_ARCHITECTURE.md) HITL). A merge-mode
   `steerControl` makes Pause a silent no-op (push returns `false`; stream
   continues). Do not copy `subagentResult`'s `multi: 'merge'` here — that
   port is wire-fed, not push-fed.
2. Payload union on that port:
    - `{ kind: 'pause' }` — soft-interrupt this node’s loop; enter await; run
      stays `running`.
    - `{ kind: 'steer', text: string }` — Send: append into loop messages and
      continue.
    - `{ kind: 'resume' }` — continue without new text (optional; v1 Send-only
      is enough).
3. Delivery: existing `runner.hitl.event` →
   `RuntimeRunner.pushIntoInput({ nodeId, portId: 'steerControl', payload })`.
   No new interrupt reason. JSDoc on `runner.hitl.event` must say it is the
   general pushIntoInput transport (not only gates with visible HITL chrome).
4. **UI fold:** payload-aware on `steerControl` — `pause` **opens** awaiting
   for that `nodeId`; `steer` / `resume` **closes**. Do **not** treat
   `{ kind: 'pause' }` as a HITL reply that closes (default HITL fold would).
   Hydrate from `executionFeed.snapshot` like other HITL awaits. Pause is
   **per-node**, not a global run pause: the UI targets the **last feed
   section**'s working agent with `steerControl` (one `runner.hitl.event` per
   click). Other working agents keep running. Primary multi-agent case: A and
   B both working, last feed = A → Pause stops only A; B continues and becomes
   last in feed → a second Pause stops B. Tabs appear when 2+ nodes await
   (sequential Pause and/or Review Gate mix) — not from a single fan-out.
5. Continuation is **only** via `steerControl` Send/resume — not graph
   `feedback` (ADR-016 Soft↔Hard), not `userPrompt`, not cancel.
6. Hard Stop remains `interrupt('cancel')` only
   ([ADR-031](#adr-031--stop-hard-cancel-vs-pause-soft-interrupt-vs-steer)).

**Tradeoffs accepted:**

- (+) Same await class as HITL; tabs for two paused agents when the operator
  pauses them sequentially (or mixes with gates).
- (+) Multi-tab sync via existing `input-received` broadcast.
- (+) No bus schema break — docs/JSDoc widen only.
- (−) HITL fold must special-case `steerControl` payloads.
- (−) Bus message name `runner.hitl.event` is historical (rename later optional).

**Consequences:**

- Epics 34/36 implement against this ADR; ADR-031 owns product Stop/Pause
  chrome only.
- [EXECUTION_ARCHITECTURE](EXECUTION_ARCHITECTURE.md) documents fold rules
  beside HITL and the **single-mode** `pushIntoInput` constraint.
- [run-interruption](use-cases/run-interruption.md) Runtime rows cite
  `steerControl`.
- Inventory default in `default-llm-ports.ts` must keep `steerControl` single;
  regression covered by runtime push + `defineLlmNode` mode assertions.
- OpenAI, scripted Fake, Sub-Agent, Review, and Critique consume
  `steerControl` through the same reactive loop. Pause aborts/unsubscribes the
  active provider attempt; Steer appends one user message to the last committed
  round checkpoint; Resume retries that checkpoint unchanged.
- Recoverable provider failure suspension reuses the same node-local await.
  Generic runtime/bus reload of an already failed StatefulObservable remains
  [TBD-008](TBD.md#tbd-008--node-local-reactive-recovery).

---

## ADR-033 — Markdown memory tools; no embedding as base

**Status:** accepted · **Date:** 2026-07-27

**Context:** Project “knowledge” was previously a file vector store
(`.langflower/kb/` + embed/search/curation) plus run-scoped key/value memory.
Agents need durable project facts, but the managed corpus is expected to change
**frequently** (daily logs, section rewrites, new feature notes). Embedding
indexes go stale under that churn and pull embedding providers / dimensions /
re-index pipelines into the base product.

**Alternatives considered:**

- **Keep vector KB as base** — strong semantic recall, but requires embedding
  config, re-embed on every meaningful edit, and curation of stale chunks;
  mismatches a frequently rewritten managed folder.
- **Hybrid (markdown files + always-on embeddings)** — richer retrieval, but
  base path still depends on embedding quality and index freshness.
- **Markdown heading tools only (chosen)** — tree / section read / grep /
  append / section update / create under `.langflower/memory/`; deterministic
  backend parsing; no embed pipeline in the default product.

**Decision:**

1. Agent memory is a **managed Markdown folder** (`.langflower/memory/`) exposed
   as wired tools (`get_memory_tree`, `read_memory_section`,
   `search_memory_grep`, `append_memory_log`, `update_memory_section`,
   `create_memory_file`) via a **single** pack node `common-memory-tools` —
   not per-tool alias canvas nodes.
2. The same folder is **also reachable with common harness file tools**
   (`read` / `write` / `edit` / `create` / `delete` / `glob` / `grep`) using
   paths under `.langflower/memory/`. Do not ship secondary graph nodes that
   only alias those file ops for memory.
3. **Embedding / vector search is not base functionality** — the shipped KB
   embed store, `embedding` config block, and related nodes are removed from
   the product surface.
4. Design for **frequent edits** in the managed folder: section-level replace
   and append-only logs, atomic writes, heading-addressed updates (not line
   numbers / opaque chunk ids). Cross-file wiki links are plain Markdown only
   in v1 (richer vault linking deferred — see TBD Obsidian).
5. **Wired ToolHandles skip `permission.ask`:** authoring a `tools` / `mcp`
   edge is consent. OpenCode-style `permission` + HITL ask applies to harness
   **builtins** only.

**Tradeoffs accepted:**

- Semantic “fuzzy” recall without exact keywords needs agent grepping /
  reading sections, or a future optional feature — not a core promise.
- Agents must navigate structure (`get_memory_tree`) instead of a single
  similarity query.
- Former vector KB / contradiction-curation demos and Obsidian-as-KB helpers
  leave the active surface (Obsidian → TBD).

**Consequences:**

- Skeleton samples `kb-create` / `kb-navigate` use `common-memory-tools`.
- Update [STATUS](STATUS.md), [node-library](features/node-library.md),
  [CONFIG](CONFIG.md) (no Embeddings section as product base), helper skill.

---

## ADR-034 — Compact bridge frames (tuple wire + log)

**Status:** accepted · **Date:** 2026-08-12

**Context:** High-frequency `runner.output-emitted` / `runner.input-emitted` object
frames repeated keys (`kind`, `runId`, `nodeId`, …) on every tick. NDJSON diagnostic
logs wrapped the same payload again with `schemaVersion`, `kind: 'frame'`, and
direction metadata — doubling noise on streaming runs.

**Alternatives considered:**

- **Keep object envelopes, compress with gzip** — smaller on wire but still verbose
  in memory/logs; does not unify WS and log shape.
- **Separate compact wire DTO + domain objects + accessor module** — rejected per
  [PRINCIPLES § No adapters](PRINCIPLES.md#no-adapters-no-glue-code); tuple types
  in `@langflower/runtime` are the source shape.

**Decision:**

- **`PortTelemetry`** fixed 8-slot tuple: `['in'|'out', nodeId, portId, state, value, portIdx, edgeIds, feed]`
  (`feed` is `RuntimeFeedPortMeta | null` — never `undefined`; JSON tuples use `null` for absent slots).
- **`BridgeFrame`** wire/log line: `[ts, transportDir, busType, payload]` — identical
  JSON bytes on WebSocket and NDJSON (no log-only sanitization).
- Bus consolidates to **`runner.port`** (direction at `payload[0]`); **`runner.done`**
  uses `['done'] | ['done', runId]`.
- Hard cutover — no rollback flag or dual codec.

**Tradeoffs accepted:**

- (+) Smaller frames; one schema for WS + logs; no glue accessor layer.
- (−) Positional tuples are less self-describing in DevTools (named TS labels help).
- (−) Historical v1 NDJSON on disk is not migrated (read-only).

**Consequences:**

- `@langflower/runtime/types.ts`, `@langflower/websocket-bridge` codec, all
  `runner.port` consumers (UI folds, MCP, integration tests).
- Diagnostic log lines are raw `BridgeFrame` tuples only.

---

## Writing a new ADR

Use the next sequential number. **Supersede** old ADRs (do not delete history) when
decisions change.

```markdown
## ADR-NNN — Short title

**Status:** proposed · **Date:** YYYY-MM-DD

**Context:** What problem or constraint forced a choice? (2–4 sentences)

**Alternatives considered:** At least two real options — not strawmen. One line each
why rejected or deferred.

**Decision:** What we chose.

**Tradeoffs accepted:** Explicit (+) gains and (−) costs. This section is required.

**Consequences:** Concrete follow-ups — code paths, docs, migrations, revisit triggers.
```

### Checklist before filing

- [ ] Would a competent developer ask "why not the obvious default?" — if no, skip ADR.
- [ ] Are alternatives **plausible** for this project (not "we could use COBOL")?
- [ ] Are downsides stated honestly (performance, complexity, lock-in, ops burden)?
- [ ] Is there a **revisit trigger** (e.g. "revisit if we need LAN access")?

Link new ADRs here. Update [ARCHITECTURE.md](ARCHITECTURE.md) when structure changes.

## Related docs

- [ARCHITECTURE.md](ARCHITECTURE.md) — diagrams and flows
- [PRINCIPLES.md](PRINCIPLES.md) — coding conventions (not ADR-level)
- [STATUS.md](STATUS.md) — implementation state
- [spec.md](../spec.md) — product specification
