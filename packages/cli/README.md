# @langflower/cli

Workspace package that builds the CLI. The **npm-published** product is the
**repository root** package `langflower` — see [docs/RELEASE.md](../../docs/RELEASE.md).

## Depends on

`@langflower/server`, `@langflower/shared`, `@langflower/eval`

## Bin

`bin/langflower.js` prints `Starting Langflower...` then dynamically imports
`dist/index.js` (skipped for `eval` / help / version).

## Scripts

`npm run build -w @langflower/cli` · `npm run start -w @langflower/cli`

## Dogfood: stable global snapshot

From the monorepo root, build and install a **copy** into the global npm prefix
(not a live link to the working tree):

```bash
npm run install-local
```

Then from any project directory:

```bash
npx langflower
# or
langflower
# optional project path:
npx langflower ./my-project
```

`langflower start` remains an alias. Re-run `npm run install-local` to refresh
the snapshot after you change and rebuild the monorepo.

If `npm run dev` is also running, use a different project port (both default to
**4010**), e.g. `langflower start ./my-project -p 4020`.

`--port` / `-p` overrides `.langflower/config.json` for that run only (does not
rewrite the file).

## Local demo (monorepo, no global install)

From repo root after a full build:

```bash
node build/tools/agent-run.mjs build-all
node packages/cli/bin/langflower.js ./demo-project
```

Or for UI iteration:

```bash
npm run dev
```

On Windows, prefer `node build/tools/agent-run.mjs` instead of bash `npm run build`.

The server opens `http://127.0.0.1:4010` (or `--port` / the port in
`.langflower/config.json`).
