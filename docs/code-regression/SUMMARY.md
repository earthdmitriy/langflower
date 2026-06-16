# Code regression — SUMMARY

Date: 2026-07-22
Scope: full (architecture + principles re-audit; artifacts overwritten)
Chunks reviewed: 17 (see [CHUNKS.md](CHUNKS.md))

| Chunk                 | Report                                           | Open C / I / S |
| --------------------- | ------------------------------------------------ | -------------- |
| `shared`              | [shared.md](shared.md)                           | 0 / 5 / 3      |
| `node-definitions`    | [node-definitions.md](node-definitions.md)       | 0 / 3 / 4      |
| `runtime`             | [runtime.md](runtime.md)                         | 0 / 2 / 5      |
| `tools`               | [tools.md](tools.md)                             | 0 / 1 / 6      |
| `common-nodes-ai`     | [common-nodes-ai.md](common-nodes-ai.md)         | 0 / 2 / 5      |
| `common-nodes-domain` | [common-nodes-domain.md](common-nodes-domain.md) | 0 / 0 / 6      |
| `eval`                | [eval.md](eval.md)                               | 0 / 0 / 3      |
| `langflower-mcp`      | [langflower-mcp.md](langflower-mcp.md)           | 0 / 0 / 5      |
| `websocket-bridge`    | [websocket-bridge.md](websocket-bridge.md)       | 0 / 0 / 8      |
| `server-bridge`       | [server-bridge.md](server-bridge.md)             | 0 / 1 / 7      |
| `server-core`         | [server-core.md](server-core.md)                 | 0 / 1 / 5      |
| `ui-editor`           | [ui-editor.md](ui-editor.md)                     | 0 / 0 / 6      |
| `ui-sidebar-feed`     | [ui-sidebar-feed.md](ui-sidebar-feed.md)         | 0 / 2 / 4      |
| `ui-services`         | [ui-services.md](ui-services.md)                 | 0 / 1 / 3      |
| `ui-rest`             | [ui-rest.md](ui-rest.md)                         | 0 / 1 / 8      |
| `cli`                 | [cli.md](cli.md)                                 | 0 / 0 / 3      |
| `integration-tests`   | [integration-tests.md](integration-tests.md)     | 0 / 2 / 4      |

**Totals (open):** Critical=0 · Important≈21 · Suggestion≈85

Prior drain fixes (permission gate, bypass identity, fan-out, hydrate/palette, ToolHandlerContext parity, mega-scenario split, MCP `seqAdvanced$`, etc.) were **re-verified in code**, not rubber-stamped.

## Cross-cutting themes

1. **Boundary twins without ADR exit criteria** — shared/tools wired-tool catalogs + `mcp-tool-id`; node-definitions ↔ tools ctx facades beyond `ToolHandlerContext` ([shared](shared.md), [tools](tools.md), [node-definitions](node-definitions.md)).
2. **UI feature-slice leaks** — canvas ↔ palette ↔ sidebar share components/services across sibling features ([ui-rest](ui-rest.md), [ui-sidebar-feed](ui-sidebar-feed.md)).
3. **False-ready / hot-bus races** — predicate-less WS waits; dual `runner.events$` subscribers; demand via `shareReplay` + incidental output subs ([shared](shared.md), [server-bridge](server-bridge.md), [common-nodes-ai](common-nodes-ai.md)).
4. **Docs–code honesty** — TESTING.md matrix vs `it.todo` scaffolds; stale runtime ADR paragraph ([integration-tests](integration-tests.md), [runtime](runtime.md)).
5. **Control flow in `tap` / constructor `.subscribe`** — run completion and UI drafts not in tagged folds ([runtime](runtime.md), [ui-services](ui-services.md)).
6. **Parallel / forked inventory assembly** — Review vs `assembleLlmAgentInventoryContext` ([common-nodes-ai](common-nodes-ai.md)).

## Priority table (open Important only)

| Sev       | Chunk                                     | Path                                | Issue                                      | Proposed fix                                           |
| --------- | ----------------------------------------- | ----------------------------------- | ------------------------------------------ | ------------------------------------------------------ |
| Important | [shared](shared.md)                       | `langflower.ts`                     | Re-export aggregator vs no-shim rule       | Subpath exports; ADR + removal milestone if temporary  |
| Important | [shared](shared.md)                       | `langflower-ws-waits.ts`            | Duplicate `requestWorkflowDelete*`         | Keep one; delete the other                             |
| Important | [shared](shared.md)                       | `langflower-ws-waits.ts`            | Predicate-less save/list waits             | Filter on mutation evidence / shared wait composer     |
| Important | [shared](shared.md)                       | `requestWorkflowLoadSnapshot`       | Documented multi-tab race                  | Optional predicate; prefer filtered load helper        |
| Important | [shared](shared.md)                       | `resolve-wired-tool-options.ts`     | Tool catalog twin, no ADR exit             | Owner in tools + ADR / keep parity gate                |
| Important | [node-definitions](node-definitions.md)   | `define-reactive-node.ts`           | Dual probe + instance `bind`               | Documented; structural metas later                     |
| Important | [node-definitions](node-definitions.md)   | `kb-context.ts` (+ twins)           | Ctx facades without full parity            | Parity tests per facade; ADR-014 exit                  |
| Important | [node-definitions](node-definitions.md)   | `types.ts` bind contract            | Wrong ctx type / “once at define” comment  | Align with `StatefulConnection` + dual-bind            |
| Important | [runtime](runtime.md)                     | `packages/runtime/ADR.md`           | Stale “not production” paragraph           | Mark superseded; server on `RuntimeFacade`             |
| Important | [runtime](runtime.md)                     | `runtime-runner.ts` `tapOutputPort` | `finishRun` inside `tap`                   | Telemetry-only `tap`; completion on named edge         |
| Important | [tools](tools.md)                         | `mcp-tool-id` / wired catalogs      | Twins without ADR exit criteria            | Extend ADR-014 (or new ADR)                            |
| Important | [common-nodes-ai](common-nodes-ai.md)     | `review/node.ts` inventory          | Fork vs `assembleLlmAgentInventoryContext` | Reuse shared assembler                                 |
| Important | [common-nodes-ai](common-nodes-ai.md)     | `createLlmSessionCycle$`            | `shareReplay` demand = output subs         | Explicit demand port / document required outputs       |
| Important | [server-bridge](server-bridge.md)         | attach + wire-runner                | Dual `runner.events$` subscribers          | One composer: forward then checkpoint                  |
| Important | [server-core](server-core.md)             | `defaultResolveDefinition`          | Ignores `params` in resolver               | Use `{ type, params }` in server + common-nodes        |
| Important | [ui-sidebar-feed](ui-sidebar-feed.md)     | `lf-inspector-panel`                | Imports canvas `LfInlineField`             | Promote to `app/components/`                           |
| Important | [ui-sidebar-feed](ui-sidebar-feed.md)     | `lf-work-log-panel`                 | Injects canvas preview service             | Promote to `app/services/`                             |
| Important | [ui-services](ui-services.md)             | `workflow-execution.service.ts`     | Constructor `.subscribe` for drafts        | Tagged actions into folds                              |
| Important | [ui-rest](ui-rest.md)                     | canvas ↔ palette                    | Bidirectional feature imports              | Shared primitives under `app/components/` / `diagram/` |
| Important | [integration-tests](integration-tests.md) | `execute-*.ws.test.ts`              | Matrix claims vs `it.todo` only            | Implement runtime asserts or mark scaffold-only        |
| Important | [integration-tests](integration-tests.md) | `docs/TESTING.md`                   | Obsolete tree / REST examples              | Rewrite to current `ws/` harness                       |

## Deduplicated recommendations

1. **ADR for boundary twins** — document shared↔tools (and node-definitions↔tools) twins with owner + parity tests + “no exit unless DAG changes”.
2. **Promote shared UI primitives** — one move of inline-field / static port-row / drag MIME / `NodePreviewValuesService` fixes three Important slice leaks.
3. **WS wait composer** — predicate-first waits; delete duplicate delete helpers; optional predicate on load-snapshot.
4. **Single runner-events wiring** — one server subscribe path (telemetry + checkpoint observe).
5. **Honesty docs pass** — TESTING.md matrix + runtime ADR stale paragraph.
6. **Demand / tap hygiene** — Review inventory reuse; explicit LLM demand; `finishRun` out of `tap`; UI draft folds without constructor subscribe.
7. **Resolver params** — honor `params` in default + common-nodes resolve before per-instance ports land.

## Suggested fix order

1. **Small safe wins** — delete duplicate `requestWorkflowDeleteSnapshot`; fix runtime ADR stale prose; rewrite TESTING.md tree; align `types.ts` bind comment/type.
2. **UI slice hygiene** — promote shared components/services (unblocks sidebar + palette + canvas).
3. **Hot-bus / wait / events** — wait predicates; single `events$` composer; document or fix LLM `shareReplay` demand.
4. **Inventory + resolver** — Review reuses assembler; resolver uses `params`.
5. **ADR / larger** — twin-type ADR; dual-bind structural split; `finishRun` out of `tap` (needs careful ordering tests).

## Chunk index

- [shared](shared.md) — Critical=0 Important=5 Suggestion=3
- [node-definitions](node-definitions.md) — Critical=0 Important=3 Suggestion=4
- [runtime](runtime.md) — Critical=0 Important=2 Suggestion=5
- [tools](tools.md) — Critical=0 Important=1 Suggestion=6
- [common-nodes-ai](common-nodes-ai.md) — Critical=0 Important=2 Suggestion=5
- [common-nodes-domain](common-nodes-domain.md) — Critical=0 Important=0 Suggestion=6
- [eval](eval.md) — Critical=0 Important=0 Suggestion=3
- [langflower-mcp](langflower-mcp.md) — Critical=0 Important=0 Suggestion=5
- [websocket-bridge](websocket-bridge.md) — Critical=0 Important=0 Suggestion=8
- [server-bridge](server-bridge.md) — Critical=0 Important=1 Suggestion=7
- [server-core](server-core.md) — Critical=0 Important=1 Suggestion=5
- [ui-editor](ui-editor.md) — Critical=0 Important=0 Suggestion=6
- [ui-sidebar-feed](ui-sidebar-feed.md) — Critical=0 Important=2 Suggestion=4
- [ui-services](ui-services.md) — Critical=0 Important=1 Suggestion=3
- [ui-rest](ui-rest.md) — Critical=0 Important=1 Suggestion=8
- [cli](cli.md) — Critical=0 Important=0 Suggestion=3
- [integration-tests](integration-tests.md) — Critical=0 Important=2 Suggestion=4
