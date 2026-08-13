# Langflower — Agent Instructions

**Critical: use English.** All agent replies, code, comments, commit messages,
docs, and UI copy for this project must be in English.

Local coding agent on a visual workflow graph: CLI + server + Angular UI
(ngDiagram), node registry, workflow CRUD, and reactive WebSocket execution.
Start with [PRODUCT](docs/PRODUCT.md), then the relevant feature/use-case doc.

## Canonical docs

| Doc                                                                | Use for                                                  |
| ------------------------------------------------------------------ | -------------------------------------------------------- |
| [PRODUCT](docs/PRODUCT.md)                                         | Purpose, user, differentiators, scope                    |
| [GLOSSARY](docs/GLOSSARY.md)                                       | Short term definitions (Part 1 users; Part 2 developers) |
| [Features](docs/features/README.md)                                | Shipped user-facing behaviour                            |
| [Use cases](docs/use-cases/README.md)                              | Active scenarios and Status gaps                         |
| [NAVIGATION](docs/NAVIGATION.md)                                   | Where code belongs                                       |
| [PRINCIPLES](docs/PRINCIPLES.md)                                   | Functional-reactive flow, adapted slices, boundaries     |
| [ARCHITECTURE](docs/ARCHITECTURE.md)                               | Startup, API, and system flows                           |
| [ADR](docs/ADR.md)                                                 | Non-obvious architecture decisions                       |
| [REACTIVITY](docs/REACTIVITY.md)                                   | RxJS folds and subscription rules                        |
| [EXECUTION_ARCHITECTURE](docs/EXECUTION_ARCHITECTURE.md)           | Runtime/bridge execution flow                            |
| [HOW_TO_WRITE_REACTIVE_NODES](docs/HOW_TO_WRITE_REACTIVE_NODES.md) | Node authoring                                           |
| [LLM_RECOVERY](docs/LLM_RECOVERY.md)                               | Stuck stream / dead-loop recovery (idle, autokick)       |
| [TESTING](docs/TESTING.md)                                         | Unit/API/integration tests                               |
| [STATUS](docs/STATUS.md)                                           | Implemented versus stubbed                               |
| [FOUND_BUGS](docs/FOUND_BUGS.md)                                   | Reproduced bugs and design lessons                       |
| [TODO](docs/TODO/README.md) / [DONE](docs/DONE/README.md)          | Queued / completed plans                                 |
| [TBD](docs/TBD.md)                                                 | Long-horizon unresolved tradeoffs                        |

Feature docs describe **what** ships; technical docs and ADRs describe **how**.
Do not plan against historical Stage labels.

When you change **product facts** (use-case Status / Missing parts,
bootstrap or skeleton seed contract, Stop / Pause / checkpoint / detach,
Sub-Agent mechanics, custom-node language or sandbox claims, and similar),
update not only `docs/**` but also the onboarding helper KB:

- [`packages/server/skeleton/skills/langflower-helper/`](packages/server/skeleton/skills/langflower-helper/)
  — `SKILL.md` plus companion `layout.md` / `architecture.md` (skeleton SoT)
- Sync dogfood when needed:
  `demo-project/.langflower/skills/langflower-helper/` (same files)

That skill folder is a **compact factual KB for the in-product helper agent**,
not a copy of ADRs — keep Can / Cannot aligned with use-cases.

## Package guidance

Read the nested instructions before changing a package:

| Package                        | Instructions                                                               |
| ------------------------------ | -------------------------------------------------------------------------- |
| `@langflower/shared`           | [packages/shared/AGENTS.md](packages/shared/AGENTS.md)                     |
| `@langflower/node-sdk`         | [packages/node-sdk/AGENTS.md](packages/node-sdk/AGENTS.md)                 |
| `@langflower/tools`            | [packages/tools/AGENTS.md](packages/tools/AGENTS.md)                       |
| `@langflower/common-nodes`     | [packages/common-nodes/AGENTS.md](packages/common-nodes/AGENTS.md)         |
| `@langflower/websocket-bridge` | [packages/websocket-bridge/AGENTS.md](packages/websocket-bridge/AGENTS.md) |
| `@langflower/server`           | [packages/server/AGENTS.md](packages/server/AGENTS.md)                     |
| `@langflower/ui`               | [packages/ui/AGENTS.md](packages/ui/AGENTS.md)                             |
| `@langflower/eval`             | [packages/eval/AGENTS.md](packages/eval/AGENTS.md)                         |
| `@langflower/compiler`         | [packages/compiler/AGENTS.md](packages/compiler/AGENTS.md)                 |
| `@langflower/mcp`              | [packages/langflower-mcp/AGENTS.md](packages/langflower-mcp/AGENTS.md)     |
| CLI                            | [packages/cli/AGENTS.md](packages/cli/AGENTS.md)                           |

The package DAG and pragmatic Package / Slice / Unit / Kernel model are
canonical in
[PRINCIPLES § Feature-sliced structure](docs/PRINCIPLES.md#feature-sliced-structure).

## Core rules

- Build state as facts/intents → tagged actions → merge/combine → one pure
  `scan` fold per concern → selector/projection → named edge effect.
- Make reset and hydration policy explicit. Never hide state reduction in
  `subscribe`, `tap`, or Angular `effect`.
- `withLatestFrom` requires explicit human approval; prefer `combineLatest` or
  redesign. See [REACTIVITY](docs/REACTIVITY.md).
- Keep feature slices self-contained. UI services may own cross-feature folds;
  feature components own local UX. Keep ngDiagram mutation at the diagram
  boundary.
- `@langflower/server` stays thin: transport, composition, secrets. Project
  runtime I/O belongs in `@langflower/tools`; provider/node implementations
  belong in common-nodes.
- No glue or mirrored domain types. Fix boundary mismatches at the source; an
  unavoidable adapter needs an ADR with exit criteria.
- Persisted product and WS protocol types live in `@langflower/shared`;
  runtime contracts stay in `@langflower/runtime`, and node-author contracts
  stay in `@langflower/node-sdk`. Reuse the owner type.
- TypeScript is strict: no `any`; prefer guards/generics over casts.
- Expected failures are Results (`{ ok: true|false }`), not throws — see
  [PRINCIPLES § Functional error handling](docs/PRINCIPLES.md#functional-error-handling).
- Use `type`, arrow functions, immutable updates, and concrete module imports.
  `index.ts` barrels are forbidden.
- Keep single-use helpers local above their consumer. Extract only for two real
  consumers with shared semantics; no speculative abstractions.
- Prepare data with array transforms, then perform imperative mutation. Multi-step
  flows use one composer that lists sibling steps in order.
- Delete replaced/dead code in the same change. Before completing a feature:
  `dead-code` → delete findings → `check-exports` → `verify`.

Full rationale and edge allow-list:
[PRINCIPLES](docs/PRINCIPLES.md).

## Reactive execution summary

- Nodes use `defineReactiveNode`; `bind` builds typed
  `StatefulObservable` input/output ports.
- `RuntimeFacade.editor` owns the executable graph.
- `RuntimeFacade.runner` owns start, partial start, resume, interrupt, demand
  wiring, status, and telemetry.
- The internal bridge is intent/fact based: clients emit
  `runner.*.requested`; server/runtime emit authoritative `runner.*` facts and
  snapshots for UI folds.
- There is no separate batch engine and no `ReactivePortBus`. Do not reintroduce
  execution-mode adapters.

See [ADR-004](docs/ADR.md#adr-004--functional--reactive-style-with-rxjs),
[ADR-012](docs/ADR.md#adr-012--internal-websocket-bus-rest-for-bulk-escape-hatches),
and [EXECUTION_ARCHITECTURE](docs/EXECUTION_ARCHITECTURE.md).

## Found bugs

After reproducing and fixing (or deferring) a non-trivial bug, append
[FOUND_BUGS](docs/FOUND_BUGS.md) with the design flaw signal and regression test.
Canvas-only incidents may also belong in
[DIAGRAM_CANVAS](packages/ui/docs/DIAGRAM_CANVAS.md).

## Build and verify

Use `.cursor/skills/langflower-build/SKILL.md`.

```bash
npm run test
node build/tools/agent-run.mjs verify
node build/tools/agent-run.mjs verify --quick
node build/tools/agent-run.mjs dead-code
node build/tools/agent-run.mjs check-exports
```

**Hard gate — do not skip.** Work is **not finished** until `npm run test`
passes in full (unit **and** integration). Agents must not:

- Treat `verify --quick` / unit-only as enough to close a feature
- Put `verify --quick` (or focused vitest alone) as the sole **Verify / DoD**
  step in a plan — intermediate only; close-out must be full `npm run test` or
  full `verify` (see `.cursor/rules/plan-verify-dod.mdc`)
- Skip, disable, `.skip`, or narrow the suite to hide failures
- Declare done while any test file or case still fails
- Blame flakes and stop without reproducing and fixing (or asking the user)

Execution, WebSocket, bootstrap, agent, or HITL changes require integration
coverage; see [TESTING](docs/TESTING.md). Prefer `npm run test` or full
`verify` before finishing.

`langflower start` and `npm run dev` are long-running on port 4010. Prefer
one-shot verification. If a manual server was needed, stop it before finishing
unless the user explicitly asked to leave it running.

## Live instance and TypeScript inspection

- With a running server, the Langflower MCP can drive `workflow.*` / `runner.*`;
  call `ensure_connected` first. See
  [LANGFLOWER_MCP](docs/LANGFLOWER_MCP.md).
- Prefer the **ts-scan** MCP for local TypeScript definitions, references,
  callers, signatures, and file diagnostics — especially `resolve_symbol`
  instead of grepping symbol names. Full rules:
  [`.cursor/rules/ts-scan-code-intelligence.mdc`](.cursor/rules/ts-scan-code-intelligence.mdc).
  If ts-scan is disabled or unavailable, ask the user to re-enable it; do not
  silently fall back to Grep for symbol lookup. Use full build gates
  (`npm run test` / `verify`) for project-wide proof.

## When stuck — ask

Do not guess through ambiguous product behaviour, breaking boundary choices,
or uncertain ngDiagram behaviour. Ask the user with concrete options when docs
and code disagree, several valid fixes exist, or a reported bug cannot be
reproduced.
