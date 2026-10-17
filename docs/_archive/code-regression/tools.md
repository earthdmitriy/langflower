# Code regression — tools

## Meta

- Paths: `packages/tools/src/`
- Date: 2026-09-20
- Mode: delta
- Coverage: Delta reconcile of all nine 2026-09-19 findings first. Re-read: `create-project-harness.ts`, `wrap-builtin-tool-handles.ts`, `harness-types.ts`, `gate-tool-call.ts`, `permission.ts` + `permission.test.ts`, `path-sandbox.ts`, `builtins/{catalog,types,args,walk-files,spawn-capture}.ts`, `builtins/bash/tool.ts`, `builtins/read/tool.ts`, `builtins/grep/{tool,search}.ts`, `memory/create-memory-store.ts`, `mcp/create-system-mcp-handles.ts` + test, `mcp/mcp-stdio-client.ts`, `mcp/mcp-http-client.ts`, `domain/{args,domain-tool-configs,wired-tool-options.parity}.ts`, `secrets/interpolate-placeholders.ts`, `ssrf-guard.ts`. ts-scan: `Harness.webFetch` (declaration only), `PermissionConfig`, `createSystemMcpHandles`, `matchPermissionPattern`. Spot-checked remaining builtins / crawl / files-context. Not a line-audit of every handler branch. Still 78 `.ts` files; no new production module since the previous report. No RxJS in this package.
- Previous report: 2026-09-19, Critical=0 Important=6 Suggestion=3 (old numbered list, no kebab ids except the two LEDGER rows)

## Previous findings (delta mode)

| id                                      | severity   | status     | evidence                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------- | ---------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tools-timeout-not-cancel` (was #1)     | Important  | fixed      | Closed 2026-09-20 — see LEDGER.                                                                                                                                                                                                                                                                                                                                                  |
| `tools-permission-brace-glob` (was #2)  | Suggestion | still-open | **Demoted from Important.** LEDGER perennial (2026-07-22, 2026-09-19): 2026-09-19 promotion had no mechanism. Matcher unchanged: `escapeRegExp` treats `{` / `}` as literals; `permission.test.ts` still has no brace case. Preset split (BUG-2026-07-19c fix) still holds. No new consumer, no repro, no code change.                                                           |
| `tools-mcp-config-skip-silent` (was #3) | Important  | fixed      | Closed 2026-09-20 — see LEDGER.                                                                                                                                                                                                                                                                                                                                                  |
| `tools-permission-config-twin` (was #5) | Suggestion | still-open | **Demoted from Important.** tools `PermissionConfig` / `PermissionDecision` still match shared `LangflowerPermissionConfig` / `LangflowerPermissionDecision`. ADR-039 table still omits the pair; no parity test. Lowered: the in-chunk fix is an ADR row + assignability test, not a runtime hole. common-nodes `ProjectPermissionConfig` stays out of this tree.               |
| `tools-args-asnumber-twin` (was #6)     | Suggestion | still-open | **Demoted from Important.** LEDGER perennial (2026-07-22, 2026-09-19): 2026-09-19 promotion had no mechanism. `builtins/args.ts` `asNumber` still requires `typeof === 'number'`; `domain/args.ts` still coerces numeric strings. `builtins/read/tool.ts` still uses the builtin helper for `startLine` / `endLine` / `offset` / `limit`. No new consumer / repro / code change. |
| `tools-harness-webfetch-dead` (was #7)  | Suggestion | still-open | `Harness.webFetch` still declared in `harness-types.ts`. ts-scan `find_references` on the field: declaration only. `createProjectHarness` still does not assign it. Fetch remains on `createWebFetch` / `ToolHandlerContext.webFetch`.                                                                                                                                           |

## Principles check

- **Thin server / package DAG — PASS.** Production `packages/tools/src/` imports `@langflower/node-sdk` + `undici` + Node built-ins. No production import of server, shared, common-nodes, or websocket-bridge. Test-only relative twins remain (parity). Matches `packages/tools/AGENTS.md`.
- **No barrels — PASS.** Zero `index.ts`. Public API is concrete `package.json` `exports`. `create-project-harness.ts` re-exports `wrapBuiltinToolHandles` as the documented published path.
- **`type` not `interface`; arrows — PASS.** Sampled production modules use `type` + `const` arrows. No `any`.
- **Composer entry points — PASS.** `builtins/catalog.ts` lists builtin order; `createProjectHarness` sequences fence ctx → permission merge → `gateToolCall` → `invokeBuiltin`; `createSystemMcpHandles` lists connect → `buildMcpHandle` → collect failures; `runGrepCascade` is `rg` → `grep` → Node walk.
- **Delete obsolete / single invoke path — FAIL (`dead-export`).** ADR-019 holds: `invoke` is builtins-only and fail-closed for unknown ids. Historical leftovers (`permissionDetailForMcpCall`, `whenMissingToolConfig`, `walkFiles` boolean overload, `resolveProjectPath` `string[]` overload) stay gone. Remaining: `Harness.webFetch` (ts-scan: declaration only).
- **No adapters without ADR — FAIL (`twin-without-adr`, Suggestion).** ADR-039 twins (wired-tool catalogs, secret-id, MCP server entries, stdio frame parse) still have gates or a structural comment. tools `PermissionConfig` ↔ shared `LangflowerPermissionConfig` is still missing from ADR-039 and has no parity test.
- **Immutability — PASS (I/O edge OK).** `grants` `Set`, crawl `sequence`, BFS/walk accumulators mutate at host edges; returned records are new objects.
- **Functional errors — PASS for MCP config skip.** Invalid id / missing server / empty command/url record `failures[]` (LEDGER `tools-mcp-config-skip-silent`, 2026-09-20). Harness invoke and interpolator already used Results.
- **RxJS / `withLatestFrom` — N/A.**

## FOUND_BUGS signals

- **BUG-2026-08-06** (timeout ≠ cancel; event-loop pin) — **bash + memory grep now honor abort** (LEDGER `tools-timeout-not-cancel`, 2026-09-20). Builtin `grep` / `spawnCapture` / `ask_user` already did. `bash` `spawn` takes `ctx.signal`; `searchGrep` has walk caps + abort.
- **BUG-2026-07-19b** (inventory filter ≠ invoke gate) — **does not recur for builtins.** `wrapBuiltinToolHandles` omits always-deny; `harness.invoke` still gates. Domain/MCP stay off the harness `toolId` map.
- **BUG-2026-07-19c** (brace globs never matched) — **matcher still lacks `{a,b}`.** Product fix (split presets) still holds. Residual user-authored `permission.write['**/*.{md,mdx}']` still matches the literal brace string. Kept as Suggestion (LEDGER: no promotion without a new mechanism).
- UI/WS/reactivity BUG-* — **none** apply.

## Glue / adapters / parallel types

- **Keep (ADR-039).** Do not add `tools → shared`.
    - Owner tools `BUILTIN_TOOL_IDS` / `CRAWL_TOOL_CONFIGS` / `MEMORY_TOOL_CONFIGS` ↔ shared inspector catalogs (`wired-tool-options.parity.test.ts`). `common-kb-tools` still absent — correct.
    - Twin tools `secrets/secret-id.ts` ↔ shared `langflower-config/secret-id.ts` (`secret-id.parity.test.ts`). Comment names ADR-039.
    - Twin tools `SystemMcpStdioEntry` / `SystemMcpHttpEntry` ↔ shared `LangflowerMcp*ServerConfig` (structural; ADR-039).
    - Twin tools `mcp-stdio-frame-parser.ts` ↔ mcp `mcp-stdio-framing.ts` (`mcp-stdio-frame-parser.parity.test.ts`). CRLF + LF still both accepted.
- **Not a twin — owner only.** `mcp-tool-id.ts` has no shared copy.
- **Missing ADR-039 row (Suggestion).** tools `PermissionConfig` / `PermissionDecision` ↔ shared `LangflowerPermissionConfig` / `LangflowerPermissionDecision`. Same shape, two names, no parity test.
- **Not glue — SDK identity vs tools host bag.** `ToolHandlerContext` re-declares `projectDir` / `runId` and adds host hooks. Bidirectional assignability locked by `tool-handler-context.parity.types.test.ts`.
- **Thin wrap, not a second registry.** `wrapBuiltinToolHandles` maps `Harness.invoke` Result → `ToolHandle.invoke` throw because SDK `ToolHandle` is `Promise<string>`.
- **Parallel helpers (not a DAG twin).** `builtins/args.ts` vs `domain/args.ts` `asNumber` — different coercion. Perennial Suggestion; not re-promoted.
- Same-package MCP JSON-RPC peel copies are not a listed class.

## Streamlining & simplifications

- Delete `Harness.webFetch` from `harness-types.ts` (`tools-harness-webfetch-dead`).

## Design-flaw fixes

none

## Findings

1. **id:** `tools-permission-brace-glob`
    - **class:** `found-bugs-recurrence`
    - **severity:** Suggestion
    - **first-seen:** 2026-07-22
    - **status:** open
    - **path:** `packages/tools/src/permission.ts` (`matchPermissionPattern`)
    - **evidence:** BUG-2026-07-19c was closed by splitting presets, not by implementing braces. `{` / `}` still go through `escapeRegExp`. LEDGER: do not re-promote without a repro / new consumer / code change.
    - **proposed fix:** Expand `{a,b}` in the matcher **or** reject brace patterns with an explicit deny message. Add a unit case in `permission.test.ts`.

2. **id:** `tools-permission-config-twin`
    - **class:** `twin-without-adr`
    - **severity:** Suggestion
    - **first-seen:** 2026-09-19
    - **status:** open
    - **path:** `packages/tools/src/permission.ts` (`PermissionConfig`, `PermissionDecision`); twin `packages/shared/src/types/langflower-config.ts` (`LangflowerPermissionConfig`)
    - **evidence:** Same permission map under two names. ADR-039 lists inspector catalogs / secret-id / MCP entries / frame parse / compile errors — not this pair. No parity test.
    - **proposed fix:** Add the tools↔shared row to ADR-039 + a structural/assignability test (do **not** add `tools → shared`). common-nodes copy is out of this chunk.

3. **id:** `tools-args-asnumber-twin`
    - **class:** `twin-without-adr`
    - **severity:** Suggestion
    - **first-seen:** 2026-07-22
    - **status:** open
    - **path:** `packages/tools/src/builtins/args.ts` (`asNumber`); `packages/tools/src/domain/args.ts` (`asNumber`); consumer `builtins/read/tool.ts`
    - **evidence:** Parallel helpers, different semantics. Domain accepts numeric strings; builtins require `typeof === 'number'`. LEDGER: do not re-promote without a mechanism. Unchanged since 2026-09-19.
    - **proposed fix:** One args module; keep string→number coercion. Point both builtin and domain call sites at it.

4. **id:** `tools-harness-webfetch-dead`
    - **class:** `dead-export`
    - **severity:** Suggestion
    - **first-seen:** 2026-09-19
    - **status:** open
    - **path:** `packages/tools/src/harness-types.ts` (`Harness.webFetch`)
    - **evidence:** ts-scan `find_references` on the field returns the declaration only. Comment still says “builtins + optional webFetch”. `createProjectHarness` never assigns it; nothing reads `harness.webFetch`.
    - **proposed fix:** Delete the optional field and the `WebFetch*` import from `harness-types.ts`.

## Non-issues / looked OK

- Historical leftovers stayed gone: `permissionDetailForMcpCall`, `whenMissingToolConfig`, `walkFiles(..., boolean)`, `resolveProjectPath` `string[]` overload, shared `mcp-tool-id.ts`, `KB_TOOL_CONFIGS` / `kb/` tree, `wrapHarnessWithMcp` / `createMcpRuntime`.
- ADR-019 harness registry: `invoke` refuses non-builtins; `listBuiltinRegistrations` is builtins only; domain configs attach `handler`.
- `wrapBuiltinToolHandles` always-deny omit + harness re-gate is the right BUG-2026-07-19b split.
- `ToolHandlerContext` SDK vs tools bag — intentional; parity test is the lock.
- Path fence + `allowedRoots` (`path-sandbox.ts`); SSRF pin + redirect re-check (`ssrf-guard.ts`, `create-web-fetch.ts`).
- `interpolatePlaceholders` returns Result and never echoes secret values.
- `createSystemMcpHandles` still records per-server connect/build/interpolate failures — only the pre-connect skips are weak.
- MCP handles are SDK `ToolHandle[]` via `buildMcpHandle` (ADR-026).
- `runBfsCrawl` is the single BFS. `create-project-files-context` is a permission-free fence for palette Text nodes — documented, not a second harness.
- LEDGER perennial `tools-permission-brace-glob` and `tools-args-asnumber-twin`: not re-promoted (no new mechanism).
- Same-package MCP result peel and leftover `permissionDetailForCall` branches: looked at, not filed.
- `wrap-builtin-tool-handles.ts` `as HostInvokeCtx`: cosmetic `as`, not filed.
- No `interface`, no production `any`, no `index.ts` barrels.
- No new listed-class findings: no new production files; 2026-09-20 tools commit only formalized leftover deletions the previous report already treated as gone.
