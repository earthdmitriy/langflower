# Getting started

## Requirements

- **Node.js ≥ 22**
- A project folder on your machine (code, docs, or any workspace you want
  Langflower to work in)

To install Node (latest LTS when missing or too old) and the global CLI in
one step, download a single script from
[install/](../../install/):
[windows.ps1](../../install/windows.ps1),
[linux.sh](../../install/linux.sh), or
[macos.sh](../../install/macos.sh).

## Install and run

```bash
npm install -g langflower
langflower
# or point at a folder:
langflower ./my-project
```

Langflower starts a local server and opens the UI in your browser (default
`http://127.0.0.1:4010`).

Stop the process with Ctrl+C when you are done. There is no cloud account and
no background daemon.

### Several projects at once

Use a different port for each instance:

```bash
langflower ./project-a -p 4010
langflower ./project-b -p 4011
```

You can also set a port in `.langflower/config.json`; a CLI `-p` / `--port`
overrides that for the current run only.

## First run in a folder

If the folder has no `.langflower/` directory yet, Langflower creates one with:

- Default config and schemas
- Starter workflows (default open: **starter**)
- Helper skills and a seed custom-node pack under `.langflower/nodes/my-nodes/`

Your own project files are left alone. Later starts reuse the existing
`.langflower/` data.

## Add an LLM provider

Simple nodes and the Fake LLM work without a provider. Live agent runs need an
OpenAI-compatible provider (OpenAI, LM Studio, or similar).

1. Open **Settings** (gear) in the UI.
2. Add a provider and model.
3. Keep API keys in environment variables and reference them from config as
   `{env:VAR_NAME}` — see [Configuration](configuration.md).

## Next steps

- [Using the editor](using-the-editor.md) — run a workflow and answer reviews
- [Workflow ideas](workflows.md) — what to build next
- [Configuration](configuration.md) — providers and permissions
