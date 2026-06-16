# @langflower/shared

Shared domain types and validators for CLI, server, and UI.

## Depends on

Nothing (leaf package).

## Used by

`@langflower/server`, `@langflower/ui`, `langflower` CLI.

## Layout

- `src/` — domain types, validators, constants (npm package API).
- `common-nodes/` — built-in node packages (see `common-nodes/README.md`).

## Public exports

`src/index.ts` — import only from `@langflower/shared` in other packages.

## Scripts

`npm run build -w @langflower/shared`
