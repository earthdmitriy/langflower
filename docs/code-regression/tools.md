# Code regression — tools

## Meta

- Paths: `packages/tools/src/`
- Date: 2026-07-22
- Coverage: Representative sample (~40 non-test modules under `src/`). Read in depth: `permission.ts`, `gate-tool-call.ts`, `harness-types.ts`, `create-project-harness.ts`, `builtins/catalog.ts` + `types.ts` + `fence.ts` + sample builtins (`read`, `bash`), `domain/domain-tool-configs.ts` + `args.ts` + `html.ts` + `run-bfs-crawl.ts`, `mcp/{create-mcp-runtime,wrap-harness-with-mcp,mcp-tool-id,mcp-stdio-client}.ts`, `path-sandbox.ts`, `ssrf-guard.ts`, `create-web-fetch.ts`, `kb/{create-kb-context,kb-store,kb-curation}` (partial), `create-crawl-context.ts`, `create-memory-context.ts`, `post-process.ts`. Skimmed remaining builtins, `gitignore.ts`, parity tests. Cross-checked `authorize` wiring via `packages/common-nodes/src/ai/inventory-tool-round.ts` (out of chunk, gate ownership only). No RxJS in this package.

## Principles check

- **Thin server / package boundary — PASS.** Project I/O, SSRF, KB/crawl/memory stores, MCP stdio, builtin harness, and domain tool configs live here per `AGENTS.md` / ADR-014. Production code imports only `undici` + Node built-ins; no `@langflower/server`, `shared`, `common-nodes`, or `node-definitions` (test-only relative imports for parity).
- **No barrels (`index.ts`) — PASS.** No `index.ts` under `packages/tools/`; public API via concrete `package.json` `exports` paths.
- **`type` not `interface`; arrow functions — PASS.** Sampled modules use `type` + `const` arrows; no `function` declarations or `interface` in production `src/`.
- **Composer entry points — PASS.** `builtins/catalog.ts` lists builtin order; `createProjectHarness`, `createMcpRuntime`, `wrapHarnessWithMcp`, and domain configs compose steps explicitly.
- **Feature-sliced / colocation — PASS.** Builtins under `builtins/<id>/tool.ts`; domain / MCP / KB slices are clear.
- **Immutability — PASS (edge OK).** Session `grants` `Set`, crawl sequence counter, and BFS queue mutate in-process at I/O edges; returned domain values are new objects/strings.
- **No adapters / glue (default) — MIXED (managed).** Intentional structural mirrors of node-definitions types (no shared dep) are documented inline. Cross-package **boundary twins** (`mcp-tool-id`, wired-tool inspector catalogs in shared) are parity-tested but lack a dedicated ADR exit criteria (see finding 7). In-package duplication largely consolidated (`harness-types.ts`, `gate-tool-call.ts`).
- **Delete obsolete / single API — PASS (2026-07-22 fixes hold).** Permission gate now runs before `registration.handler`; harness type duplication removed; permission re-exports dropped from `create-project-harness.ts`.
- **Prepare-then-mutate — PASS** in sampled builtins/KB paths.
- **RxJS / `withLatestFrom` — N/A.**

## FOUND_BUGS signals

- **BUG-2026-07-19b** (_Inventory filtering ≠ execution gate_) — **fixed for builtins**; domain/MCP handlers now gated via `Harness.authorize` before `registration.handler` in `inventory-tool-round.ts`. Builtin path still uses `harness.invoke`, which gates internally in `create-project-harness.ts`.
- **BUG-2026-07-19c** (_Brace globs never matched_) — **preset fixed**; **residual risk** in user/project `permission` jsonc: `matchPermissionPattern` still treats `{` literally (finding 8).
- **BUG-2026-07-19d**, UI/reactive/WS bugs — **none** applicable to this chunk.

## Glue / adapters / parallel types

- **Intentional structural typing (not glue):** `ToolHandlerContext`, `Harness`, `WebFetch*`, `CrawlContext`, `KbContext` comments document structural match for node-definitions; required because tools must not import node-definitions. Bidirectional compile-time lock exists for `ToolHandlerContext` only (`domain/tool-handler-context.parity.types.test.ts`).
- **Consolidated in-package (2026-07-22):** `harness-types.ts` owns `ToolInvoke*`, `BuiltinToolRegistration`, `Harness`; `gate-tool-call.ts` owns shared permission sequencing.
- **Cross-package boundary twins (forced by DAG):** `mcp/mcp-tool-id.ts` (owner) ↔ `packages/shared/.../mcp-tool-id.ts`; domain/builtin tool ids ↔ `resolve-wired-tool-options` in shared. Parity tests: `mcp-tool-id.parity.test.ts`, `wired-tool-options.parity.test.ts`. Not field-reshuffle glue; still a drift surface without ADR exit criteria.
- **Thin composer, not adapter:** `wrapHarnessWithMcp` — routes MCP vs builtin invoke/authorize; appropriate.
- **Minor re-export surfaces:** `create-project-harness.ts`, `create-mcp-runtime.ts`, `builtins/catalog.ts`, `builtins/types.ts` re-export subsets of `harness-types` / permission types — convenience for importers, not reshaping logic.

## Streamlining & simplifications

- Merge `builtins/args.ts` and `domain/args.ts` (domain `asNumber` also parses numeric strings).
- Drop unused `readonly string[]` overload on `resolveProjectPath` — all call sites use `PathFenceOptions` via `fenceOptions(ctx)`.
- Add compile-time parity tests for `Harness`/`ProjectHarness`, `KbContext`, `CrawlContext`, `MemoryContext` (mirror `ToolHandlerContext` pattern).
- Surface MCP connect failures instead of silent `catch` in `createMcpRuntime`.
- Consolidate `parseMergePacket` / duplicate-packet parsing in `kb-curation.ts` behind one type-guard parser.

## Design-flaw fixes

1. **Permission ownership split — addressed (2026-07-22).** `ProjectHarness.authorize` + `gateToolCall`; tool loop calls `authorize` before `registration.handler`; MCP wrap delegates authorize by tool id kind.
2. **Duplicate gate sequencing — addressed (2026-07-22).** Single `gateToolCall`; MCP uses `permissionDetailForMcpCall` + `whenMissingToolConfig: 'ask'`.
3. **Parallel harness invoke types — addressed (2026-07-22).** `harness-types.ts`.
4. **MCP permission detail collapsed — addressed (2026-07-22).** `permissionDetailForMcpCall`.
5. **SSRF check-then-fetch TOCTOU — addressed (2026-07-22).** `SafeFetchTarget.pinnedAddresses` + undici `Agent` lookup pin; per-hop re-validate on redirects.
6. **Brace globs (BUG-2026-07-19c residual):** implement brace expansion or reject/warn on `{` at config validation.
7. **Boundary twins:** add ADR subsection (or extend ADR-014) with why shared↔tools twins exist and exit criteria (e.g. shared may never import tools → permanent parity tests).

## Findings

1. **Severity:** Critical — **addressed (re-verified 2026-07-22)**  
   **Path / symbol:** `create-project-harness.ts` (`authorize`, `gate`); `domain/domain-tool-configs.ts` handlers; consumer `packages/common-nodes/src/ai/inventory-tool-round.ts` (`authorize` before `registration.handler`)  
   **Problem:** Domain tool ids had ask/deny defaults in `DEFAULT_PERMISSION_CONFIG` but handler invoke skipped permission resolution.  
   **Status:** Fixed — missing `authorize` fails closed; domain/MCP calls gate before handler.

2. **Severity:** Important — **addressed (re-verified 2026-07-22)**  
   **Path / symbol:** `gate-tool-call.ts` (`gateToolCall`, `deniedToolResult`); `create-project-harness.ts`; `mcp/create-mcp-runtime.ts`  
   **Problem:** Near-duplicate permission ask/grant/deny sequencing.  
   **Status:** Single `gateToolCall` shared by harness and MCP runtime.

3. **Severity:** Important — **addressed (re-verified 2026-07-22)**  
   **Path / symbol:** `harness-types.ts` (`ToolInvokeCall`, `ToolInvokeResult`, `BuiltinToolRegistration`, `Harness`)  
   **Problem:** Parallel invoke/registration types across builtins/MCP/wrap.  
   **Status:** Consolidated; MCP-local duplicates removed.

4. **Severity:** Important — **addressed (re-verified 2026-07-22)**  
   **Path / symbol:** `mcp/mcp-tool-id.ts` (owner); `packages/shared/src/langflower-config/mcp-tool-id.ts` (twin); `mcp/mcp-tool-id.parity.test.ts`  
   **Problem:** Manual sync risk for MCP inventory ids across packages.  
   **Status:** Owner documented; parity test asserts encode/parse/`is*` equality; common-nodes third copy removed.

5. **Severity:** Important — **addressed (re-verified 2026-07-22)**  
   **Path / symbol:** `permission.ts` (`permissionDetailForMcpCall`); `mcp/create-mcp-runtime.ts` (`gate`)  
   **Problem:** MCP grants collapsed to undifferentiated detail.  
   **Status:** Detail includes remote name + path/url/key or JSON args digest; grant key uses that detail.

6. **Severity:** Important — **addressed (re-verified 2026-07-22)**  
   **Path / symbol:** `ssrf-guard.ts` (`SafeFetchTarget`, `assertUrlSafeForFetch`); `create-web-fetch.ts` (`fetchPinned`)  
   **Problem:** DNS rebinding between SSRF check and TCP connect.  
   **Status:** Pinned addresses + undici Agent lookup override on default fetch path.

7. **Severity:** Important  
   **Path / symbol:** `mcp/mcp-tool-id.ts`; `domain/wired-tool-options.parity.test.ts` ↔ `packages/shared/src/langflower-config/resolve-wired-tool-options.js`  
   **Problem:** PRINCIPLES § No adapters requires ADR + exit criteria for unavoidable cross-package twins; twins are parity-tested but only documented in module comments / `AGENTS.md`, not ADR.  
   **Proposed fix:** Extend ADR-014 (or new ADR) stating DAG rationale, owner package, parity test location, and explicit “no exit unless dependency direction changes” criteria.

8. **Severity:** Suggestion  
   **Path / symbol:** `permission.ts` (`matchPermissionPattern`)  
   **Problem:** Residual BUG-2026-07-19c — no `{a,b}` brace expansion; user jsonc patterns with braces silently fail to match.  
   **Proposed fix:** Implement braces or reject `{` at config load with a clear error.

9. **Severity:** Suggestion  
   **Path / symbol:** `builtins/args.ts` vs `domain/args.ts` (`asNumber`, `asString`, `requireString`)  
   **Problem:** Duplicated helpers; domain `asNumber` coerces numeric strings, builtins do not — subtle divergence.  
   **Proposed fix:** One shared `src/args.ts` (or `builtins/args.ts` extended) imported by domain handlers.

10. **Severity:** Suggestion  
    **Path / symbol:** `path-sandbox.ts` (`resolveProjectPath`, `asPathFenceOptions`)  
    **Problem:** Dual signature `readonly string[] | PathFenceOptions` appears unused — all harness call sites pass `fenceOptions(ctx)`.  
    **Proposed fix:** Remove array overload after confirming no external consumers.

11. **Severity:** Suggestion  
    **Path / symbol:** `mcp/create-mcp-runtime.ts` connect loop (`catch { /* Fail closed… */ }`, ~L156)  
    **Problem:** Failed MCP server spawn is silent — empty inventory, no operator-visible error.  
    **Proposed fix:** Collect connection errors on runtime (e.g. `listConnectionErrors`) or log once at create.

12. **Severity:** Suggestion  
    **Path / symbol:** `kb/kb-curation.ts` (`detectContradictions` duplicate parsing ~L377–401; `parseMergePacket` ~L430–449)  
    **Problem:** Repeated `as KbDedupePacket` / kind checks; weak runtime validation before mutate.  
    **Proposed fix:** One type-guard parser returning `null` on mismatch.

13. **Severity:** Suggestion  
    **Path / symbol:** `create-memory-context.ts` (`MemoryContext`); `create-crawl-context.ts` (`CrawlContext`); `kb/create-kb-context.ts` (`KbContext`); contrast `domain/tool-handler-context.parity.types.test.ts`  
    **Problem:** Only `ToolHandlerContext` has bidirectional compile-time parity with node-definitions; other ctx facades rely on comments alone.  
    **Proposed fix:** Add `*.parity.types.test.ts` for remaining structural twins.

## Non-issues / looked OK

- Builtin catalog composer and per-tool colocation (`builtins/*/tool.ts`).
- Path fence + deny defaults (`.git/`, `node_modules/`, secrets) and `allowedRoots` model (`path-sandbox.ts`, `builtins/fence.ts`).
- SSRF hostname/IP blocklists, redirect re-validation, DNS pin via undici Agent.
- `post-process.ts` VM sandbox fail-closed (timeout, type, size caps).
- No `index.ts`, no `interface`, no `any`, no RxJS anti-patterns in production code.
- `wrapHarnessWithMcp` as minimal route composer — not a Mapper layer.
- Domain configs exporting handlers (ADR-019) — correct boundary; permission now wired via `authorize`.
- `permission.ts` re-export cleanup from harness — consumers use `@langflower/tools/permission`.
- Test-only imports of `common-nodes` / `node-definitions` / `shared` / `websocket-bridge` for parity and integration probes — acceptable, not production boundary violations.
