# Code regression — eval

## Meta

- Paths: `packages/eval/src/`
- Date: 2026-09-20
- Mode: delta
- Coverage: Full re-read of the same four production modules as 2026-09-19 (no new files; `load-skill-via-read.ts` still gone): `eval-pack-types.ts`, `load-pack.ts`, `score-case.ts`, `run-eval-suite.ts`. Colocated tests: `load-pack.test.ts`, `score-case.test.ts`, `run-eval-suite.test.ts`. ts-scan: `list_exports` of all four modules; `list_imports` of `run-eval-suite.ts`; `resolve_symbol` / `inspect` on `DEFAULT_PERMISSION_CONFIG`; `find_references` on `runEvalSuite`, `loadEvalPack`, `loadReplayMap`, `createReplayCaseRunner`, `EvalCaseRunner`, `EvalSuiteResult`, `EvalCaseResult`, `EvalCase` (owner graph missed CLI — consumers confirmed by reading `packages/cli/src/eval-command.ts`). Cross-checked only to reconcile: `packages/eval/package.json` exports, `packages/eval/AGENTS.md`, CLI Fake (`create-fake-skill-case-runner.ts`), golden-sample `tests/fixtures/eval/golden-sample/pack.json`. LEDGER has no eval Closed/Wontfix rows. No RxJS — REACTIVITY.md N/A.
- Previous report: 2026-09-19 — Critical=0 Important=1 Suggestion=2 (numbered items; kebab ids assigned here for ledger stability)

## Previous findings (delta mode)

| id                                | severity   | status     | evidence                                                                                                                                                                                                                                                                                                                  |
| --------------------------------- | ---------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `eval-parse-loose-input` (was #2) | Suggestion | still-open | `parseCase` still does `typeof row.input === 'string' ? row.input : ''` (`load-pack.ts` ~L14). Missing or non-string `input` becomes `''` with no throw. `expected` / duplicate ids stay fail-closed (`load-pack.test.ts`). Array pack/case still throw later (“non-empty id”) — fail-closed, not part of this class hit. |

## Principles check

- **Package boundary / thin server — PASS.** Owns pack JSON, binary scorers, suite mean + threshold gate, skill `read` via `@langflower/tools`. `list_imports` on `run-eval-suite.ts`: `node:path`, `create-project-harness`, `permission`, local modules. No server / UI / shared / common-nodes / LLM. Fake stays in CLI; live `runCase` stays injected.
- **No barrels (`index.ts`) — PASS.** `package.json` exports only `./load-pack` and `./run-eval-suite`. Zero `index.ts` under `packages/eval/`.
- **`type` not `interface`; arrow functions; no `any` — PASS.** All public and local symbols are `type` + `const` arrows.
- **Composer entry points — PASS.** `runEvalSuite` JSDoc still lists load pack → optional skill `read` → each `runCase` → score → aggregate → gate. Steps are siblings.
- **Export with a consumer — PASS.** CLI `eval-command.ts` imports `loadReplayMap`, `createReplayCaseRunner`, `runEvalSuite`, `EvalCaseRunner`, `EvalSuiteResult`. `scoreCase` is package-private (suite + test). `eval-pack-types.ts` is not a public export.
- **Delete obsolete / parallel APIs — PASS vs 2026-09-18 leftovers.** `EvalCaseRunner` has no `harness`. `RunEvalSuiteOptions` has no `harness` override. `load-skill-via-read.ts` is still deleted; `loadSkillViaRead` is module-local. Harness is created only when `pack.skillPath` is set and is not passed to runners.
- **No adapters / glue — PASS.** No `*Adapter` / `*Mapper`. `createReplayCaseRunner` is a pack-map lookup for `--replay` / CI, not field-reshuffle glue.
- **Functional errors — FAIL (`fail-open-io`, Suggestion).** Pack I/O `throw` into the CLI `catch` is an acceptable host edge. `parseCase` still coerces a missing or non-string `input` to `''` with no error (`eval-parse-loose-input`). Runner `throw` is fail-closed (visible CLI catch), not a listed class.
- **Immutability / readonly — PASS.** Pack and result types are `readonly`. `loadReplayMap` `out` and `caseResults.push` are local accumulators at parse / ordered-async edges.
- **Feature-sliced / colocation — PASS.** Small vertical package; tests beside code.
- **Domain types in shared — N/A (by design).** `EvalPack` / `EvalCase` / `EvalSuiteResult` are fixture-owned. Package must not depend on `@langflower/shared`.
- **RxJS / `withLatestFrom` — N/A.**

## FOUND_BUGS signals

- **BUG-2026-07-19b** (inventory filter ≠ invoke gate) — **does not recur.** Skill load is a single `harness.invoke({ toolId: 'read' })`. The harness is not handed to `runCase`. `skillReadPermission` denies glob / grep / edit / write / create / delete / bash / `ask_user`. Keys match today’s `DEFAULT_PERMISSION_CONFIG` (ts-scan / `permission.ts` L25–35). Eval itself never invokes those tools.
- **BUG-2026-07-28b / BUG-2026-07-23** (silent success-shaped snapshot) — **not the same mechanism.** `parseCase` input coerce is a fixture-field default, not a swallowed `{ ok: false }` bus/UI snapshot. Kept only as `fail-open-io` on the parser, not `found-bugs-recurrence`.
- UI / runtime / WS / HITL / reactive-port BUG-* — **none** apply.

## Glue / adapters / parallel types

none

## Streamlining & simplifications

none

## Design-flaw fixes

none

## Findings

1.  - id: `eval-parse-loose-input`

- class: fail-open-io
- severity: Suggestion
- first-seen: 2026-09-19
- status: open
- path: `packages/eval/src/load-pack.ts` `parseCase` (~L14)
- evidence: `input` is `typeof row.input === 'string' ? row.input : ''`. A missing or non-string `input` (e.g. `42`) becomes `''` with no throw, no Result, no test. `expected` empty / missing / whitespace still throws (`load-pack.test.ts`). Empty `input` is not a scorer footgun the way empty `expected` is for `includes`, but the pack still loads as valid.
- proposed fix: Reject non-string `input` the same way as empty `expected`. Keep empty-string input only when the author wrote `""`.

## Non-issues / looked OK

- **LEDGER:** no eval Closed/Wontfix rows; nothing to reopen.
- **False-positive (1):** `Promise<string>` runner + throw abort is fail-closed and visible. Distinguishing Fake miss vs fixture abort is an API enhancement; Fake throw is CLI-owned (`create-fake-skill-case-runner.ts`). Do not re-file as Important without a new mechanism.
- **False-positive (3):** duplicated `readFile` + `JSON.parse` is “could be one helper.”
- **Array pack/case guard:** `parsePack` / `parseCase` still accept `typeof === 'object'` including arrays, then throw “needs a non-empty id.” Fail-closed; misleading message only — not a listed class.
- **2026-09-18 leftovers stayed deleted:** no `harness` on `EvalCaseRunner` / `RunEvalSuiteOptions`; no `packages/eval/src/load-skill-via-read.ts`; `ask_user` denied on the skill-read harness; harness not passed to runners.
- Boundary: Fake / live agents stay outside eval; `createReplayCaseRunner` is a map lookup, not a second agent runtime.
- Composer `runEvalSuite` call-order JSDoc and flat sibling steps.
- Pure binary scorers (`exact` / `includes`) + mean suite score + `suiteScore >= threshold`.
- Fail-closed pack parse for empty / missing / whitespace `expected` and duplicate case ids.
- `skillReadPermission` deny list matches today’s `DEFAULT_PERMISSION_CONFIG` keys (read remains allow; `sleep` denied).
- Public exports match importers (`./load-pack`, `./run-eval-suite`).
- No `index.ts`, no `interface`, no `any`, no RxJS anti-patterns.
- Local fixture types (not forced into `@langflower/shared`).
- Sequential `for` of `runCase` — correct for live/LLM runners; not a hidden parallel API.
- `projectRoot` defaulting to `packDir` and used only for the path fence + skill `read`.
