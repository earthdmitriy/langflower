# @langflower/cli

Workspace CLI package. The **published** npm package is the **repo root**
`langflower` (see [docs/RELEASE.md](../../docs/RELEASE.md)).

Dogfood: `npm run install-local`. Local start: `npm run start -w @langflower/cli`.

## Entry points

- `bin/langflower.js` — bin shim: prints `Starting Langflower...` (skipped for
  `eval` / `--help` / `--version`), then **dynamic** `import('../dist/index.js')`
  so ESM hoist cannot hide the heartbeat. Workspace `dist/` is `tsc` emit.
  Published / `install-local` product `dist/` is esbuild-bundled (start chunk +
  split eval / compile; `typescript` + esbuild + host peers external — see
  [RELEASE.md](../../docs/RELEASE.md)). Product `vendor/` is host peers
  (`node-sdk`, `runtime`) plus `server/skeleton` only.
- `src/index.ts` — **process entry** (side-effect call into `cli.ts`, not a
  re-export barrel). PRINCIPLES forbid `index.ts` barrels; this file is the npm
  `main`/bin process bootstrap only.
- `src/cli.ts` — commander setup; `eval` is registered here but the
  `@langflower/eval` implementation loads only when the `eval` action runs
- `src/start-command.ts` — `langflower start`
- `src/eval-command.ts` — `langflower eval` body (fixture pack + threshold gate)
- `src/create-fake-skill-case-runner.ts` — Fake agent-under-test when
  `--replay` is omitted (skill-token rules; no LLM inside `@langflower/eval`)

## Responsibilities

1. Parse `project-dir` (default: `cwd`) and optional `--port` / `-p`
2. Call `createServer` from `@langflower/server/create-server` (CLI `--port`
   overrides project `ConfigService` for that run only; else config port)
3. Open browser (`open` package); print run-settle lines when a run ends
4. Run eval packs via `@langflower/eval`; compose Fake or `--replay` `runCase`
   outside the eval package

## Depends on

`@langflower/server`, `@langflower/shared`, `@langflower/eval`

## Does not

- Own HTTP/WS/workflow domain (delegates to server)
- Put Fake/`runCase` inside `@langflower/eval` (CLI composes runners)

CLI **may** hold small agent-under-test composition for `langflower eval`
(Fake skill-token matcher). That is intentional eval-boundary ownership, not
server domain logic.

## Status

`start` + `eval` shipped — see [docs/STATUS.md](../../docs/STATUS.md) CLI table
(not a stub).

## Build

```bash
node build/tools/agent-run.mjs build-cli
```

## Dev server (agents)

`langflower start` keeps the listen port open until killed (default **4010**,
or `--port` / project config). Do not start it in the background and walk away
— stop the process when verification is done unless the user asked to keep the
server running. See `.cursor/rules/dev-server-lifecycle.mdc`.
