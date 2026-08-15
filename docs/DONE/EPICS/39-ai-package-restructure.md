# Epic 39 — Restructure `packages/common-nodes/src/ai`

**Status:** queued  
**Depends on:** [epic 38](../../DONE/EPICS/38-llm-autokick.md) (landed — do not mix with
autokick / dead-loop behavior)  
**Index:** [README.md](README.md)  
**Feeds:** [NAVIGATION](../../NAVIGATION.md), [NODES](../../NODES.md),
[packages/common-nodes/AGENTS.md](../../../packages/common-nodes/AGENTS.md)
(layout only — no use-case Status flip)

## Goal

Make **catalog node entry points obvious** under
`packages/common-nodes/src/ai/`:

- `ai/nodes/` — the five LLM-class nodes (`node.ts` + `NODE.md` + tests)
- `ai/features/` — shared core and adapters as **named slices**, not a dump

After 38, stuck / dead-loop recovery already lives in `llm-loop`. This epic
is a **mechanical move** so that core is visible in the tree and node folders
stay thin `bind()` entry points.

## Problem (why after 38)

Today `src/ai/` mixes catalog nodes (`openai-llm`, `fake-llm`, `critique`,
`review`, `sub-agent`) with the shared loop, session, path-choice, OpenAI
HTTP factory, and a pile of root-level helpers. New recovery files from
epic 38 (`dead-loop-detector.ts`, `autokick-recovery.ts`) land in
`ai/llm-loop/` — correct layer, still hard to see next to node folders.

Do **not** do this move inside 38: rename diffs hide autokick regressions.

## Out of scope

- **Do not** change autokick, dead-loop, backoff, recovery payload, or
  Inspector policy (epic 38).
- **Do not** add `index.ts` barrels, `ai/features.ts`, or re-export shims
  as `.ts` files at old paths.
- **Do not** invent an `LlmFeature` abstraction, extra package, or new
  public API surface.
- **Do not** move detector / autokick out of the LLM-loop slice, wrap
  `create-chat-completion-stream`, or duplicate logic per node.
- **Do not** restructure `text/`, `logic/`, `hitl/`, `mcp/`, or other
  catalog categories — AI-only because only `ai/` has a fat shared core.
- **Do not** flip use-case Status.

## In scope

- `git mv` (or equivalent) to the locked layout below.
- Update `catalog.ts` imports to `./ai/nodes/<node>/node.js`.
- Remap `package.json` `exports` **targets** to new `dist/` files; **keep
  the published subpath specifiers** so server / UI / tools imports do not
  change.
- Update relative imports inside `ai/` and any leftover absolute path
  comments.
- Docs / `NODE.md` / `AGENTS.md` / `NAVIGATION` / `NODES.md` path sync.
- Full test gate (paths of existing tests move with the files).

---

## Locked layout

```text
packages/common-nodes/src/ai/
  NODE.md                          # category note (refresh if still stale)
  nodes/
    openai-llm/                    # Agent — node.ts, NODE.md, tests
    fake-llm/
    critique/
    review/
    sub-agent/
  features/
    llm-loop/                      # runLlmLoop, observeProviderStream,
                                   # detector + autokick (from epic 38)
    llm-session/                   # run-session-machine + llm-session-shell
    path-choice/                   # Critique / Review tool loop
    openai/                        # HTTP factory, prepare, compaction,
                                   # list-models (dumb mapper; no detector)
    ui-schema/                     # llm-panel / llm-recovery / llm-compaction
    prompt/                        # build-effective-system-prompt,
                                   # normalize-max-iterations,
                                   # resolve-chat-provider-model
    chat-completion-stream.ts      # shared stream type (nodes + openai)
    scripted-chat-completion-stream.ts
    llm-role-preset.ts             # published
    sub-agent-protocol.ts          # published
    run-host-services.ts           # published
    wait-for-subagent-result.ts
```

**Entry points**

| Kind              | Where                     | Rule                                                                          |
| ----------------- | ------------------------- | ----------------------------------------------------------------------------- |
| Catalog node      | `ai/nodes/<name>/node.ts` | One folder = one node. Thin `bind()`; call shared loop, do not copy detector. |
| Shared LLM core   | `ai/features/llm-loop/`   | Single owner of generation + recovery.                                        |
| Provider HTTP     | `ai/features/openai/`     | Unbound factories; server still binds secrets.                                |
| Published modules | `package.json` `exports`  | Specifier strings stay; file paths move.                                      |

`features/` is **named slices**, not `features/utils/` or a flat junk drawer.
Colocate `llm-session-shell.ts` into `features/llm-session/` (it is the Agent
session demux, not a node). Do not create extra folders for one-file
published modules (`llm-role-preset.ts`, `sub-agent-protocol.ts`,
`run-host-services.ts`).

---

## Public export lock

Keep these **specifier** strings unchanged (consumers already import them):

| Specifier                                   | Today (disk)                   | After (disk)                            |
| ------------------------------------------- | ------------------------------ | --------------------------------------- |
| `./ai/llm-role-preset`                      | `src/ai/llm-role-preset.ts`    | `src/ai/features/llm-role-preset.ts`    |
| `./ai/sub-agent-protocol`                   | `src/ai/sub-agent-protocol.ts` | `src/ai/features/sub-agent-protocol.ts` |
| `./ai/run-host-services`                    | `src/ai/run-host-services.ts`  | `src/ai/features/run-host-services.ts`  |
| `./ai/openai/create-chat-completion-stream` | `src/ai/openai/...`            | `src/ai/features/openai/...`            |
| `./ai/openai/list-provider-models`          | `src/ai/openai/...`            | `src/ai/features/openai/...`            |

`package.json` `exports` map each specifier to the new `dist/ai/features/...`
file. Downstream (`bind-llm-context.ts`, UI Inspector, tools tests) **must
not** need import-path edits unless a specifier was missed — in that case
fix the export map, do not add a `.ts` shim at the old path.

Internal catalog imports **do** change (`./ai/nodes/openai-llm/node.js`).

---

## Docs to sync on land

- [packages/common-nodes/AGENTS.md](../../../packages/common-nodes/AGENTS.md)
  Internal layout table; drop “each node is self-contained / helpers inlined”
  for AI (already false after the shared loop).
- [NODES.md](../../NODES.md) §1 — AI exception: `ai/nodes/<node>/`, not
  `ai/<node>/`. Other categories unchanged.
- [PRINCIPLES.md](../../PRINCIPLES.md) slice example `ai/openai-llm/` →
  `ai/nodes/openai-llm/` (and `ai/features/llm-loop/` as the shared slice).
- [NAVIGATION.md](../../NAVIGATION.md) LLM client / recovery / role-preset
  rows.
- [LLM_NODES.md](../../LLM_NODES.md), [LLM_RECOVERY.md](../../LLM_RECOVERY.md),
  ADR path citations, per-node `NODE.md`, [node-library.md](../../features/node-library.md)
  impl pointers as needed.
- Helper KB only if it cites `src/ai/` paths (skeleton + dogfood).

Do not rewrite ADRs for this move; update concrete file paths where they
would otherwise 404 for agents.

---

## Blast radius

| Area                                      | Touch?                    | Notes                                     |
| ----------------------------------------- | ------------------------- | ----------------------------------------- |
| `packages/common-nodes/src/ai/nodes/*`    | **Yes — move**            | Five node folders                         |
| `packages/common-nodes/src/ai/features/*` | **Yes — move**            | Existing shared dirs + root helpers       |
| `src/catalog.ts`                          | **Yes**                   | Import paths                              |
| `package.json` `exports`                  | **Yes**                   | Targets only                              |
| `packages/server` / `ui` / `tools`        | **No** if specifiers hold | Fail the epic if a consumer import breaks |
| Recovery / loop behavior                  | **No**                    | Epic 38                                   |
| WS / runtime / shared                     | **No**                    |                                           |
| Use-case Status                           | **No**                    |                                           |

---

## Acceptance criteria

1. Every catalog LLM node lives under `ai/nodes/<name>/` with `node.ts` as
   the only catalog entry; `catalog.ts` imports from there.
2. Shared loop, session, path-choice, and openai adapter live under
   `ai/features/` with the names above. No detector in a node folder.
3. Published `exports` specifiers are unchanged; `exports` targets point at
   the new compiled files. No `.ts` re-export shims. No `index.ts`.
4. `NODES.md` / `common-nodes/AGENTS.md` / `NAVIGATION.md` describe the new
   tree. PRINCIPLES slice example updated.
5. Close-out gate green (below). Behavior of Fake-LLM / Agent / Critique /
   Review / Sub-Agent tests is unchanged aside from import paths.

## Verify

- Intermediate (optional): focused vitest on
  `packages/common-nodes/src/ai/**` and `verify --quick` while iterating
  imports.
- **Close-out (required):** `npm run test` or full
  `node build/tools/agent-run.mjs verify` — unit **and** integration.
  Do not mark the epic done on `--quick` alone.
