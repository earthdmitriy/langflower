# Extension points

Map of the seams you extend Langflower through: what to touch, who enforces it,
and how stable the surface is. This page **links** to the owning docs and code —
it is not a second source of truth. User-facing instructions live in
[docs/public/extending.md](../public/extending.md).

## Seam table

| Seam                    | Touch                                                                                                | Enforced by                                                   | Stability                                 |
| ----------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------- |
| Built-in catalog node   | `packages/common-nodes/src/<domain>/<node>/node.ts` + entry in `src/catalog.ts` (+ `NODE.md`, tests) | `resolve-workflow-node-definition.test.ts`, palette snapshot  | Internal (monorepo change)                |
| Custom node pack        | `<project>/.langflower/nodes/<pack>/` — no monorepo change                                           | compiler typecheck + pack `COMPILATION_ERRORS.md`             | **Public** (`@langflower/node-sdk`)       |
| Tool pack (agent tools) | `defineToolRegistrations` node; wire its `tools` output into an LLM node                             | `collect-agent-tool-handles.test.ts`, node tests              | **Public** (SDK) / internal for built-ins |
| Builtin harness tool    | `packages/tools/src/builtins/<id>/tool.ts` + `src/builtins/catalog.ts`                               | tools unit tests, permission floors in config                 | Internal                                  |
| Bus event               | `packages/shared/src/langflower-bus-config.ts` + payload type in `shared/src/types/`                 | typed client generation, `tests/integration/ws/`              | Internal protocol (co-versioned)          |
| MCP exposure            | `packages/langflower-mcp/src/mcp-exposure-policy.ts` (+ `intent-wait-predicate.ts`)                  | `build-tool-catalog.test.ts`, MCP tests                       | Internal **security boundary**            |
| LLM / embedding model   | `provider.<id>` in `.langflower/langflower.jsonc` — no code change                                   | `resolve-provider-credentials`, Settings model catalog        | **Public** (config), OpenAI protocol only |
| Palette / UI metadata   | `category`, `paletteSecondary`, `defaultCanvasSize`, `feedVisitBoundary` on the node definition      | `types/palette-projection.ts` + palette / canvas / feed tests | **Public** (part of the definition)       |

## Built-in catalog node

Two files: the node folder (`node.ts`, `NODE.md`, `node.test.ts`) and the
registry entry in [`packages/common-nodes/src/catalog.ts`](../../packages/common-nodes/src/catalog.ts).
The palette is derived from the catalog in
[`packages/server/src/palette/palette.service.ts`](../../packages/server/src/palette/palette.service.ts),
so an ordinary node needs **no UI change**. Authoring rules:
[NODES.md](../NODES.md), [HOW_TO_WRITE_REACTIVE_NODES.md](../HOW_TO_WRITE_REACTIVE_NODES.md).

## Custom node pack

The only seam that extends a running product without touching the monorepo.

1. Author under `<project>/.langflower/nodes/<pack>/` with `export default`
   entries — layout and npm model:
   [ADR-030](ADR.md#adr-030--custom-node-pack-layout--npm-model).
2. Discovery / typecheck / esbuild / cache:
   [`packages/compiler`](../../packages/compiler/AGENTS.md)
   (`discover-packs.ts`, `compile-project-nodes.ts`, `load-project-nodes.ts`).
3. Reload without restart: palette sidebar **Custom → Update** emits
   `customPalette.update.requested`; the server runs
   [`compile-and-hot-swap-custom-nodes.ts`](../../packages/server/src/bridge/compile-and-hot-swap-custom-nodes.ts)
   (recompile → registry swap → `customPalette.snapshot`, pruning edges whose
   ports vanished). An agent can trigger the same intent through
   [`langflower-tools-rpc.ts`](../../packages/server/src/bridge/langflower-tools-rpc.ts).
4. Custom types win over built-ins on resolve
   ([`server-context.ts`](../../packages/server/src/server-context.ts)).
5. First-run seed: [`packages/server/skeleton/nodes/my-nodes/`](../../packages/server/skeleton/nodes/my-nodes/).

Pack **dependencies** are never auto-installed: run `npm install` inside the
pack, then Update.

## Stable versus internal surfaces

Packs live outside the repo, so only a narrow surface is a contract.

**Stable for pack authors**

- `@langflower/node-sdk` and its subpaths `/llm`,
  `/create-typed-ui-schema`, `/testing`
  ([exports](../../packages/node-sdk/package.json),
  [AGENTS.md](../../packages/node-sdk/AGENTS.md)).
- Host-supplied peers, kept external at bundle time and resolved from the
  Langflower install tree: `rxjs`, `@rx-evo/stateful-observable`
  (`HOST_PEER_PACKAGES` in
  [`resolve-host-types.ts`](../../packages/compiler/src/resolve-host-types.ts);
  policy table in [packages/compiler/AGENTS.md](../../packages/compiler/AGENTS.md)).
  A pack that only uses peers typechecks and loads with no pack
  `node_modules`.
- The author boundary itself is deliberately narrow: `ExecutionContext` stays
  identity + params + `resolveSecret`; host I/O is not on it. Do not widen it
  for convenience ([node-sdk AGENTS.md](../../packages/node-sdk/AGENTS.md)
  § Author SDK boundary).

**Internal — do not build packs or external clients on these**

- The WebSocket registry `packages/shared/src/langflower-bus-config.ts` and
  `@langflower/shared` as a whole: co-versioned with the product, changed
  without notice.
- `@langflower/runtime` — port and instance contracts are mirrored into the SDK
  on purpose ([ADR-027](ADR.md#adr-027--author-sdk-owns-port-types-no-production-runtime-dep)).
- `@langflower/tools`, `@langflower/common-nodes`, `@langflower/compiler`,
  `@langflower/server`: monorepo packages, not an add-on API.

**Pack ↔ SDK versions.** Skeleton packs pin the **exact current** SDK version
(`packages/server/skeleton/nodes/*/package.json`), enforced by
`tests/unit/release/skeleton-sdk-pin.test.ts`, so a seeded project starts
aligned with the shipped SDK. The pin in a pack manifest is a typecheck/editor
hint only: the compiler resolves host peers from the **Langflower install
tree**, so a pack always compiles and runs against the installed SDK. After a
product upgrade the peer version change invalidates the compile cache
(`hostRuntimeStamp`) and every pack is recompiled; a pack that used removed API
fails into its own `COMPILATION_ERRORS.md` and is skipped while the rest of the
palette keeps working. Full matrix:
[RELEASE.md § Pack ↔ SDK compatibility](../RELEASE.md#pack--sdk-compatibility),
[ADR-030 consequences](ADR.md#adr-030--custom-node-pack-layout--npm-model).

## Bus event

New protocol facts are added in one registry; most consumers derive.

1. Declare the key in
   [`langflower-bus-config.ts`](../../packages/shared/src/langflower-bus-config.ts)
   with its payload type from `packages/shared/src/types/`.
2. The typed client, decode, and subjects are derived from that registry —
   [`create-client.ts`](../../packages/websocket-bridge/src/create-client.ts)
   needs no change.
3. Server side: handle the intent in the namespace's `wire-*-handlers.ts`; a
   **new namespace** also needs a line in
   [`attach-langflower-bridge.ts`](../../packages/server/src/bridge/attach-langflower-bridge.ts).
   Intent → wire → outbound map: [BRIDGE.md](../../packages/server/src/bridge/BRIDGE.md).
4. UI: read from `LangflowerBridgeService.raw`. A pure last-value bootstrap
   snapshot that late-mounting features must not miss is added to
   `CACHED_BRIDGE_EVENTS` in
   [`langflower-bridge.service.ts`](../../packages/ui/src/app/services/langflower-bridge.service.ts)
   — never live runner deltas.
5. Agent visibility is a separate, deliberate decision (next section).

Snapshot versus event-sourcing rules:
[EXECUTION_ARCHITECTURE.md](EXECUTION_ARCHITECTURE.md),
[ADR-012](ADR.md#adr-012--internal-websocket-bus-rest-for-bulk-escape-hatches).

## MCP exposure

Intents become MCP tools by namespace glob (`workflow.*`, `runner.*`) and
metadata is generated (`scripts/codegen-bridge-tools.mjs` →
`src/generated/bridge-tool-meta.ts`), but two lists stay **hand-curated on
purpose** in
[`mcp-exposure-policy.ts`](../../packages/langflower-mcp/src/mcp-exposure-policy.ts):

- `OBSERVE_EVENT_KEYS` — what an agent may read or wait on. An allowlist, not
  duplicated bookkeeping: adding a bus key must not silently widen agent
  visibility. `editor.*` never matches.
- Wait correlation semantics live in `intent-wait-predicate.ts`.

Do not derive either from the bus registry. Usage:
[LANGFLOWER_MCP.md](../LANGFLOWER_MCP.md), [ADR-024](ADR.md#adr-024--dev-mcp-control-plane-over-internal-ws-bus).

## LLM and embedding providers

Adding a **provider endpoint or model** is configuration: a `provider.<id>`
entry with credentials and models in `.langflower/langflower.jsonc`
([CONFIG.md](../CONFIG.md)). The server resolves credentials
(`resolve-provider-credentials.ts`) and binds the adapters
([`bind-llm-context.ts`](../../packages/server/src/bridge/bind-llm-context.ts),
[`bind-embed-context.ts`](../../packages/server/src/bridge/bind-embed-context.ts)).

**Ceiling — known limitation:** only the **OpenAI-compatible HTTP protocol** is
implemented ([`common-nodes/src/ai/features/openai/`](../../packages/common-nodes/src/ai/features/openai/),
[`create-embedding.ts`](../../packages/common-nodes/src/embeddings/create-embedding.ts)).
`provider.<id>` selects endpoint, credentials, and model list — **not** the
transport. A provider with a different wire protocol needs a new adapter plus a
provider registry; there is no such demand in [TBD.md](../TBD.md), so no
registry exists and none is planned in this pass.

## Palette grouping and UI presentation

`category` groups nodes at Level 2; `paletteSecondary: true` moves a node into
the collapsed **Advanced** group, subgrouped by `category`
([ADR-023](ADR.md#adr-023--palette-palettesecondary--collapsed-advanced)). Both are plain
definition metadata, so custom packs get the same grouping.

The palette contract passes **any** definition metadata through:
`PaletteNodeDefinition = Omit<ReactiveNodeDefinition, 'getInstance'> & { source }`
([`langflower-palette.ts`](../../packages/shared/src/types/langflower-palette.ts)).
Node-level behaviour the UI needs therefore belongs on the definition — not in a
UI list of node type ids. Shipped presentation flags
([`define-reactive-node/types.ts`](../../packages/node-sdk/src/node-factory/define-reactive-node/types.ts)):

| Field                     | Effect                                                                                                                                              | Declared by                    |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `chatEntry`               | Node opens a HITL chat entry                                                                                                                        | `common-ask-user`, HITL inputs |
| `paletteSecondary: true`  | Collapsed **Advanced** palette group                                                                                                                | Logic / Flow / Crawl graph I/O |
| `defaultCanvasSize`       | Locks both canvas axes while no width is persisted (operator resize wins)                                                                           | `common-preview` (320×280)     |
| `feedVisitBoundary: true` | First work-log frame closes the caller's visit — own card. Travels on the `runner.port` frame (`closesPreviousVisit`), so packs need no UI support. | `common-sub-agent`             |

A custom pack node that sets the same field gets the same behaviour.
`defaultCanvasSize` is still read from the resolved definition
([`default-canvas-size.ts`](../../packages/ui/src/app/features/canvas/utils/default-canvas-size.ts));
`feedVisitBoundary` is stamped onto every frame of that node.

## Related

- [NAVIGATION.md](NAVIGATION.md) — where code belongs
- [ARCHITECTURE.md](ARCHITECTURE.md) — packages, startup, build order
- [ADR.md](ADR.md) — the decisions behind these seams
- [docs/public/extending.md](../public/extending.md) — user-facing manual
