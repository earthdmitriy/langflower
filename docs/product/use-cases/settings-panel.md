---
kind: use-case
owner: docs
covers: []
status: current
---

# Settings panel

**Status:** Ready — gear opens Settings in the right aside. Project
and Global Save persist, project overrides global, keys stay write-only, and
named secrets live outside the project. The aside restores when Settings
closes.

## Value

Operator amends Langflower configuration — LLM/embedding providers, models,
and API keys — from the editor without hunting JSON on disk. **Not** a
replacement for the config file: hand-edit remains the escape hatch for power
users and for reading secrets back.

## UX scenarios

### S1 — Open Settings from the topbar

**Who:** Developer in the workflow editor who needs to change provider or
model settings.

**Want:** A discoverable entry point in the chrome — not a doc hunt for
`langflower.jsonc`.

**Do:** Click the **gear icon** on the **right of the topbar**.

**Expect:**

- Settings MUST open in the **right sidebar**, **replacing** the current right
  panel (feed or inspector) — same swap pattern as
  [inspector](../features/inspector.md) vs
  [feed-panel](../features/feed-panel.md).
- Open/close MUST be server-authored (`editor.settings.requested` →
  `editor.settings.snapshot`); the UI MUST NOT toggle aside state locally.
- The canvas and left chrome MUST stay visible; only the right aside swaps.
- **Bootstrap onboarding:** when effective providers are empty, connect MUST
  open Global Settings — product story owned by
  [bootstrap-new-project S3](bootstrap-new-project.md#s3--configure-providers-before-a-real-run).

### S2 — Edit project providers and models

**Who:** Developer working in a specific project folder.

**Want:** Change default model, add a provider, or pick models for node
dropdowns without leaving the editor.

**Do:** Open Settings → **Project** scope → edit provider/model fields →
**Save**.

**Expect:**

- Saved values MUST persist to the project's `.langflower/langflower.jsonc`
  (or equivalent project config layer).
- After Save, the server MUST re-emit config so the UI updates **without** a
  full page reload or reconnect.
- **Inspector:** LLM / review nodes expose `providerId` / model (and related)
  selects from live config. After Save → close Settings (or select such a
  node), those [inspector](../features/inspector.md) dropdowns MUST list the
  **new** providers/models. Same bar for palette/node param sources that read
  `langflower.providers`.
- Subsequent runs MUST use the saved effective config.
- **Discard** MUST revert unsaved edits in the panel without writing disk.

### S2a — Save default embedding model

**Who:** Developer validating or wiring Embeddings catalog nodes.

**Want:** Set the project-wide embedding API default without editing JSON.

**Do:** Open Settings → **Project** scope → set **Default embedding model**
(provider + model) → **Save** → close Settings → select an **Embed text** or
**Embed provider** node on the canvas.

**Expect:**

- Saved value MUST persist as `"embedding": "providerId/modelId"` in the
  project config layer.
- After Save, Inspector provider/model dropdowns on embedding catalog nodes
  MUST list the **new** effective providers/models — not a stale connect-time
  list.
- Empty panel fields on those nodes at run time MUST fall back to the saved
  default (same precedence as chat `model` → `defaultChat`).
- **Discard** MUST revert unsaved embedding default edits without writing disk.

### S3 — Edit global settings; project overrides win

**Who:** Developer who keeps a personal default provider across projects but
overrides one project.

**Want:** Global defaults without copying JSON into every repo; local project
wins when both define the same key.

**Do:** Open Settings → **Global** scope → set a default provider/model →
Save. Then open **Project** scope in the same project and set a different
value for the same field → Save. Start a run.

**Expect:**

- Effective config for the open project MUST use **project value over global**
  when both are set (merge precedence: project > global).
- Fields set only in global MUST apply when the project file omits them.
- Provider setup for [bootstrap-new-project](bootstrap-new-project.md) S3 is a
  **dual path**: Settings **or** hand-edit. Either satisfies that bar.
  Hand-edit stays the escape hatch for permissions, MCP, and reading a secret
  the UI will not show back.

### S4 — Save API key write-only in UI

**Who:** Developer entering a cloud API key in Settings.

**Want:** Keys stored for runs without the UI echoing the secret on reopen.

**Do:** Open Settings → enter an API key in a key field → Save → close
Settings → reopen Settings on the same scope.

**Expect:**

- **Save MUST prefer `{env:VAR}` on disk** when the server supports writing
  env placeholders (see [CONFIG.md](../../reference/CONFIG.md) § Environment placeholders).
- If the operator saves a literal key, runtime MUST still resolve it; on
  reopen the field MUST remain **write-only** — empty, masked, or placeholder
  only; operator MAY paste a new value to replace.
- The UI MUST NOT receive `apiKey` on `langflower.config.snapshot` or any
  bridge snapshot (redaction bar per CONFIG).
- Hand-edit of JSON on disk MAY still contain plaintext if the user pasted
  there; the UI MUST NOT offer a "reveal saved key" action.

### S5 — Close Settings and restore the right panel

**Who:** Developer finished editing config mid-session.

**Want:** Return to the feed or inspector they had before — not a dead sidebar.

**Do:** Close Settings (explicit close control or toggling the gear off).

**Expect:**

- Right sidebar MUST restore the **suspended mode** from before Settings
  opened: feed work log if nothing was selected, inspector if a node was
  selected at open.
- **v1 MUST:** clicking a node on the canvas while Settings is open MUST
  close Settings and switch the right aside to inspector for that node (same
  selection-owning-sidebar bar as [inspector](../features/inspector.md)).
- Unsaved edits MUST prompt discard or stay open per
  [settings-panel](../features/settings-panel.md) save/discard rules.

### S6 — See where global config lives

**Who:** Developer editing global scope who may also hand-edit the file.

**Want:** OS-specific path hint without reading CONFIG docs.

**Do:** Open Settings → **Global** scope → read the path hint (link or
read-only line).

**Expect:**

- UI MUST show **where the global file lives on this OS** — Mac / Windows /
  Linux paths differ; hint MUST reflect the **server-resolved path** for this
  host (exact locations decided with global-layer implementation).
- Hint MUST be informational; user MUST NOT be required to open the file to
  use Settings.

### S7 — Store a named secret in Global (not in the project)

**Who:** Developer wiring a remote HTTP MCP (or similar) that needs an API
token, without putting that token in the repo.

**Want:** Add/replace/delete a named secret from Settings → **Global**, then
reference it by id from a workflow. The value MUST NOT appear under the
project folder or in the UI after Save.

**Do:** Open Settings → **Global** → Secrets → add id `API_TOKEN` and a
password value → Save → close → reopen Global. Use
`{lf_secrets:API_TOKEN}` from an MCP http `headers` field (see
[node-local-mcp](node-local-mcp.md) auth scenario).

**Expect:**

- The Secrets group MUST show a disclaimer: secrets live in Langflower user
  settings on this computer (those files can still be read); they are kept
  out of the workspace so agents cannot retrieve them with file tools.
- Save MUST persist the value **outside** `<project>/.langflower/` (user-global
  secrets file next to the global config dir).
- Reopen MUST be **write-only** — id visible, value not echoed (same bar as
  [S4](#s4--save-api-key-write-only-in-ui)).
- Bridge snapshots MUST NOT include secret values (ids / `hasValue` only).
- Delete + Save MUST drop that id; later `{lf_secrets:thatId}` MUST fail loud.
- `{env:VAR}` MUST remain a valid alternative (CI / headless).
- This scenario does **not** require OS keychain or encryption at rest
  (TBD-010 (`docs/_work/TBD.md#tbd-010--os-backed--encrypted-secret-storage`)).

## UI specs

| Spec                                                          | Scenarios covered                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Settings panel](../features/settings-panel.md)               | [S1](#s1--open-settings-from-the-topbar), [S2](#s2--edit-project-providers-and-models), [S2a](#s2a--save-default-embedding-model), [S3](#s3--edit-global-settings-project-overrides-win), [S4](#s4--save-api-key-write-only-in-ui), [S5](#s5--close-settings-and-restore-the-right-panel), [S6](#s6--see-where-global-config-lives), [S7](#s7--store-a-named-secret-in-global-not-in-the-project) |
| [Inspector](../features/inspector.md)                         | [S2](#s2--edit-project-providers-and-models) (LLM provider/model selects refresh after Save)                                                                                                                                                                                                                                                                                                      |
| [Project configuration](../features/project-configuration.md) | [S2](#s2--edit-project-providers-and-models), [S3](#s3--edit-global-settings-project-overrides-win)                                                                                                                                                                                                                                                                                               |

## Runtime requirements

| Need                                            | Why (scenario)                                                                                                                      | Today                                                                                                                       | Caution                                                       |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Project config read/write (`langflower.jsonc`)  | Persist project scope edits ([S2](#s2--edit-project-providers-and-models))                                                          | Landed — Settings Save + hand-edit                                                                                          | Dual path OK                                                  |
| Global config file + OS-specific path           | Global scope + path hint ([S3](#s3--edit-global-settings-project-overrides-win), [S6](#s6--see-where-global-config-lives))          | Landed — ADR-002 amend + OS paths (CONFIG)                                                                                  | Path hint from server snapshot                                |
| Merge precedence project > global               | Effective provider/model for runs ([S3](#s3--edit-global-settings-project-overrides-win))                                           | Landed — `mergeLangflowerConfigLayers`                                                                                      | Project-only keys may still appear if pasted into global file |
| Write-only secret fields in UI                  | Keys saved but not shown on reopen ([S4](#s4--save-api-key-write-only-in-ui))                                                       | Landed — `hasApiKey` + empty field; post-Save draft clears key                                                              | Prefer `{env:VAR}` when operator enters placeholder           |
| Re-emit `langflower.config.snapshot` after save | Inspector LLM + embedding selects refresh ([S2](#s2--edit-project-providers-and-models), [S2a](#s2a--save-default-embedding-model)) | Landed — Save → snapshot; projection rebinds                                                                                | —                                                             |
| Right-panel mode: settings vs feed vs inspector | Gear swap + restore ([S1](#s1--open-settings-from-the-topbar), [S5](#s5--close-settings-and-restore-the-right-panel))               | Landed — third aside mode                                                                                                   | Discard reverts the open draft                                |
| Global KV secrets file (not project tree)       | Named secrets for `{lf_secrets:ID}` ([S7](#s7--store-a-named-secret-in-global-not-in-the-project))                                  | Landed — Settings Global + interpolator + MCP HTTP `headers` (epic 45 (`docs/_archive/DONE/EPICS/45-global-kv-secrets.md`)) | Values never in workspace; not encrypted at rest (TBD-010)    |

## Status

**Ready.** The editor gear opens Settings. Project and Global scopes
save, project wins on overlap, inspector provider and model lists refresh
after Save, API keys and named secrets stay write-only, and closing Settings
restores the feed or inspector.

### Missing parts

None.

### Workarounds

Hand-edit `<project>/.langflower/langflower.jsonc` or the OS global file per
[CONFIG.md](../../reference/CONFIG.md) remains the escape hatch (permissions/MCP, reading
secrets back).

### Demo / CI

- Unit: `settings-draft.test.ts`, merge layers, global path, config service,
  projection rebind.
- Smoke: any workflow with provider dropdowns (e.g. `basic-coder`) after
  Settings Save.
- Epic: 18-settings-panel (`docs/_archive/DONE/EPICS/18-settings-panel.md`);
  KV secrets 45-global-kv-secrets (`docs/_archive/DONE/EPICS/45-global-kv-secrets.md`)
