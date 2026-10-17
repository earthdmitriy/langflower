# Code regression — common-nodes-rest

## Meta

- Paths: `packages/common-nodes/src/{hitl,text,output,primitives,embeddings,mcp,langflower-tools,tools,run-host}/`, `packages/common-nodes/src/catalog.ts`, `packages/common-nodes/src/resolve-workflow-node-definition.ts`
- Date: 2026-09-20
- Mode: delta
- Coverage: Delta reconcile of the 2026-09-19 findings, then a fresh pass over production files in this chunk (not line-by-line of every test). Deep-read: `run-host/run-host-services.ts`, `catalog.ts`, `resolve-workflow-node-definition.ts`, Read/Write/Append binds + NODE.md, MCP stdio/http binds, `tool-invoke` / `tool-collection` / `collect-agent-tool-handles`, leftover `tools/run-internal-tool-loop.test.ts`, Langflower Tools + `emit-registration-tools`, HITL Review Gate + Chat Input, Split (paced) bind + NODE.md, embeddings factory + `from-embedding` + embed-text / embed-provider / embed-similarity / provider-model resolve, Preview / Finish / Tool inspect, primitive String/Number/Boolean. Sampled remaining NODE.md / folder READMEs for leftover APIs. LEDGER leftovers `enabledToolIds` and `filter-enabled-registrations` re-checked (ts-scan miss / no file). Tests skimmed for bind contracts, not every assertion.
- Previous report: 2026-09-19 — Critical=0 Important=2 Suggestion=5 (numbered 1–7; kebab ids assigned here)

## Previous findings (delta mode)

| id                                 | severity   | status     | evidence                                                                                                                                                                                                                           |
| ---------------------------------- | ---------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `file-nodes-ctx-files-docs`        | Important  | fixed      | Closed 2026-09-20 — see LEDGER.                                                                                                                                                                                                    |
| `split-paced-planned-common-split` | Suggestion | still-open | `text/split-paced/NODE.md` still says “Distinct from planned one-shot `common-split` (`parts[]`)”. JSDoc on `splitPacedNode` no longer names `common-split` (“not the one-shot Split array”). Catalog still has no `common-split`. |

LEDGER closed (not reopened): `legacy-enabled-tool-ids`, `legacy-filter-enabled-registrations`.

## Principles check

- **PASS — no barrels (`index.ts`).** Glob under `packages/common-nodes/src` found none. Package entry is `catalog.ts`.
- **PASS — no `withLatestFrom` / no production `shareReplay` / no raw `combineLatest`** in sampled production files. Sampled binds use `combineInputs` / `pipeValue` / `configureOutput`. Async waits stamp `withLoading()` (files, MCP, embed, Review Gate). Tool invoke skip/error still happens **before** `withLoading()`.
- **PASS — thin server / MCP I/O.** Wire nodes import `@langflower/tools` connect + `buildMcpHandle`. No MCP session helper exported from this package.
- **PASS — run-host bag vs declared caps.** Bag lives in `src/run-host/run-host-services.ts` (types + attach/peek). File / embed / secrets / editor-bus nodes in this chunk read declared `requires` (`paths`, `embed`, `secrets`, `editorBus`) on `ec`, not a second public `ExecutionContext` I/O field. Types-only host is the intended attach (epic 48) — not a defect.
- **PASS — composer / catalog.** `COMMON_REACTIVE_NODES` in `catalog.ts` is the ordered registry; `resolveWorkflowNodeDefinition` is still a type-keyed lookup that threads `{ type, params }`.
- **PASS — LEDGER leftovers stay deleted.** ts-scan `resolve_symbol` for `enabledToolIds` and `filterEnabledRegistrations` from `catalog.ts` returns not found. No `filter-enabled-registrations` file in the repo. Review/Critique tests still assert Inspector fields omit `enabledToolIds`.
- **PASS — file NODE.md `paths` / `denyPaths`.** Read/Write/Append no longer teach `ctx.files` (LEDGER `file-nodes-ctx-files-docs`, 2026-09-20). Residual: Split NODE.md still advertises planned `common-split`.

## FOUND_BUGS signals

- **BUG-2026-08-31** (`args` `[object Object]` loop) — **does not recur.** `tool-invoke` `args.defaultValue: ''`; parse of `''` / `'[object Object]'` → `{}`. MCP HTTP `headers` default is also `''`.
- **BUG-2026-08-31** (second Start hung) — **does not recur.** `lastCallKey` includes `runId`; skip happens **before** `withLoading()`.
- **BUG-2026-08-26b** (embeddings SDK base64 unwrap → zero vectors) — **does not recur.** `create-embedding.ts` still sends `encoding_format: 'float'` and rejects zero-norm / empty vectors.
- **BUG-2026-08-27** (`pipeValue` never pending) — **looked OK here.** Files, MCP, embed, Review Gate wait behind `withLoading()`.
- **BUG-2026-07-21d** (Review Gate dropped `result` demand) — **does not recur in this bind.** `preview` is a passthrough of `result` with `promptFrom: 'preview'`. No `withLatestFrom`.
- **BUG-2026-07-19b** (allowlist ≠ invoke) — **does not recur in Tool invoke.** Graph invoke looks up the wired `ToolHandle` and errors if missing.
- **BUG-2026-09-18** (HITL ring idle after reload) — UI catalog-hydrate, not these nodes.

## Glue / adapters / parallel types

none

ADR / ownership notes (not findings): MCP handle build stays in `@langflower/tools`. `lastWinsToolHandles` is one helper (collection / invoke / inspect). `RunHostServices` is the private host bag, not a mirror of `ExecutionContext`. `EmbeddingsClient` + `as unknown as` on `new OpenAI(...)` is the unbound provider façade (AGENTS.md). Catalog `Object.fromEntries(...) as unknown as CommonReactiveNodeCatalog` is a local map cast.

## Streamlining & simplifications

none

## Design-flaw fixes

none

## Findings

1.  - id: `split-paced-planned-common-split`

- class: docs-ghost
- severity: Suggestion
- first-seen: 2026-09-19
- status: open
- path: `packages/common-nodes/src/text/split-paced/NODE.md` (line ~13)
- evidence: NODE.md still contrasts paced split with a planned one-shot `common-split` (`parts[]`). There is no such catalog type. Bind JSDoc no longer names it.
- proposed fix: Delete the planned-type sentence. Describe paced split on its own.

## Non-issues / looked OK

- **LEDGER leftovers stayed deleted:** `enabledToolIds` (ts-scan miss; AI node tests assert the field is absent), `filter-enabled-registrations` (no file). Do not reopen without a new mechanism.
- **Declared capabilities / types-only host** — `requires: ['paths' | 'embed' | 'secrets' | 'editorBus']` and `RunHostServices` as a private bag are the epic 48 contract. Not filed.
- **Leftover `run-internal-tool-loop.test.ts`** — still present; not a listed class (see previous-findings table).
- **Resolver `{ type, params }` threading** — lookup still keyed by `type`; no second mapper.
- **Tool invoke is not an LLM loop** — fire-gate + `runId`; no history / allowlist text.
- **HITL Chat Input / Review Gate** — `chatEntry`, hidden inline message, preview demand driver; `withLoading()` on HITL waits.
- **Embeddings HTTP** — `encoding_format: 'float'` and zero-vector throw stay explicit; `fromEmbedding` abort Observable is justified.
- **Primitives / output READMEs** — still match shipped types; deleted JSON/passthrough types stay unrestored.
- **Concat `multi: 'zip'` and Split (paced) session demux** — match AGENTS bind rules. Split `startWith(undefined)` is the first ASAP slot, not a missing-fact ready.
- **Finish `stopsRun` + value passthrough** — `done` is the stop token.
- **Catalog** — no barrels; embeddings/MCP/HITL/tools types are registered.
