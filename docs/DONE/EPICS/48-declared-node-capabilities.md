# Epic 48 — Declared node capabilities (`requires`)

**Status:** landed (slices A–C; pack `chat` / `embed` remains
[TBD-012](../../TBD.md#tbd-012--pack-visible-host-chat--embed))  
**Depends on:** [41-uniform-tool-shape](41-uniform-tool-shape.md)
(`ToolHandle[]` on ctx); [42-embedding-providers](42-embedding-providers.md)
(`EmbedHandle`, bound `createEmbedding`);
[45-global-kv-secrets](45-global-kv-secrets.md) (secrets bag on the run host)  
**Index:** [README.md](README.md)  
**Related:** [ADR-027](../../architecture/ADR.md#adr-027--author-sdk-owns-port-types-no-production-runtime-dep),
[ADR-030](../../architecture/ADR.md#adr-030--custom-node-pack-layout--npm-model),
[EXTENSION_POINT](../../architecture/EXTENSION_POINT.md),
[PRINCIPLES](../../architecture/PRINCIPLES.md),
[HOW_TO_WRITE_REACTIVE_NODES](../../HOW_TO_WRITE_REACTIVE_NODES.md)

## Goal

A node **declares** which host capabilities it needs; the run composer builds
exactly those and nothing else; `bind` receives them as **non-optional** typed
fields. The hidden `ctx` port stays — this epic fixes how it is _populated and
typed_, not the seam itself.

Proof of done: `packages/common-nodes/src/ai/features/**` contains no
`getRunHostServices(...)?.x` peek and no `?? fallback` for a host capability;
starting a graph of pure nodes (`common-string`, `common-delay`,
`common-preview`) builds **zero** tool harnesses, and a node that needs an
absent capability fails loudly at seed time with one actionable message instead
of degrading into an improvised default deep inside a loop.

## Why (verified facts)

1. **Every capability is optional at the type level.** `RunHostServices` is a
   symbol-attached bag of 12 optional fields
   ([`run-host-services.ts`](../../../packages/common-nodes/src/run-host/run-host-services.ts));
   the LLM variant adds `createChatCompletionStream`
   ([`llm-run-host.ts`](../../../packages/common-nodes/src/ai/features/llm-run-host.ts)).
   Consumers must handle "absent" **at every call site**, so each absence gets
   its own private policy.
2. **14 files peek the bag, 15 sites total** (verified inventory):

    | Capability field                                   | Consumers                                                         |
    | -------------------------------------------------- | ----------------------------------------------------------------- |
    | `createChatCompletionStream`                       | `openai-llm`, `fake-llm`, `sub-agent`, `bind-path-choice-session` |
    | `createEmbedding` (+ defaults)                     | `embed-text`, `embed-provider`                                    |
    | `denyPaths`                                        | `read-file`, `write-file`, `append-file`                          |
    | `allowedHosts`                                     | `fetch-url`, `crawl`                                              |
    | `secrets`                                          | `mcp-http`                                                        |
    | `skillMarkdown` / `agentsMarkdown` / `defaultChat` | `llm-session-shell` (prompt assemble)                             |
    | `requestPermission`                                | `llm-session-shell` (tool gate, limit continue)                   |
    | `getLiveWiredTools`                                | `llm-session-shell` (hot-swap inventory)                          |
    | `requestLangflowerBus`                             | `langflower-tools`                                                |
    | `authorize`                                        | agent tool ctx (`buildAgentToolCtx`)                              |

3. **The composer builds everything for everyone.** `buildExecutionContext`
   ([`build-execution-context.ts`](../../../packages/server/src/bridge/build-execution-context.ts))
   reads config, secrets, skill markdown, permissions, builtin tool handles and
   MCP handles per node, then attaches the same bag shape regardless of what the
   node can use. A `common-string` node carries a tool harness it can never
   call.
4. **The only existing selector is a negative flag.**
   `skipBoundChatCompletionStream` exists so `fake-llm` can _opt out_ of one
   binding — a hint that the real need is a positive declaration.
5. **The generic already exists.** `ExecutionContext<UI, Caps>` and
   `LlmExecutionCaps` are in place
   ([`types.ts`](../../../packages/node-sdk/src/node-factory/define-reactive-node/types.ts));
   today `Caps` carries only optional `toolHandles`. `requires` gives that
   generic a source.
6. **Packs have no capabilities at all today.** The bag symbol is a
   module-local `Symbol()` in common-nodes, so a pack node (node-sdk imports
   only) cannot reach any host capability — it gets identity, params,
   `resolveSecret`, and wired ports. Opening `chat` / `embed` to packs is a
   **new product surface** ([TBD-012](../../TBD.md#tbd-012--pack-visible-host-chat--embed)),
   not this epic.
7. **The test harness fakes the shape with a cast.** `createNodeHarness` builds
   the base fields and casts (`as HarnessContext`)
   ([`create-node-harness.ts:64-75`](../../../packages/node-sdk/src/testing/create-node-harness.ts));
   LLM-node tests attach the bag by hand.

## Locked decisions

1. **Keep the hidden ctx port.** No module singletons, no DI container, no
   ambient service locator. One node reads one ctx; the port is already the
   seam.
2. **`requires` is positive and literal**, on the definition:
   `requires: ['chat', 'tools'] as const`. Delete
   `skipBoundChatCompletionStream` in the same change (no negative flags).
3. **Capability ids are grouped by consumer need, not by field.** v1 set
   (11 ids) maps onto fact 2: `chat`, `embed`, `tools`, `paths`, `hosts`,
   `secrets`, `promptContext`, `permissionAsk`, `liveTools`, `editorBus`,
   `authorize`. Adding an id is an epic-sized decision; the registry is the
   ceiling, so the list stays short and reviewed.
4. **`defineLlmNode` declares the LLM set once.** The purpose factory merges
   its own required ids (`chat`, `tools`, `promptContext`, `permissionAsk`,
   `liveTools`) with the author's, so individual LLM nodes do not repeat them
   and cannot forget one.
5. **Availability ≠ validity.** Capability resolution checks whether the host
   _bound_ the capability, not whether credentials work. Missing provider
   credentials stay a call-time `{ ok: false }` (epic 45 loudness,
   `resolveProviderCredentials`) — do not move credential validation to seed
   time or validate twice.
6. **Unavailable required capability → ctx error at seed time**, reusing the
   existing mechanism (the MCP failure path already seeds
   `throwError(() => ctxError)` on the hidden port). Message names the node,
   the id, and the fix. No silent degradation, no `MISSING_RPC_TEXT`-style
   improvised string.
7. **Least privilege for the bag.** A node that does not declare `secrets`
   must not receive the secrets map; same for `editorBus` / `liveTools`. This is
   hygiene for built-ins (and a hard requirement if TBD-012 ever opens packs).
8. **Host-internal ids stay host-only.** `editorBus`, `liveTools`, `authorize`,
   `paths`, `hosts` stay typed in the host tree. Pack visibility of any
   capability is TBD-012, not this epic.
9. **Do not turn capabilities into ports.** Wiring `chat` or `secrets` as
   visible edges is out of scope: host capabilities are not author-composable
   dataflow, and `assertExecutionContextHostKeys` exists precisely to keep host
   mutation / I/O off the author ctx surface.

## In scope

### Slice A — Registry + `requires` + derived caps (no behaviour change)

Author-facing declaration and typing only; the composer still builds
everything, so this slice is independently shippable and provably inert.

Draft:

```ts
// packages/node-sdk/src/node-factory/define-reactive-node/capabilities.ts
export const NODE_CAPABILITY_IDS = [
	'chat',
	'embed',
	'tools',
	'paths',
	'hosts',
	'secrets',
	'promptContext',
	'permissionAsk',
	'liveTools',
	'editorBus',
	'authorize',
] as const;

export type NodeCapabilityId = (typeof NODE_CAPABILITY_IDS)[number];

/**
 * id → non-optional ctx field(s). Host-internal ids stay unresolvable for
 * pack builds (slice D).
 */
export type CapabilityFields = {
	readonly chat: { readonly chat: CreateChatCompletionStream };
	readonly embed: { readonly embed: CreateEmbedding };
	readonly tools: { readonly toolHandles: readonly ToolHandle[] };
	// …
};

export type CapsFor<Ids extends readonly NodeCapabilityId[]> =
	UnionToIntersection<CapabilityFields[Ids[number]]>;
```

`DefinedReactiveNodeConfig` gains `readonly requires?: Requires` with
`Caps = CapsFor<Requires>`, so `bind` sees `ctx.value$` typed with
**non-optional** capability fields. `ReactiveNodeDefinition` exposes
`requires: readonly NodeCapabilityId[]` (default `[]`) for the server and the
palette payload.

Tests: `define-reactive-node.test.ts` — `requires` lands on the definition;
`defineLlmNode` merges the LLM set; a `*.types.test.ts` compile case asserting
`ctx.chat` is non-optional with `requires: ['chat']` and absent without it.

### Slice B — Composer honours `requires`

- `build-execution-context.ts` becomes a composer over one provider per
  capability id, each built **only when requested**, with per-run memoization
  for shared work (config read, secrets read, MCP handles, skill markdown keyed
  by skill id). Per-node work that depends on node params (permission merge,
  node-scoped handle wrapping) stays per node.
- Requested-but-unbound id → ctx error seed (decision 6).
- Non-declaring nodes get the base ctx only; the capability bag shrinks to the
  declared subset.
- Declare `requires` on the 14 consumer files from fact 2; delete
  `skipBoundChatCompletionStream` (types, factory, `fake-llm`, composer, tests).

Draft:

```ts
// packages/server/src/bridge/build-execution-context.ts
const CAPABILITY_PROVIDERS = {
	chat: (run) => run.chat,               // bound once per run
	embed: (run) => run.embed,
	tools: (run, node) => buildNodeToolHandles(run, node),
	secrets: (run) => run.secrets,
	// …
} satisfies CapabilityProviders;

const capsFor = (
	definition: ReactiveNodeDefinition,
	run: RunScope,
	node: WorkflowNodePersisted,
): Result<object, CtxError> => …;   // unknown / unbound id → { ok: false }
```

Tests (server unit): a graph of `common-string` + `common-delay` +
`common-preview` builds zero tool harnesses (spy on the handle factory) and no
secrets map; an LLM node still receives `chat` + `tools`; a node requiring
`editorBus` outside a server session seeds exactly one ctx error naming the
node and the id; `mcp-http` receives `secrets` while `read-file` does not.

### Slice C — Slices become pure functions over caps

- `ai/features/**` take the capability as a **parameter** instead of peeking:
  `runLlmLoop({ chat, tools, … })`. `getRunHostServices` /
  `getLlmRunHostServices` survive only at node boundaries (where the ctx is
  read) — ideally nowhere, once `bind` gets typed caps.
- Delete the per-site absence policies (`?? ''`, `?? {}`, conditional spreads)
  that decision 5 makes unreachable.
- `createNodeHarness` accepts `caps` and drops the `as HarnessContext` cast;
  common-nodes test helpers that hand-attach the bag are deleted.

Tests: an `llm-loop` unit test constructs the loop with a fake `chat` and no
`ExecutionContext` at all; review gate — no `getRunHostServices` under
`ai/features/`.

## Out of scope

- Pack-visible host `chat` / `embed` — parked as
  [TBD-012](../../TBD.md#tbd-012--pack-visible-host-chat--embed). This epic
  keeps `requires` built-ins-only. Do not relocate provider contracts into
  the SDK or amend ADR-030 for pack-callable host bindings here.
- Turning `requestLangflowerBus` / `getLiveWiredTools` reentrancy into
  intents / ports. Spike first (it touches live-graph mutation, adjacent to
  [TBD-011](../../TBD.md#tbd-011--live-editing-of-a-running-workflow)); this
  epic only makes the dependency **declared**.
- Per-capability quotas, metering, or sandboxing of pack calls.
- Moving project I/O out of `@langflower/tools` or reshaping `ToolHandle`.
- Replacing the symbol bag with a class / DI container.
- Changing `resolveSecret` (keyed lookup stays; no bag listing for authors).

## Acceptance criteria

1. `requires` exists on the definition, is surfaced on `ReactiveNodeDefinition`,
   and `bind` sees declared capabilities as **non-optional** fields (compile
   test proves both directions).
2. `defineLlmNode` injects the LLM capability set; an LLM node that declares
   nothing still receives `chat` / `tools`.
3. `skipBoundChatCompletionStream` no longer exists anywhere in the repo.
4. A run of only pure nodes builds **zero** tool harnesses / MCP handles and
   receives no secrets map (spy-asserted, not inspected by eye).
5. A node requiring an unbound capability produces exactly **one** ctx error at
   seed time, naming node id + capability + remedy; the run does not start that
   node and the feed shows the error (S6 shape).
6. Missing provider **credentials** still fail at call time with the epic-45
   message — not at seed time, and not twice.
7. No `getRunHostServices(...)?.` peek remains under
   `packages/common-nodes/src/ai/features/`; no `?? ''` / `?? {}`
   host-capability fallback remains in the migrated consumers.
8. `createNodeHarness` types caps without a cast; at least one LLM-feature test
   runs with a fake capability and no `ExecutionContext` fixture.
9. `dead-code` clean, `check-exports` clean, and no package-boundary edge added
   (`production-imports.test.ts` green).
10. Close-out gate green (below).

## Implementation notes (non-normative)

Likely touch:

- [`packages/node-sdk/src/node-factory/define-reactive-node/types.ts`](../../../packages/node-sdk/src/node-factory/define-reactive-node/types.ts),
  `define-reactive-node.ts`, `define-llm-node.ts`, new `capabilities.ts`
- [`packages/node-sdk/src/testing/create-node-harness.ts`](../../../packages/node-sdk/src/testing/create-node-harness.ts)
- [`packages/server/src/bridge/build-execution-context.ts`](../../../packages/server/src/bridge/build-execution-context.ts),
  `bind-llm-context.ts`
- [`packages/common-nodes/src/run-host/run-host-services.ts`](../../../packages/common-nodes/src/run-host/run-host-services.ts)
  (shrinks; may disappear after slice C),
  [`ai/features/llm-run-host.ts`](../../../packages/common-nodes/src/ai/features/llm-run-host.ts)
- the 14 consumer files from fact 2

Sequencing traps:

- Land A → B → C in that order. A is inert, B changes what exists in the ctx,
  C removes the optional-access code that B made unreachable. Reversing B and C
  breaks every consumer at once.
- Keep the bag symbol until C is done; it is the only thing letting old and new
  consumers coexist within a slice.
- `fake-llm` is the honest canary: it must keep working with an **injected**
  chat factory once the negative flag is gone.
- Watch startup cost regressions from memoization keys (epic 44 optimized this
  path; measure `langflower start` → first `runner.started` before/after).

## Verify

- Intermediate (optional): focused `vitest run` on `packages/node-sdk`,
  `packages/server`, and `packages/common-nodes`; `verify --quick` while
  iterating.
- **Close-out (required):** `npm run typecheck` (or
  `node build/tools/agent-run.mjs typecheck`) **and** `npm run test` or full
  `node build/tools/agent-run.mjs verify` — unit **and** integration. This epic
  changes execution context construction, so integration coverage is mandatory
  ([TESTING](../../TESTING.md)). Then `node build/tools/agent-run.mjs dead-code`
  → delete findings → `node build/tools/agent-run.mjs check-exports`.

## Links

- [EXTENSION_POINT](../../architecture/EXTENSION_POINT.md) (node / pack seams)
- [ADR-030 custom node packs](../../architecture/ADR.md#adr-030--custom-node-pack-layout--npm-model)
- [HOW_TO_WRITE_REACTIVE_NODES](../../HOW_TO_WRITE_REACTIVE_NODES.md)
- [41-uniform-tool-shape](../../DONE/EPICS/41-uniform-tool-shape.md)
- [44-startup-optimization](../../DONE/EPICS/44-startup-optimization.md) (ctx
  build is on the startup path)
- [TBD-012](../../TBD.md#tbd-012--pack-visible-host-chat--embed) (pack-callable
  host `chat` / `embed` — not this epic)
