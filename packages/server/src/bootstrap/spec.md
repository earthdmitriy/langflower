# Specification: Bootstrap full skeleton + Settings reseed

## 1. Executive Summary & Intent

- **Problem Statement:** First-run must seed the full packaged skeleton when
  `.langflower/` is missing. Operators upgrading Langflower need an explicit
  Settings → Bootstrap action that force-overwrites outdated templates without
  rewriting `langflower.jsonc` (providers / MCP).
- **User Prompt Source:** Product request — copy all skeleton workflows; CLI
  seeds only when `.langflower` is absent; Settings Bootstrap force-reseeds.
- **External Context:**
  [bootstrap-new-project](../../../../docs/use-cases/bootstrap-new-project.md),
  [skeleton](../../../../docs/use-cases/skeleton.md),
  [ADR-030](../../../../docs/ADR.md#adr-030--custom-node-pack-layout--npm-model).

## 2. Codebase Guardrails & Local Alignment

- **Designated Base Folder:** `packages/server/src/bootstrap/`
- **Target Directories:** bootstrap/, CLI start, shared bus, bridge wire,
  Settings panel, integration tests, product docs
- **Architectural Patterns:** Thin server FS seed; bridge-first UI; Result on
  WS (`project.bootstrap.result`); modes `create` | `force`
- **Pattern references:** `project-bootstrap.service.ts`, `seed-skeleton.ts`,
  `copy-if-missing.ts`, `copy-force.ts`, `wire-project-bootstrap-handlers.ts`,
  `lf-settings-panel.component.ts`
- **Third-Party Dependencies:** None
- **Frontend:** Angular Settings panel + Tailwind; English copy
- **i18n:** English-only
- **ENV:** None; never invent provider secrets

## 3. Deep System Mechanics

### Modes

- **create:** mkdir; write `config.json` / `langflower.jsonc` if missing;
  copy-if-missing all skeleton workflows, skills, my-nodes, instructions
- **force:** overwrite skeleton-owned files; never write `langflower.jsonc`;
  never overwrite existing `config.json`
- **CLI:** call create only when `hasLangflowerProject` is false
- **WS:** `project.bootstrap.requested` → force seed → list/current/customPalette
  snapshots + `project.bootstrap.result`; reject when runner not idle

### Contracts

- Intent payload: `{}`
- Result: `{ ok: true } | { ok: false, message: string }`
- SoT: `packages/server/skeleton/` via `resolveSkeletonRoot`

## 4. Verification

- Unit: create copies all workflows; force overwrites; force preserves jsonc
- Integration / WS: full seed; force reseed; jsonc preserved
- Manual: Settings → Bootstrap after upgrade

### Functional checklist

- [x] CLI seeds only when `.langflower` missing
- [x] Create seeds all skeleton workflows
- [x] Settings Bootstrap with confirm + pending + result
- [x] Force never rewrites `langflower.jsonc`
- [x] Snapshots refreshed after force seed
