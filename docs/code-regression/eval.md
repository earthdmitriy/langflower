# Code regression — eval

## Meta

- Paths: `packages/eval/src/`
- Date: 2026-07-22
- Coverage: Full package sample (5 production modules + 3 colocated tests). Read end-to-end: `eval-pack-types.ts`, `load-pack.ts`, `score-case.ts`, `load-skill-via-read.ts`, `run-eval-suite.ts`, `*.test.ts`. Cross-checked `package.json` exports vs repo importers (`packages/cli`, `vitest.config.mjs`, `packages/eval/AGENTS.md`, golden-sample fixture). No RxJS in this chunk — REACTIVITY.md N/A.

## Principles check

- **Package boundary / thin server — PASS.** Owns pack JSON, scorers, suite gate, skill `read` via harness; depends only on `@langflower/tools`. No server/UI/shared/common-nodes/LLM. `EvalCaseRunner` injected by callers (CLI Fake / replay) — matches AGENTS.md.
- **No barrels (`index.ts`) — PASS.** Concrete `package.json` exports only (`./load-pack`, `./run-eval-suite`); no `index.ts` under `packages/eval/`.
- **`type` not `interface`; arrow functions — PASS.** All symbols use `type` + `const` arrows; no `function` / `interface`.
- **Composer entry points — PASS.** `runEvalSuite` documents call order (load pack → skill → cases → score → gate) and composes sibling steps; steps do not chain into each other.
- **Feature-sliced / colocation — PASS.** Small vertical package; parsers next to loaders; tests beside code.
- **Domain types in shared — N/A (by design).** Pack types live in `eval-pack-types.ts` because this package must not depend on `@langflower/shared`; shapes are fixture-owned, not mirrors of workflow/runtime graphs.
- **Immutability / readonly — PASS.** Result types and pack models are `readonly`; scorers are pure.
- **Prepare-then-mutate — MIXED.** Suite aggregation builds new result objects; `loadReplayMap` mutates a local `out` map in a `for` loop; `runEvalSuite` accumulates with `push` inside a sequential `for` loop (acceptable for ordered async side effects).
- **Module exports with a consumer — PASS.** Public exports are `./load-pack` and `./run-eval-suite` only; `scoreCase` / `loadSkillViaRead` stay internal (relative imports). CLI consumes `loadEvalPack`, `loadReplayMap`, `runEvalSuite`, `createReplayCaseRunner`, and exported types from those two paths.
- **No adapters / glue — PASS.** No `*Adapter` / `*Mapper`; `createReplayCaseRunner` is a legitimate injected agent stub, not field-reshuffle glue.
- **Delete obsolete / parallel APIs — PASS.** Single load/run/score path; no legacy dual APIs.
- **RxJS / `withLatestFrom` — N/A.**

## FOUND_BUGS signals

- **none** that recur in this chunk. No UI/runtime/WS/HITL/reactive-port signals apply.
- Weak adjacency only: harness permission surface in `run-eval-suite.ts` (`allowReadPermission`) is broader than the sole `read` invoke — not the BUG-2026-07-19b inventory≠invoke class (invoke still goes through harness `gate`).

## Glue / adapters / parallel types

- **No unnecessary adapters.** Injection of `EvalCaseRunner` is the intended boundary (agent-under-test stays outside).
- **No parallel domain mirrors** of `@langflower/shared` workflow/runtime types; `EvalPack` / `EvalCase` / `EvalSuiteResult` are package-owned fixture contracts — appropriate.
- **Not glue:** `loadSkillViaRead` thin harness invoke wrapper (fail-closed on `!result.ok`) — real I/O edge, not a reshuffle shim.
- **ADR-backed adapters:** none in this package.

## Streamlining & simplifications

- Narrow `allowReadPermission` in `run-eval-suite.ts` to `read: allow` only (deny `glob`/`grep`) unless a future runner needs them via the same harness.
- Optional: rewrite `loadReplayMap` with prepare-then-build (`Object.fromEntries` after validating entries) instead of mutating `out` in a loop — tiny cleanup only.
- Do **not** extract a shared JSON-parse helper for the two try/catch blocks in `load-pack.ts` — duplication is smaller than a new abstraction (YAGNI).
- Optional: require non-empty `input` at parse time (product choice — only if all packs need input).
- Optional: document `loadReplayMap` in `packages/eval/AGENTS.md` § Public imports (CLI already imports it from `@langflower/eval/load-pack`).

## Design-flaw fixes

1. **Fail-closed gate assumes non-empty expectations.** **Addressed (2026-07-22).** `parseCase` rejects empty/missing/whitespace `expected`; `load-pack.test.ts` covers load failure. Prevents `includes` scorer from always scoring 1 via `String.prototype.includes('')`.
2. **Case identity is not a pack invariant.** **Addressed (2026-07-22).** `parsePack` throws on duplicate `cases[].id`; covered by test.
3. **Published API surface ahead of consumers.** **Addressed (2026-07-22).** Public exports match CLI importers (`load-pack`, `run-eval-suite` only).

## Findings

1. **Severity:** Suggestion  
   **Path / symbol:** `run-eval-suite.ts` `allowReadPermission` (L48–57)  
   **Problem:** Grants `glob`/`grep` allow while the package only invokes `read` for `skillPath`. Broader than least privilege for the default harness.  
   **Proposed fix:** Deny `glob`/`grep` (and keep edit/write/bash deny) unless a documented runner needs them on the injected harness.

2. **Severity:** Suggestion  
   **Path / symbol:** `load-pack.ts` `loadReplayMap` (L113–124)  
   **Problem:** Builds the map by mutating `out` inside a `for` loop instead of prepare-then-`Object.fromEntries`. Minor principles style nit at a pure parse edge.  
   **Proposed fix:** Validate entries first (throw on non-string values), then return `Object.fromEntries(...)`.

3. **Severity:** Suggestion  
   **Path / symbol:** `load-pack.ts` `parseCase` (`input` coercion, L14)  
   **Problem:** Missing/non-string `input` becomes `''` without error; Fake skill runner may then fail late with a match error instead of a pack-schema error.  
   **Proposed fix:** Optionally require non-empty `input` at parse time for clearer fail-closed pack validation (product choice — only if all packs need input).

## Non-issues / looked OK

- Boundary discipline: no agent/LLM/`runCase` implementation inside the package; CLI owns Fake / `--replay`.
- Composer `runEvalSuite` call-order JSDoc and flat step list.
- Pure binary scorers (`exact` / `includes`) + mean suite score + `suiteScore >= threshold` gate.
- Fail-closed skill load via harness `read` (`loadSkillViaRead` throws on `!ok`).
- Fail-closed replay runner (`createReplayCaseRunner` throws when case id missing from map).
- No `index.ts`, no `interface`, no `any`, no RxJS anti-patterns.
- Local pack types (not forced into `@langflower/shared`) given the no-shared dependency rule.
- `loadReplayMap` correctly exported from the public `./load-pack` module (CLI consumer); no orphan `package.json` export entries.
- Tests cover golden-sample pass/fail-closed, empty/duplicate pack validation, and scorer trim/`includes` basics.
- `createReplayCaseRunner` as injected offline agent — appropriate, not an adapter layer.

## Status

Critical=0 Important=0 Suggestion=3
