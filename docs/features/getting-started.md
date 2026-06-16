# Getting started

## Goal

Let a user go from an empty folder to a running visual editor with one CLI
command — no manual server setup, no accounts, no cloud dependency.

## Core Principles

- **Zero-config first run** — the tool bootstraps everything a project needs
  the first time it sees a folder without `.langflower/`.
- **Local-only** — the server binds to `localhost`; there is no authentication
  because there is no network exposure to authenticate against.
- **Project data stays in the project** — every file the tool creates or reads
  lives under `<project>/.langflower/`; the user's own files are never touched.
- **One process, one port** — a single command starts the server and opens
  the browser; stopping that process stops everything.

## Feature Details

A user installs the `langflower` npm package globally, then runs
`npx langflower` (or `langflower`) from — or pointing at — their project
folder. Langflower:

- Uses the current directory as the project root, or a path passed as an
  argument (`npx langflower ./my-project`). `langflower start` is an optional
  alias.
- On first run (no `.langflower/` yet), creates a hidden `.langflower/` folder
  containing default config, **all** packaged skeleton workflows (default open:
  **`starter`**), authoring **`instructions.md`**, skills
  **`langflower-helper`** + **`langflower-node-writer`**, and the
  **`nodes/my-nodes`** seed pack. Seed _content_ contract:
  [skeleton](skeleton.md) / [ADR-030](../ADR.md#adr-030--custom-node-pack-layout--npm-model).
  Source tree:
  [`packages/server/skeleton/`](../../packages/server/skeleton/).
  Existing projects are left as-is on start; refresh templates via Settings →
  Bootstrap (does not rewrite `langflower.jsonc`). Author runs `npm install`
  inside a pack when adding dependencies — the server never auto-installs.
- Starts a local web server and opens the editor UI in the system browser
  automatically.
- When no LLM providers are configured yet, the editor opens **Global
  Settings** so the user can add an OpenAI-compatible provider (OpenAI, LM
  Studio, or similar). Simple nodes and Fake LLM still work without a
  provider; a real provider is required for live model runs, Sub-Agent
  workflows, and seeded coding samples. Fields:
  [settings-panel](settings-panel.md) / [CONFIG.md](../CONFIG.md).
- Keeps running until the user stops it (Ctrl+C) — there is no background
  daemon or install step beyond the initial install.

**npm:** `npm install -g langflower` then `langflower [project-dir]` (see
[RELEASE.md](../RELEASE.md) for maintainers).

**Monorepo dogfood:** from the Langflower repo root, `npm run install-local`
builds and installs a **stable global snapshot** (copy, not `npm link`). Then
`npx langflower` works from any cwd. Re-run `install-local` to refresh.
UI iteration inside the monorepo still uses `npm run dev`. If both run at
once, or you need several project instances, pass different ports with
`--port` / `-p` (default **4010**; overrides `.langflower/config.json` for that
run only).

Provider API keys stay in the host environment and are referenced from
`.langflower/langflower.jsonc` as `{env:VAR}` — see [CONFIG.md](../CONFIG.md).
Cursor does **not** expose an official OpenAI-compatible chat API; use OpenAI,
LM Studio, or another openai-compatible `baseURL`.

On every subsequent run of `npx langflower` in the same folder, existing
project data (workflows, config, custom nodes) is reused as-is.

The user cannot change the active project directory from inside the UI in
The user cannot change the active project directory from inside the UI yet
(folder picker is a deferred TODO — see
[bootstrap-new-project](../use-cases/bootstrap-new-project.md)); switching
projects means restarting the CLI with a different path.
The active directory is shown in the editor toolbar so the user always knows
which project they are editing.

## Implementation Details

- CLI entry point: `packages/cli/src/cli.ts` (commander setup) →
  `packages/cli/src/start-command.ts`. See
  [packages/cli/AGENTS.md](../../packages/cli/AGENTS.md).
- Server bootstrap: `packages/server/src/create-server.ts` (`createServer`),
  project scaffolding in `packages/server/src/bootstrap/project-bootstrap.service.ts`.
- Startup sequence (parse args → bootstrap `.langflower/` if missing →
  compile custom packs via `@langflower/compiler` → start Express +
  WebSocket → open browser): [docs/ARCHITECTURE.md](../ARCHITECTURE.md).
- `.langflower/` layout and stack: [spec.md](../../spec.md) §1-2, §4, §7; pack
  contract [ADR-030](../ADR.md#adr-030--custom-node-pack-layout--npm-model).
- Default port and other CLI-visible behavior: `spec.md` §1 (`langflower start [project-dir]`, default port 4010; CLI `--port` / `-p` overrides for one run).
