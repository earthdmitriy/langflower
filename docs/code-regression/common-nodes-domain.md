# Code regression — common-nodes-domain

## Meta

- Paths: `packages/common-nodes/src/crawl/`, `packages/common-nodes/src/kb/`, `packages/common-nodes/src/memory/`, `packages/common-nodes/src/obsidian/`, `packages/common-nodes/src/logic/`, `packages/common-nodes/src/flow/`
- Date: 2026-07-22
- Coverage: Re-verified all ~95 production modules in chunk (nodes, helpers, tool packs). Read in depth: crawl I/O + `crawl-tools`, KB I/O + curation + `kb-tools`, `memory` + `memory-tools`, Obsidian helpers/nodes, logic (`switch`, `if`, `gate`, `compare`, `assert`), flow (`router`, `merge`, `loop`, `map-collect-body`, `delay`, `checkpoint`), `resolve-workflow-node-definition.ts`. Cross-checked HTML/BFS ownership against `packages/tools/src/domain/{html,run-bfs-crawl,domain-tool-configs}.ts` (out of chunk, duplication only). Compared against prior report dated 2026-07-21.

## Principles check

- **Thin server / `ctx.*` I/O — PASS.** KB/memory/crawl graph nodes delegate to `ctx.kb`, `ctx.memory`, `ctx.harness.webFetch`, `ctx.crawl`; no store/SSRF/KB bodies under common-nodes. Tool packs import `*_TOOL_CONFIGS` only (ADR-019).
- **Authorize before handlers — PASS (chunk boundary).** Pack nodes attach imported `handler` on wire registrations; permission gating for builtins lives in `@langflower/tools` harness `authorize`/`invoke`. Domain tool invoke authorization is runtime/LLM-loop concern — not duplicated or bypassed in this chunk.
- **No barrels (`index.ts`) — PASS.** No `index.ts` under chunk paths; `crawl/html/` removed; graph nodes import `@langflower/tools/html` and `@langflower/tools/run-bfs-crawl` directly.
- **Crawl/BFS twins — PASS.** Single source: `@langflower/tools/html` + `@langflower/tools/run-bfs-crawl`; graph `common-crawl` and agent `crawl_bfs` share `runBfsCrawl`.
- **Feature-sliced colocation — PASS.** One folder per domain capability; pure helpers beside consumers (`evaluate-compare`, `wikilinks`, `frontmatter`, `map-collect-body`, `parse-string-list`).
- **Reactive bind patterns — PASS.** Sampled nodes use `combineInputs` / `pipeValue` / `configureOutput`; no raw `combineLatest`, no `withLatestFrom`, no production `.subscribe` state mutation.
- **Type ownership — PASS.** Locals use `type`; no `@langflower/shared` imports; runtime contracts come from `@langflower/node-sdk` / `@langflower/runtime`.
- **Composer / resolve — PASS.** `resolveWorkflowNodeDefinition` is honestly type-only lookup (`{ type }` → `getCommonReactiveNode`). Switch clamps panel outputs to static ports; Router is empty `bind` + `bypassPorts`.
- **No adapters / glue — PASS.** No `*Adapter`/`*Mapper`/`*Bridge` shims. Deleted canvas builders (`buildSwitchDefinitionFromParams`, `buildRouterDefinition`) stay gone.
- **Arrow functions — FAIL (minor).** `logic/switch/switch-rules.ts` still uses `export function` / `function matchesRegex`.
- **Delete obsolete code — PASS (prior cycle).** Stale builder exports removed; `flow/merge/node.ts` no longer destructures unused `combineInputs`.

## FOUND_BUGS signals

- **BUG-2026-07-15** (_Router bypass telemetry / connection strategy_) — **residual runtime risk**, not a defect in `flow/router/node.ts` (intentional empty `bind` + `bypassPorts: { ch: 'dynamic' }`). Wire chrome depends on runtime tapping bypass correctly.
- **BUG-2026-07-20** / **BUG-2026-07-22b** (_Bypass slot identity on resume_) — **recurrence watch** for Router→Delay (and any multi-slot bypass) graphs; slot key ownership is runtime/checkpoint, but Router is the author-facing multi-slot source (`ch` / `ch@n`).
- **BUG-2026-07-15c** (_Streaming fan-in / merge-of-`raw$` gap_) — **looked OK here:** `flow/merge/node.ts` uses `multi: 'merge'` passthrough; complexity remains in runtime/`@rx-evo`.
- **BUG-2026-07-14** (_pending subscription timing_) — cited in `flow/delay/node.ts` comments; node pattern is fine; debug `tap(console.log)` remains removed.
- **BUG-2026-07-19** / **BUG-2026-07-21d** (cycle primer / passthrough demand) — **watch** for `flow/loop` + `map-collect-body` external-body pacing; design is explicit (`asapScheduler`, dual `take(list.length)`) and tested — no new match beyond general reactive demand lessons.
- **BUG-2026-07-19b** (_Tool allowlist filtered inventory only_) — **out of chunk**; pack nodes correctly expose handlers; invoke-time allowlist is tools/runtime.
- UI session / feed / canvas DOM bugs — **none** in this chunk.

## Glue / adapters / parallel types

- **HTML + BFS:** consolidated under `@langflower/tools` — no parallel copy in common-nodes.
- **Tool packs:** thin `defineToolRegistrations` wrappers over `CRAWL_TOOL_CONFIGS` / `KB_TOOL_CONFIGS` / `MEMORY_TOOL_CONFIGS` — appropriate, not glue.
- **`ToolHandlerContext` (tools):** structural pick matching `ExecutionContext` fields — documented intentional alignment at tools boundary; common-nodes does not mirror it.
- **Wire-list normalizers (in-chunk):** three helpers with overlapping JSON/newline cases but different contracts — see Findings #2 (not full glue, but drift risk).
- **Duplicate regex helper:** `matchesRegex` in both `logic/switch/switch-rules.ts` and `logic/compare/evaluate-compare.ts` — local duplication, not cross-package adapter.
- **Stale doc folder:** `logic/router/NODE.md` claims implementation removed while live Router lives in `flow/router/node.ts` — doc drift, not a runtime adapter.

## Streamlining & simplifications

- Update or relocate `logic/router/NODE.md` to `flow/router/` (or delete the stale `logic/router/` folder) — implementation exists and is catalog-registered.
- Convert `switch-rules.ts` `function` declarations to arrows when next touching the file.
- Document or unify the three wire-list parsers (`parseStringList`, `normalizeLoopItems`, `parseLinkList`) if authors keep confusing KB delete vs Loop vs MOC inputs.
- Optionally extract shared `matchesRegex` only if a third consumer appears (YAGNI today).
- `memory/memory/node.ts`: unknown `op` panel value returns a plain string instead of `throwError` — align with Assert/KB strictness if product wants hard failure.

## Design-flaw fixes

1. ~~**Two sources of truth for crawl HTML/BFS**~~ — **addressed:** `@langflower/tools/html` + `@langflower/tools/run-bfs-crawl`.
2. ~~**Switch dynamic ports vs static runtime ports**~~ — **addressed:** live node clamps to `pass`/`fail`/`default` via `ALLOWED_SWITCH_OUTPUTS`; unknown panel outputs fall back to `default`.
3. ~~**Canvas builders + hollow `resolveWorkflowNodeDefinition`**~~ — **addressed:** builders deleted; resolver and docs are type-only lookup.
4. **Wire-list parser family:** three colocated normalizers with subtly different throw/fallback/delimiter rules — not a runtime bug today, but a future glue trap if a fourth copy appears for “generic list wire”. Prefer one documented contract or explicit per-node docs in NODE.md.

## Findings

1. **Severity:** Suggestion  
   **Path / symbol:** `logic/router/NODE.md` (footer: “Implementation removed”) vs `flow/router/node.ts` `routerNode`  
   **Problem:** Stale documentation under `logic/router/` contradicts the shipped Router (`common-router` in catalog, `bypassPorts` in `flow/router/`). Misleading for agents and palette docs.  
   **Proposed fix:** Move NODE.md to `flow/router/`, update body to reference live `defineReactiveNode` implementation, delete empty `logic/router/` folder.

2. **Severity:** Suggestion  
   **Path / symbol:** `kb/parse-string-list.ts` `parseStringList`; `flow/map-collect-body.ts` `normalizeLoopItems`; `obsidian/build-moc.ts` `parseLinkList`  
   **Problem:** Three wire-list normalizers with overlapping JSON-array / newline parsing but different semantics (strict throw vs soft `[]` fallback; commas in KB vs newlines in Loop; wikilink stripping in MOC). Easy to wire the wrong shape across KB Delete / Loop / Build MOC.  
   **Proposed fix:** Keep separate if contracts differ — add a short “wire list contracts” note to slice READMEs or NODE.md; extract shared core only with explicit options if a real fourth consumer appears.

3. **Severity:** Suggestion  
   **Path / symbol:** `logic/switch/switch-rules.ts` — `export function parseSwitchRules`, `export function resolveSwitchOutput`, `function matchesRegex`  
   **Problem:** Style principle prefers arrow functions; only remaining `function` declarations in this chunk’s production code.  
   **Proposed fix:** Convert to `const fn = (...) =>` when editing the module.

4. **Severity:** Suggestion  
   **Path / symbol:** `logic/switch/switch-rules.ts` `matchesRegex`; `logic/compare/evaluate-compare.ts` `matchesRegex`  
   **Problem:** Identical try/catch RegExp helper duplicated in two logic units.  
   **Proposed fix:** Inline is fine for two consumers; extract to a shared logic helper only if a third regex matcher appears (YAGNI).

5. **Severity:** Suggestion  
   **Path / symbol:** `kb/parse-string-list.ts` `parseStringList` — `JSON.parse(trimmed)` without try/catch (lines 13–18)  
   **Problem:** Malformed `[...` input on `kb-delete` `chunkIds` throws synchronously inside `combineInputs` (hard branch error). `parseLinkList` soft-falls back; `normalizeLoopItems` soft-falls back to newline split. Inconsistent operator experience for bad JSON.  
   **Proposed fix:** Either wrap with a clear `throw new Error('chunkIds: expected JSON array')` message, or soft-fallback to comma/newline split like `parseLinkList` — pick one KB contract and document it.

6. **Severity:** Suggestion  
   **Path / symbol:** `memory/memory/node.ts` — unknown `ec.params.op` branch returns `of(\`Unknown memory op …\`)` 
**Problem:** Invalid panel op yields a success-shaped string on`result`instead of failing the branch like Assert/KB nodes.  
**Proposed fix:** Return`throwError(() => new Error(...))` for unknown ops if strict harness gates are desired.

## Non-issues / looked OK

- KB/memory/crawl **tool pack** nodes are thin ADR-019 registrations — handlers imported from tools, not looked up by toolId.
- KB ingest/search/embed/list/delete/dedupe/contradict/apply-curation follow consistent `combineInputs` → `ctx.kb.*` → `JSON.stringify` thin-consumer pattern.
- Crawl fetch/extract/save/BFS nodes correctly use `@langflower/tools/html` or `run-bfs-crawl`; `fetch-url` uses `ctx.harness.webFetch` with explicit missing-capability errors.
- Obsidian frontmatter / wikilinks / MOC helpers are pure and colocated; nodes stay small.
- Logic `if` / `gate` / `assert` / `compare` are clear reactive branches; Switch static-port clamp prevents silent emission drop on custom output names.
- `flow/merge` passthrough + `multi: 'merge'` matches BUG-2026-07-15c fix direction.
- `flow/checkpoint` passthrough + `createCheckpoint: true` is minimal and correct for ADR-018.
- `flow/loop` + `map-collect-body` external-body pacing is intentional and commented; tests exist.
- `flow/delay` has no debug `tap`; `flow/merge` has no unused destructuring.
- `resolve-workflow-node-definition.ts` matches slim type-only contract.
- No `interface`, no `@langflower/shared` imports, no `withLatestFrom`, no forbidden barrels, no canvas builder glue in this chunk.

**Status: Critical=0 Important=0 Suggestion=6**
