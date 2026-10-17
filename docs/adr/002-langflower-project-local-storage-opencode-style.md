---
kind: adr
owner: docs
covers: []
status: current
id: ADR-002
supersedes: []
superseded-by: []
package: docs
---

## ADR-002 — `.langflower/` project-local storage (opencode-style)

**Status:** accepted · **Date:** 2026-06-16 · **Updated:** 2026-08-31

**Context:** Tool runs inside the user's existing repo (e.g. an app repo), not a
dedicated Langflower project.

**Alternatives considered:**

- **Global config dir** (`~/.langflower`) — simpler path logic, but workflows/nodes
  are not portable with the project and multi-project use gets messy.
- **Inline config in repo root** (`langflower.json`, `workflows/`) — visible without
  dot-prefix, but pollutes user tree and increases collision risk with user files.

**Decision:** All tool state under `<project-root>/.langflower/` (hidden, colocated).

**Tradeoffs accepted:**

- (+) Zero writes outside one folder; easy "delete tool data" story.
- (+) Matches opencode-style mental model for agent tooling.
- (−) Users must discover hidden folder; document in CLI/UI.
- (−) Dot-folder may still be committed by mistake unless `.gitignore` guidance is clear.

**Mitigation:** root `.gitignore` ignores `**/.langflower/**/.cache/` (esbuild node
bundler output). Demo seed files under `demo-project/.langflower/` remain tracked;
machine-specific `config.json` is ignored.

**Consequences:**

- Server FS code paths scoped to `.langflower/` only.
- Bootstrap copies templates from `packages/server/templates/`.

### Amend — global user config layer (2026-07-20)

**Context:** Settings panel needs user-wide provider/model defaults shared
across projects, with project overrides. ADR-002 deliberately rejected a
global dir for _workflows/nodes_; that still holds. Provider credentials and
defaults are a different concern — operators should not copy the same
`provider` block into every repo.

**Decision:** Keep all **project** tool state under
`<project-root>/.langflower/`. Additionally, allow a single **global**
`langflower.jsonc` outside the project for user-wide defaults (providers,
default model, embedding block only for Settings v1). Merge precedence:
**project > global** for overlapping keys / provider ids. Workflows, nodes,
runs, skills, and permissions stay project-local (global does not own them).

**OS paths** (server-resolved; see [CONFIG.md](../reference/CONFIG.md) § Global config):

| OS      | Path                                                        |
| ------- | ----------------------------------------------------------- |
| Windows | `%APPDATA%\langflower\langflower.jsonc`                     |
| macOS   | `~/Library/Application Support/langflower/langflower.jsonc` |
| Linux   | `${XDG_CONFIG_HOME:-~/.config}/langflower/langflower.jsonc` |

**Tradeoffs accepted:**

- (+) One place for personal LLM defaults; project file still wins and stays
  portable for team-shared providers.
- (−) Server may write outside the project tree — only this global config
  path; not a general escape from ADR-002's project scoping.
- (−) Operators must discover two files; Settings UI surfaces the resolved
  global path (use-case S6).

**Consequences:**

- `LangflowerConfigService` reads/writes project + global layers; effective
  config for runs and `langflower.config.snapshot` is the merge.
- Project-only fields (`currentWorkflowId`, `dividerPositions`, `paletteVisible`, `permission`,
  `harness`, `mcp`, …) remain project file only.

### Amend — user-global named secrets file (2026-08-31)

**Context:** Operators need named API tokens (MCP HTTP `Authorization`, etc.)
that must not live in the project tree, so agents cannot read them with
harness file tools. OS keychain / encrypted at-rest storage remains
[TBD-010](../_work/TBD.md#tbd-010--os-backed--encrypted-secret-storage).

**Decision:** Keep a sibling **`langflower.secrets.json`** in the same OS
directory as global `langflower.jsonc`. Values are a plaintext `id → string`
map (chmod `0600` where the OS honors it). Never write this file under
`<project>/.langflower/`. Bridge snapshots expose **ids and path only**.
JSONL logs `langflower.secrets.save.requested` as payload `"REDACTED"`
(by event type, not a recursive key list). `langflower.config.save.requested`
still redacts `apiKey` / `providerApiKeys` in that log.

**Tradeoffs accepted:**

- (+) Workspace-hidden; same discovery path as global Settings.
- (−) Not a vault — anyone who can read the user-global Langflower files can
  read the values.
- (−) Second file beside `langflower.jsonc`.

**Consequences:**

- `LangflowerConfigService` owns read/write of the secrets file
  (`writeSecrets`).
- Named KV writes travel on `langflower.secrets.save.requested`
  (`secretIds` / `secretValues`), independently of jsonc Settings `scope`;
  omitting both leaves the secrets file unchanged.

---
