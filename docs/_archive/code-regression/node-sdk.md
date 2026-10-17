# Code regression — node-sdk

## Meta

- Paths: `packages/node-sdk/src/`
- Date: 2026-09-20
- Mode: delta
- Coverage: Delta reconcile of the 2026-09-19 report plus a production-module pass under `src/` (no `index.ts`). Deep read of `define-reactive-node.ts`, `types.ts`, new `capabilities.ts` / `capabilities.types.test.ts`, `define-node.ts`, `define-llm-node.ts`, `ui-schema-inference.ts`, `hitl-config.ts`, `io-helpers.ts` (`configureOutput` / `withLoading`), `runtime-parity.types.test.ts`, `create-node-harness.ts`, `tool-handle.ts`, `define-tool-registrations.ts`, `embed-handle.ts`, `recovery-notice.ts`, `resolve-secret.ts`. ts-scan on `createTypedUISchema`, `TypedUISchema`, `HitlFileControl`, `HitlUploadedFile`, `HitlInputConfig`, `defaultParamsFromUiSchema`, `isNodeCapabilityId`, `NODE_CAPABILITY_IDS`, `uniqueCapabilityIds`. Confirmed `skipExecutionTelemetry`, `skipBoundChatCompletionStream`, and `amendInput` are absent as symbols. Not a line-by-line audit of every sample test.
- Previous report: 2026-09-19, Critical=0 Important=2 Suggestion=4 (open at write time; two Important later closed in LEDGER)

## Previous findings (delta mode)

| id                                  | severity   | status     | evidence                                                                                                                                                                                                                                                                 |
| ----------------------------------- | ---------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `node-sdk-skip-execution-telemetry` | Important  | fixed      | LEDGER 2026-09-19. `ReactiveNodeInstance` in `types.ts` has no `skipExecutionTelemetry`. `resolve_symbol` from `types.ts` is not found. Runtime-parity still locks instance core without that field. Do not reopen.                                                      |
| `node-sdk-define-node-as-never`     | Important  | fixed      | LEDGER 2026-09-19. `defineNode` enters via `defineReactiveNode(reactiveConfig as DefinedReactiveNodeConfig<UI>)` (`define-node.ts` ~201), not `as never`. Residual `values[0] as ExecutionContext<UI>` is a local bind cast, not the closed factory hole. Do not reopen. |
| `node-sdk-create-typed-ui-schema`   | Suggestion | still-open | ts-scan: `createTypedUISchema` and `TypedUISchema` still have no call site. Subpath consumers import `UISchemaConstItem` only (inspector, `select-empty-option`, shared config). See Findings.                                                                           |

## Principles check

- **No barrels (`index.ts`)** — PASS. None under `packages/node-sdk`. Published via `package.json` `exports`. Main entry uses named sibling re-exports (package `AGENTS.md` allows this).
- **`type` not `interface`** — PASS on sampled production `src/`.
- **Thin author SDK / no host I/O bag** — PASS. `ExecutionContext` host keys remain identity + panel + keyed `resolveSecret` (`assertExecutionContextHostKeys`; `amendInput` still absent). Host fields arrive only through declared `requires` → `CapsFor` (epic 48). `ToolHandlerContext` stays `projectDir` / `runId`.
- **No glue adapters without ADR** — PASS. `defineNode` / `defineLlmNode` / `defineToolRegistrations` remain purpose factories over one reactive path. ADR-027 port/instance twins still locked by `runtime-parity.types.test.ts`. Dead `skipExecutionTelemetry` twin is gone.
- **Delete obsolete / export-with-consumer** — FAIL (`dead-export`). `createTypedUISchema` / `TypedUISchema` still have zero call sites. July leftovers (`amendInput`, `recoveryNoticeText`, `icon`, kb/crawl/harness facades) and `skipBoundChatCompletionStream` stayed deleted (`packages/` has no matches for the last).
- **RxJS / `withLatestFrom`** — PASS in production `src` (none). `.subscribe` only in the test harness.
- **Composer entry points** — PASS. `defineLlmNode` lists extra-requires merge → author bind → inventory asserts → port merge in one body. `defineReactiveNode` copies `requires ?? []` onto the definition.
- **Functional errors** — PASS for secrets (`ResolveSecretResult`). Port refusals use the SO error lane (`defineNode` `throwError` on missing output keys).

## FOUND_BUGS signals

none

## Glue / adapters / parallel types

none

ADR-027 `PortMeta` / `WireType` / instance twins remain the locked copy (`runtime-parity.types.test.ts`). Secret-id charset in `resolve-secret.ts` is the ADR-039 SDK-local copy. `CapabilityFields` / `requires` are the epic 48 author contract, not a new undocumented twin.

## Streamlining & simplifications

- Delete `createTypedUISchema` + `TypedUISchema` (keep `UISchemaConstItem` / inference types on `/create-typed-ui-schema`), or add a sample that calls `byField`.

## Design-flaw fixes

none

## Findings

1.  - id: `node-sdk-create-typed-ui-schema`

- class: `dead-export`
- severity: Suggestion
- first-seen: 2026-09-19
- status: open
- path: `packages/node-sdk/src/node-factory/define-reactive-node/ui-schema-inference.ts` — `createTypedUISchema`, `TypedUISchema` (~65–97); published as `@langflower/node-sdk/create-typed-ui-schema`
- evidence: ts-scan reports only the declaration for `createTypedUISchema` and only the return type for `TypedUISchema`. Live importers of the subpath take `UISchemaConstItem` (`lf-inspector-panel.component.ts`, `select-empty-option.ts`, `resolve-ui-schema-options.ts`). Package `AGENTS.md` still shows `import { createTypedUISchema } from '@langflower/node-sdk/create-typed-ui-schema'`.
- proposed fix: Delete the unused factory and wrapper type; keep type inference + `UISchemaConstItem` on the subpath. Stop documenting a factory no sample calls.

## Non-issues / looked OK

- **LEDGER — do not reopen:** `node-sdk-skip-execution-telemetry`, `node-sdk-define-node-as-never`, `legacy-amend-input`. Re-checked: fields/casts/paths still gone.
- **`skipBoundChatCompletionStream`** stayed deleted (zero matches under `packages/`). Epic 48 replaced the negative flag with positive `requires`.
- **`ExecutionContext.amendInput`** stayed deleted; host-key assert still locks the identity bag.
- **Epic 48 `requires` / `capabilities.ts`** — intended author contract (`CapsFor`, `defineLlmNode` merges `LLM_REQUIRED_CAPABILITIES`). Not filed as a defect. `isNodeCapabilityId` has no in-repo call yet; treat as new public guard, not a leftover flag.
- **AGENTS.md “`LlmExecutionCaps` is `toolHandles` only”** is stale versus `CapsFor<LlmRequiredCapabilityId[]>`. Docs teach a narrower old shape, not a deleted API — not `docs-ghost`.
- Dual probe + instance `bind` remains documented author lifecycle.
- `toLlmRecoveryPortValue` / recovery guards remain live. `recoveryNoticeText` stays deleted.
- `EmbedHandle` without `defineEmbedNode` remains the wire contract, not an empty factory stub.
- `createNodeHarness` now accepts typed `caps` for `requires` tests — harness, not a second composer.
- Style (`function` helpers) and `getInstance` `reduce` mutation deliberately not re-filed.
