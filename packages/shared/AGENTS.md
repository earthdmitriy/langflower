# @langflower/shared

Langflower's domain kernel: co-versioned WS protocol/config, persisted workflow
and checkpoint shapes, project configuration types, and small deterministic
helpers shared by server, UI, CLI, MCP, and tests. **No filesystem/network I/O,
Angular, or server orchestration.**

This package integrates domain shapes owned by lower-level packages; it does not
own every type it references. Node authoring contracts and palette definition
shape originate in `@langflower/node-sdk`; runner event/status and graph
identity types originate in `@langflower/runtime`; frame transport originates in
`@langflower/websocket-bridge`.

## Entry point

**No `index.ts`** — barrels are forbidden ([PRINCIPLES.md](../../docs/PRINCIPLES.md)).
Import concrete modules from `src/` by path within the package or via
`package.json` `exports` when configured.

## Dependencies and owners

Actual runtime dependencies:

- `@langflower/node-sdk` — reactive definition and UI-schema option
  types used by palette/config projections.
- `@langflower/runtime` — `NodeId` / `RunId`, persisted edge shape, runner
  status/events, and seed/runtime protocol types.
- `@langflower/websocket-bridge` — typed bus registry and client API.
- `rxjs` — pure request/wait composition in `langflower-ws-waits.ts`.

Ownership outside this package:

- Node factories, port metadata, passthrough/bypass authoring contracts:
  `@langflower/node-sdk`.
- Runtime graph binding, runner behavior, event production:
  `@langflower/runtime`.
- Built-in node implementations and provider adapters:
  `@langflower/common-nodes`.
- Filesystem, session state, workflow CRUD, palette compilation, secrets, and
  bridge handler orchestration: `@langflower/server`.
- UI projections and ngDiagram conversion: `@langflower/ui`.

Do not import `@langflower/common-nodes`, server, UI, CLI, or MCP from production
shared code.

## WebSocket bus types

[`langflower-bus-config.ts`](src/langflower-bus-config.ts) uses `@langflower/runtime`
types **as-is** in `message<>()` — no mirror interfaces, no payload type aliases.
This is deliberate: runtime method shape changes should fail fast at compile time
across server and UI instead of being hidden behind DTO adapters that can drift.

The bus registry is an **internal, co-versioned** protocol for Langflower packages,
not a public stable WebSocket API. Keep transport defaults (`/ws`, port `4010`)
with the registry so client and server share one source of truth. Each partial
config owns a unique event namespace prefix (`editor.*`, `runner.*`,
`session.*`, `palette.*`, `workflow.*`) before the final route merge.

**Workflow manager (`workflowManagerConfig`):** several tabs can share one server
session. Workflow state sync uses **broadcast snapshots**
(`workflow.list.snapshot`, `workflow.current.snapshot`) — not command-reply events.
See JSDoc on `workflowManagerConfig` in `langflower-bus-config.ts`.

**State sync overview** (on `langflowerWsConfig`): session, workflow, and palette
are **snapshot-only** (full slice replace). Runtime execution on the graph uses
**snapshot + event-sourcing** — `executionFeed` on reconnect, then live `runner.*`
events only.

`SessionReadyPayload` and `ExecutionProgressStatus` live in
[`types/langflower-server.ts`](src/types/langflower-server.ts). Snapshot payloads
live in [`types/langflower-bootstrap.ts`](src/types/langflower-bootstrap.ts);
workflow, editor, palette, config, and checkpoint payloads stay in their
corresponding `types/` modules.

**WS wait helpers** ([`langflower-ws-waits.ts`](src/langflower-ws-waits.ts)): pure
RxJS request/wait helpers over a `langflowerWsConfig` client (no filesystem).
Used by integration tests and `@langflower/mcp`.

## Layout

```
src/
├── checkpoint/
│   ├── json-value.ts                 # checkpoint-safe JSON conversion
│   └── workflow-fingerprint.ts       # deterministic workflow fingerprint
├── constants/
│   └── defaults.ts                   # port, tool config, divider defaults/clamps
├── execution/
│   └── derive-run-settle-outcome.ts  # pure execution terminal-status helpers
├── langflower-config/
│   ├── mcp-tool-id.ts
│   ├── merge-langflower-config-layers.ts
│   ├── merge-provider-model-options.ts
│   ├── resolve-ui-schema-options.ts
│   └── resolve-wired-tool-options.ts
├── types/
│   ├── config.ts
│   ├── langflower-bootstrap.ts
│   ├── langflower-config.ts
│   ├── langflower-editor.ts
│   ├── langflower-palette.ts
│   ├── langflower-server.ts
│   ├── langflower-workflow.ts
│   └── workflow-checkpoint.ts
├── langflower-bus-config.ts          # typed internal WS registry
├── langflower-ws-waits.ts            # pure request/wait helpers (tests + MCP)
└── langflower.ts                     # supported aggregate domain surface
```

## Package boundary

- Production shared code may import only its declared runtime dependencies and
  relative in-package paths.
- Do not move catalog lookup, node implementation, runtime graph behavior,
  server session orchestration, or UI projection logic into shared.
- Keep `langflower-bus-config.ts` payloads expressed in the owning domain types;
  do not add mirror DTOs.

## Type safety

- Prefer **utility types** and **type guards** over `as`.
- Every `as` cast needs a strong, reviewable reason (see [docs/PRINCIPLES.md](../../docs/PRINCIPLES.md)).
- **Reuse existing types** — do not add parallel shapes that mirror an exported type.
  Extend with intersection (`OriginalType & { readonly extra: T }`) when a field is
  genuinely local.

## Rules

- All exported shapes use `readonly` fields.
- **WebSocket:** keep frame typing in `langflower-bus-config.ts` and decode through
  `@langflower/websocket-bridge`; add service-boundary guards where payloads cross
  into filesystem, runtime, or UI state.
- Change the owning type and every affected co-versioned consumer in the same
  change; do not introduce a temporary parallel payload.
- **Found bugs:** execution/domain bugs fixed here → log in
  [docs/FOUND_BUGS.md](../../docs/FOUND_BUGS.md).

## Build

```bash
node build/tools/agent-run.mjs build-package shared
```
