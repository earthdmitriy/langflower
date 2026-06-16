# Settings panel

## Goal

Amend providers, models, and API keys from the editor gear — project and
global scopes, project wins on overlap. Hand-edit remains the escape hatch
([project-configuration.md](project-configuration.md)). **Done when:**
[settings-panel](../use-cases/settings-panel.md) S1–S6 (Status flip by
orchestrator).

## Core Principles

- **Gear on the right of the topbar** — Settings is a first-class chrome
  entry; not buried in menus or docs.
- **Third right-aside mode** — opening Settings suspends feed or inspector
  (same swap pattern as [inspector.md](inspector.md) ↔
  [feed-panel.md](feed-panel.md)); canvas stays put.
- **Project + global scopes** — operator edits both; effective config merges
  with **project winning** over global for overlapping keys.
- **Write-only secrets in UI** — user may save API keys; reopening Settings
  MUST NOT display the stored secret. Save MUST prefer `{env:VAR}` on disk
  when supported ([CONFIG.md](../CONFIG.md) § Environment placeholders). Bridge
  MUST omit `apiKey` on `langflower.config.snapshot`.
- **OS-specific global location** — global file path differs on Mac, Windows,
  and Linux; UI MUST surface a read-only server-resolved path hint (use-case
  S6).
- **Hand-edit JSON remains an escape hatch** — power users and `{env:VAR}`
  workflows keep working; Settings does not remove the config file.

## Feature Details

### v1 in scope / out of scope

**In scope (v1):** default chat model (provider + model selects), provider list
(id, base URL, models), embedding provider block, API key fields, server logs
(Off / Default / On).

**Out of scope (v1 → hand-edit):** permission rules, MCP server config, and
other dense CONFIG blocks not needed for the provider happy path.

### Enter / leave

Settings chrome is **server-driven**: gear/Close/scope tabs emit
`editor.settings.requested`; the UI folds `editor.settings.snapshot` (and
`session.state.snapshot.settings` on connect).

| Action                                   | Result                                                                                                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Click gear (topbar, right)               | Intent opens Settings (Project scope); previous mode (feed or inspector) suspended                                                               |
| Close Settings / toggle gear off         | Intent closes Settings; restore feed (no selection) or inspector (node selected)                                                                 |
| Click node on canvas while Settings open | Server closes Settings then selects the node; right aside → inspector                                                                            |
| Connect with no effective providers      | Bootstrap onboarding: open **Global** Settings ([bootstrap S3](../use-cases/bootstrap-new-project.md#s3--configure-providers-before-a-real-run)) |

Empty providers list shows an info block: add an OpenAI-compatible provider to
unlock full functionality; simple nodes / Fake LLM work without one; a real
provider is required for live model runs, Sub-Agent workflows, and seeded
coding samples.

### Layout and scopes

- **Header:** "Settings" title + close control.
- **Scope switch:** **Project** | **Global** tabs (or equivalent segmented
  control). Active scope labels which file/layer Save writes to.
- **Project scope:** default chat model (provider + model selects), provider
  list (id, base URL, models), embedding provider block, API key fields per
  provider, server logs radio (Off / Default / On; Default omits `serverLogs`
  in the project file).
- **Global scope:** same v1 field groups for user-wide defaults; read-only
  path hint showing the **server-resolved** global file path on this OS.
- **Footer actions:** **Save** (primary), **Discard** (revert unsaved form
  state).

### Default chat model

- **Default provider** select — providers listed in the active Settings scope.
- **Default model** select — union of that provider’s **Models
  (comma-separated)** and live models from `langflower.models.catalog.snapshot`
  (same merge as Inspector).
- Save writes composite `model: "providerId/modelId"` (or omits when unset).
- Empty node `providerId` / `model` at run time fall back to this effective
  default; Inspector empty choice becomes `Default (provider/model)`.

### Provider and model fields

- Add / remove / rename provider entries by id.
- Per provider field order: **Id → Name → Base URL → connection indicator →
  API key → Models (comma-separated)**.
- Connection indicator under Base URL comes from the server draft snapshot
  (`idle` / `checking` / `ok` + model count / `error`) — not UI-only probes.
- Default chat model and embedding model selectors MUST list providers from the
  active scope (and model options from static + fetched catalogs).

### API key fields

- One password-style input per provider key (or per documented key slot).
- Empty on open when a secret is already stored — placeholder such as "Saved
  — enter new value to replace" (exact copy TBD).
- Save with non-empty input → write secret to active scope; MUST prefer
  `{env:VAR}` placeholder on disk when server supports it.
- Save with empty input → leave existing secret unchanged (do not wipe on
  blank submit unless explicit "Clear key" control).
- MUST NOT provide "Show key" or fetch stored plaintext into the input.

### Unsaved draft (session-synced)

- Unsaved Settings fields live in **session memory** on the server
  (`langflower.config.draft.*`), broadcast to all tabs — not local-only form
  state.
- UI emits `draft.patch.requested`; folds `draft.snapshot` (`draft`,
  `baseline`, `dirty`, `connections`).
- Server probes OpenAI-compatible `models.list` when draft `baseURL` / `apiKey`
  change (override credentials; no disk write). Empty Base URL → `idle`.

### Save / discard / validation

- **Save:** validate required ids/URLs; persist session draft for active scope;
  server MUST re-emit `langflower.config.snapshot` + draft snapshot so the
  editor updates **without** page reload.
- **Inspector / LLM options feedback (known gap if missed):** consumers that
  fill `providerId` / model selects from config (inspector panel params with
  `optionsSource: langflower.providers`, and any equivalent palette/preview
  sources) MUST rebuild option lists on **every** snapshot — including
  post-Save. Connect-only caching is a product bug against
  [settings-panel use case S2](../use-cases/settings-panel.md#s2--edit-project-providers-and-models).
- Run resolution MUST use the saved effective config on the next Start.
- **Discard:** `draft.discard.requested` re-seeds the session draft from the
  saved layer for the active scope (all tabs).
- Invalid save MUST block with inline errors; MUST NOT partially write broken
  provider blocks.

### Coexistence with feed and inspector

- Settings is the **third** right-aside mode alongside feed and inspector.
- While Settings is open, feed timeline and inspector MUST NOT be visible in
  the right aside.
- Settings body MUST NOT duplicate the run composer — Start / Stop / HITL
  remain in the feed composer per [feed-panel.md](feed-panel.md) even while a
  run is active; the feed panel itself is not visible until Settings closes.
- Node selection while Settings is open MUST close Settings and show inspector
  (see Enter / leave). After Save then close/select, the restored inspector
  MUST already show updated provider/model options (see Save above).

## Implementation Details

- **Topbar gear control:** `editor-shell.component.ts` — gear on the right of
  the topbar; toggles Settings aside.
- **Right aside mode switch:** Settings is the third mode (feed / inspector /
  settings) in `editor-shell.component.ts`. Node selection while Settings is
  open closes Settings → inspector (S5).
- **Settings UI:** `lf-settings-panel.component.ts` — Project | Global scopes,
  providers / model / embedding / write-only API keys, Save / Discard / Close,
  global path hint, Project **Bootstrap** (force skeleton reseed via
  `project.bootstrap.requested`; never rewrites `langflower.jsonc`).
- **Bootstrap reseed:** server `wire-project-bootstrap-handlers.ts` →
  `bootstrapProject({ mode: 'force' })` → `project.bootstrap.result` plus
  workflow / custom-palette snapshots. Rejected while a run is active.
- **Project + global config:** `LangflowerConfigService` reads/writes project
  `.langflower/langflower.jsonc` and the OS global file; `read()` returns
  merged effective config (project > global). Paths: [CONFIG.md](../CONFIG.md)
  § Global config; ADR-002 amend in [ADR.md](../ADR.md).
- **Session draft:** `langflower.config.draft.patch|discard.requested` →
  session fold → broadcast `langflower.config.draft.snapshot` (redacted draft +
  connection statuses). Hydrated on connect after `config.snapshot`.
- **Post-save config push:** `langflower.config.save.requested` →
  `writeSettings` (session draft) → broadcast `langflower.config.snapshot`
  (effective + redacted layers + `globalPath`) + draft snapshot + catalog.
  No parallel `settings.*` bus.
- **Inspector rebind:** `LangflowerConfigProjectionService` replaces effective
  config on every snapshot (connect + post-Save); inspector
  `optionsSource: 'langflower.providers'` reads the live projection signal.
- **Secret hygiene:** redact omits `apiKey`, sets `hasApiKey` for write-only
  placeholders; empty key input on Save leaves existing disk secret.
- **Schema reference:** [CONFIG.md](../CONFIG.md),
  [project-configuration.md](project-configuration.md),
  `packages/shared/src/types/langflower-config.ts`.
- **Scenario validation:** [settings-panel](../use-cases/settings-panel.md)
  S1–S6 — Status flip left to orchestrator (prefer Partial until manual smoke).
