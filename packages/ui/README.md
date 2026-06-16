# @langflower/ui

Angular SPA built around `LangflowerBridgeClient`.

## Architecture

UI talks to the server only through `LangflowerBridgeService.raw`, a typed
`createClient(langflowerWsConfig)` instance.

- Read domain facts from bridge observables.
- Send domain actions as typed bridge intents.
- Derive presentation with Angular signals, async pipes, or pure RxJS.
- Keep only UI-only local state: theme, panel sizes, hover, focus, drag.
- Extend `langflowerWsConfig` when bridge data is insufficient.
- Delete replaced code in the same change — no deprecation shims.
- Workflow UI: apply `workflow.list.snapshot` / `workflow.current.snapshot`
  from the bridge — see [`AGENTS.md`](AGENTS.md) § State sync.
- Reconnect: `session.state.snapshot` → `session.ready` → `palette.snapshot`;
  runtime log from `executionFeed`, then live `runner.*` only.

Details: [`AGENTS.md`](AGENTS.md).

## Styling

Tailwind is the styling and theming layer.

- Global entrypoint: `src/styles.scss`.
- Theme docs: [`docs/THEMES.md`](docs/THEMES.md).
- Typography docs: [`docs/TYPOGRAPHY.md`](docs/TYPOGRAPHY.md).
- Inputs use native elements plus `@angular/aria` for headless accessibility
  behaviour.

## Served By

`@langflower/server` serves the built `dist/` assets.

## Scripts

`npm run build -w @langflower/ui` · `npm run start -w @langflower/ui` (dev)

Agent build: `node build/tools/agent-run.mjs build-ui`
