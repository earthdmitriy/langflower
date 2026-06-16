# Code regression — node-definitions

## Meta

- Paths: `packages/node-sdk/src/`
- Date: 2026-07-22
- Coverage: All 25 files under `src/` (2 factory folders, 9 author samples, ctx facades, IO/UI helpers). Deep read of `define-reactive-node.ts`, `types.ts`, `io-helpers.ts`, `ui-schema-inference.ts`, `tool-registration.ts`, `define-tool-registrations.ts`, `project-harness.ts`, `kb-context.ts` (+ crawl/memory/chat/hitl headers); unit tests spot-checked (`define-reactive-node.test.ts`, `define-tool-registrations.test.ts`); cross-package parity lock in `packages/tools/src/domain/tool-handler-context.parity.types.test.ts`; `package.json` exports, `tsconfig.json`, and `AGENTS.md` re-read against `src/`. KB curation union fields not re-audited field-by-field.

## Principles check

- **No barrels (`index.ts`)** — PASS. Published via `package.json` `exports` only; main entry `define-reactive-node.ts` re-exports sibling factory/types by design (documented in package AGENTS).
- **`type` not `interface`** — PASS across `src/`.
- **Arrow functions** — soft FAIL. Public helpers still use `function`: `makeInput`, `configureOutput` (`io-helpers.ts` ~122, ~212); `defaultParamsFromUiSchema`, `createTypedUISchema` (`ui-schema-inference.ts` ~66, ~76).
- **Immutability / prepare-then-mutate** — soft FAIL. `getInstance` builds `inputs`/`outputs` maps via `reduce` with in-place accumulator assignment (`define-reactive-node.ts` ~184–198).
- **RxJS folds / `withLatestFrom`** — PASS in production `src` (no `withLatestFrom`, no `.subscribe`). Author samples now use `combineInputs` (no raw `combineLatest` / `startWith`).
- **Thin server** — N/A (author SDK). Ctx facades (`ExecutionContext`, harness/KB/crawl/memory) correctly live here; server injects implementations.
- **Feature-sliced / factory folders** — PASS. One folder per factory (`define-reactive-node/`, `define-tool-registrations/`).
- **Composer entry points** — PASS. Factories are single-entry; no hidden A→B→C orchestration chains.
- **Dead / obsolete parallel APIs** — PASS (re-verified). No `withNodeId`, `extractReactiveNodeDefinition`, `makeMultiSlotInput`, `ReactiveRuntimeNode`, `bindRuntimeNode`, or `paramsFromUISchema` under `src/`. Package AGENTS matches current exports.

## FOUND_BUGS signals

- **BUG-2026-07-21d** (passthrough / demand-driving outputs) — HITL sample keeps wired `prompt` via `configureOutput(..., question, { inferTypeFrom: question })` and `promptFrom: 'prompt'` (`hitl-node.ts` ~37–38, ~26). SDK teaches correct pattern; risk is author copy-paste elsewhere, not SDK code.
- **BUG-2026-07-19** (`defaultValue` ≠ cycle primer when wired) — `InputParams.defaultValue` remains author-facing (`io-helpers.ts` ~96); runtime owns wired-vs-unwired semantics. Samples use `defaultValue` on optional ports (`agent-node.ts` ~34) without implying feedback loops.
- **BUG-2026-07-15c** (merge fan-in / `@rx-evo` API) — `multi: 'merge' | 'combine'` on `makeInput` (`io-helpers.ts` ~94); join sample uses `'combine'` (`join-node.ts` ~13); factory test covers `'merge'` (`define-reactive-node.test.ts` ~107–131).
- **BUG-2026-07-20 / BUG-2026-07-22b** (bypass slot identity) — router sample declares `bypassPorts` only (`router-node.ts` ~13); resume keying is runtime-owned — no recurrence in this chunk.
- **BUG-2026-07-12b** (default on connected port) — same boundary as BUG-2026-07-19; not implemented here.

## Glue / adapters / parallel types

- No `*Adapter` / `*Mapper` / rename-only shim files in `src/`.
- **`combineInputs`** — alias of `combineStatefulObservables` in `bindHelpers` (`define-reactive-node.ts` ~97–101); author-facing name, not field-reshuffle glue. Acceptable.
- **Intentional structural mirrors (ADR-014):** `ProjectHarness`, `KbContext`, `CrawlContext`, `MemoryContext`, `WebFetch*`, and nested KB curation shapes are redefined in `@langflower/tools` (“structural match for node-definitions …”; tools must not depend on node-definitions).
- **Parity lock (partial):** `ToolHandlerContext` bidirectional assignability is compile-time locked (`packages/tools/src/domain/tool-handler-context.parity.types.test.ts`). **Exit-criteria gap:** `KbContext` (+ nested packet types), `CrawlContext`, `MemoryContext`, and `ProjectHarness` / `Harness` twins have no equivalent parity tests — drift risk remains on KB curation APIs especially (`kb-context.ts` vs `packages/tools/src/kb/create-kb-context.ts`).

## Streamlining & simplifications

- Add compile-time parity tests for `KbContext`, `CrawlContext`, `MemoryContext`, and `ProjectHarness` ↔ tools twins (mirror `tool-handler-context.parity.types.test.ts` pattern).
- Fix `DefinedReactiveNodeConfig.bind` ctx type to match runtime (`StatefulConnection`, not `StatefulObservable`) and update stale “once at define time” comment (`types.ts` ~86–88).
- Convert `function` helpers to `const` arrows (`io-helpers.ts`, `ui-schema-inference.ts`).
- Replace mutable `reduce` accumulators in `getInstance` with immutable `Object.fromEntries` build (`define-reactive-node.ts` ~184–198).
- Narrow sample `ec.params as …` casts using inferred `ExecutionContext<UI>` once `uiSchema` is `as const` (`join-node.ts`, `combine-node.ts`, `agent-node.ts`).
- Long-term: declarative port descriptors to eliminate probe + instance dual `bind` (API change; documented as deferred in AGENTS).

## Design-flaw fixes

1. **Probe bind vs instance bind** — Still runs `config.bind` twice (define-time probe for metas, per-`getInstance()` live graph). Now honestly documented in factory JSDoc + AGENTS. **Direction:** structural split (declarative metas without probe wiring) when API migration is acceptable.
2. **Structural ctx type dual ownership** — Author SDK owns facade types; tools re-implements them for zero dependency (ADR-014). **Direction:** extend parity locks to all facade twins; ADR exit criteria should name either a tiny shared contracts package or a one-way type-only import — not only `ToolHandlerContext`.
3. **Author contract type drift in `types.ts`** — Bind callback documents `StatefulObservable` ctx and “wire once at define time” while implementation passes `StatefulConnection` and re-binds per instance. **Direction:** align types/comments with dual-bind reality so authors and tsc catch misuse.

## Findings

1. **Severity:** Important — **documented; structural fix deferred**  
   **Path / symbol:** `define-reactive-node.ts` — probe `config.bind` (~132–135) + `getInstance` → `config.bind` (~181–182)  
   **Problem:** Bind executes at least twice per definition lifecycle. Side-effectful or stateful `bind` bodies would run on discarded probe wiring and again per instance.  
   **Proposed fix:** Keep “bind must be pure” rule (now in JSDoc/AGENTS). Long-term: declarative port metas without probe execution.

2. **Severity:** Important — **partial parity only**  
   **Path / symbol:** `kb-context.ts` — `KbContext` (+ nested types); mirrored in `packages/tools/src/kb/create-kb-context.ts`; compare `crawl-context.ts`, `memory-context.ts`, `project-harness.ts` ↔ tools twins  
   **Problem:** Large parallel type trees without compile-time equality lock beyond `ToolHandlerContext`. Silent field/signature drift breaks injected ctx at runtime.  
   **Proposed fix:** Add bidirectional `assertTypeEqual` parity tests per facade (start with `KbContext`); document ADR-014 exit criteria for deleting duplicates.

3. **Severity:** Important  
   **Path / symbol:** `types.ts` — `DefinedReactiveNodeConfig.bind` (~86–94)  
   **Problem:** Comment says “Wire inputs/outputs once at define time”; ctx parameter typed as `StatefulObservable` while `defineReactiveNode` passes `StatefulConnection` from `statefulConnection()`. Misleading author contract.  
   **Proposed fix:** Type `ctx` as `StatefulConnection<ExecutionContext<UI>, …>` (or shared bind-ctx alias); comment = probe + per-instance bind.

4. **Severity:** Suggestion  
   **Path / symbol:** `io-helpers.ts` — `makeInput`, `configureOutput`, private guards; `ui-schema-inference.ts` — `defaultParamsFromUiSchema`, `createTypedUISchema`  
   **Problem:** `function` declarations vs workspace style (arrow-only).  
   **Proposed fix:** Convert to `const … = (…) =>`.

5. **Severity:** Suggestion  
   **Path / symbol:** `define-reactive-node.ts` — `getInstance` `inputs`/`outputs` `reduce` (~184–198)  
   **Problem:** In-place accumulator mutation; principles prefer prepare-then-assign.  
   **Proposed fix:** Build via spread/`Object.fromEntries` over mapped entries plus context entry.

6. **Severity:** Suggestion  
   **Path / symbol:** `io-helpers.ts` — `resolveInferTypeFromName` (~200–202); samples casting `ec.params as …` (`join-node.ts` ~18–20, `combine-node.ts` ~25, `agent-node.ts` ~48–50)  
   **Problem:** Defensive `as` where generics on `ExecutionContext<UI>` / `inferTypeFrom` could narrow.  
   **Proposed fix:** Type-guard or use inferred `ec.params.separator` etc. when `uiSchema` is `as const`.

7. **Severity:** Suggestion  
   **Path / symbol:** `test/samples/agent-node.ts` — `emitDraftDeltas` (~8–15)  
   **Problem:** Uses `new Observable(...)` inside `statefulObservable` loader; AGENTS discourages bare `Observable` in bind paths except test harness.  
   **Proposed fix:** Replace with `from(deltas)` or inline `statefulObservable`/`of` pattern for copy-paste consistency.

## Non-issues / looked OK

- Re-verified fixes from prior run: `paramsFromUISchema` removed; join sample `multi: 'combine'`; delay/agent samples use `combineInputs`; samples included in package `tsc` (only `*.test.ts` excluded); AGENTS matches `src/`; `ToolHandlerContext` parity test in tools.
- No `index.ts`; no `export * from` aggregators; no forbidden `withLatestFrom` or `.subscribe` in production `src`.
- `defineToolRegistrations` is a thin purpose utility atop `defineReactiveNode`, not glue (ADR-019).
- IO helpers (`configureOutput` passthrough / `inferTypeFrom`, multiline layout) are colocated and purposeful.
- Factory folder layout and package DAG boundary (no `@langflower/shared`) are correct.
- HITL sample preserves demand-driving `prompt` passthrough (BUG-2026-07-21d class).
- `ExecutionContext` optional injection surface matches thin-server composition model.

## Status

report path: `d:\Win\Projects\langflower\docs\code-regression\node-definitions.md`  
counts: Critical=0 Important=3 Suggestion=4
