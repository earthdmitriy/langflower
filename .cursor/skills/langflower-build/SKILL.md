---
name: langflower-build
description: >-
    Runs Langflower monorepo build, typecheck, format, lint, test, clean, and install
    scripts with readable error output. Use when building the project, verifying
    compilation, formatting code, linting, running tests, running typecheck, cleaning
    artifacts, installing dependencies, fixing build failures, or when the user
    mentions build, compile, typecheck, prettier, eslint, format, lint, vitest, test,
    integration test, or verify.
---

# Langflower Build

## When to use

Run these scripts instead of raw `tsc`, `ng build`, or chained `npm run` commands.
They parse errors into a short summary (file, TS code, hint).

## How to invoke (agent)

**Always run from the repository root** (`langflower` monorepo).

### Primary entrypoint

```bash
bash build/run.sh <command> [args...]
bash build/run.sh help
```

### npm aliases (same scripts)

```bash
npm run build
npm run build:shared
npm run build:server
npm run build:ui
npm run build:cli
npm run typecheck
npm run clean
npm run cleanup
npm run cleanup:install
npm run install:deps
npm run format
npm run format:check
npm run lint
npm run lint:fix
npm run test
npm run test:details
npm run test:unit
npm run test:integration
npm run test:watch
npm run verify
npm run verify:quick
npm run pre-release
npm run pack-release
```

### Agent shortcuts (`build/tools/`)

```bash
bash build/tools/build-all.sh
bash build/tools/typecheck.sh
bash build/tools/clean.sh
bash build/tools/install.sh
bash build/tools/build-package.sh shared
bash build/tools/build-package.sh ui typecheck
bash build/tools/test.sh --unit
bash build/tools/verify.sh
bash build/tools/verify.sh --quick
```

### Windows without bash

```bash
node build/tools/agent-run.mjs build-all
node build/tools/agent-run.mjs typecheck
node build/tools/agent-run.mjs build-package shared
node build/tools/agent-run.mjs test --unit
node build/tools/agent-run.mjs test --integration
node build/tools/agent-run.mjs verify
node build/tools/agent-run.mjs verify --quick
```

Or call `.mjs` directly:

```bash
node build/build-all.mjs
node build/typecheck-all.mjs
node build/test.mjs
node build/test.mjs --unit
node build/test.mjs --integration
node build/verify.mjs
node build/verify.mjs --quick
```

## Command map

| Task                 | Command                                                              |
| -------------------- | -------------------------------------------------------------------- |
| Full build (ordered) | `bash build/run.sh build-all`                                        |
| Build shared only    | `bash build/run.sh build-shared`                                     |
| Build server only    | `bash build/run.sh build-server`                                     |
| Build UI only        | `bash build/run.sh build-ui`                                         |
| Build CLI only       | `bash build/run.sh build-cli`                                        |
| Build one package    | `bash build/run.sh build-package <shared\|server\|ui\|cli> [script]` |
| Typecheck all        | `bash build/run.sh typecheck`                                        |
| Clean artifacts      | `bash build/run.sh clean`                                            |
| Wipe deps + lockfile | `bash build/run.sh cleanup` or `npm run cleanup:install`             |
| Install deps         | `bash build/run.sh install`                                          |
| Format (Prettier)    | `bash build/run.sh format`                                           |
| Format check         | `bash build/run.sh format --check`                                   |
| Lint (ESLint)        | `bash build/run.sh lint`                                             |
| Lint fix             | `bash build/run.sh lint --fix`                                       |
| Test (all)           | `bash build/run.sh test`                                             |
| Unit tests only      | `bash build/run.sh test --unit`                                      |
| Integration tests    | `bash build/run.sh test --integration`                               |
| Test watch           | `bash build/run.sh test --watch`                                     |
| Verify (recommended) | `bash build/run.sh verify` — build + unit + integration              |
| Verify (quick)       | `bash build/run.sh verify --quick` — build + unit only               |
| Dead code list       | `node build/dead-code.mjs` or `npm run check:dead-code`              |
| Orphan exports only  | `node build/check-exports.mjs` (included in `verify`)                |

Build order: **shared → server → ui → cli**.

## After code changes

1. **Shared types changed** → `bash build/run.sh build-shared`, then dependents.
2. **Single package** → `bash build/run.sh build-package <key>`.
3. **Verify types only** → `bash build/run.sh typecheck` (faster than full build).
4. **Format** → `node build/format.mjs` (or `npm run format`).
5. **Lint** → `node build/lint.mjs` (or `npm run lint`; `npm run lint:fix` to auto-fix).
6. **Test** → `node build/test.mjs` (quiet `ok` / failures; `--details` for live
   stream; `--unit` / `--integration`). Do not use `npm run test --verbose`
   (npm steals that flag).
7. **Dead code** → `node build/dead-code.mjs` (or `npm run check:dead-code`); **delete**
   every reported file/symbol/type, then re-run until clean.
8. **Orphan exports** → `node build/check-exports.mjs`; must pass before finish
   (`verify` runs this automatically).
9. **Before finishing a task** → `node build/tools/agent-run.mjs verify` or
   `npm run test` (unit **and** integration). `verify --quick` is for
   **tight loops only** — never the plan Verify / Definition of Done (see
   `.cursor/rules/plan-verify-dod.mdc` and AGENTS.md Hard gate). Optionally add
   format + lint.
10. **Stop any dev server** you started (`langflower start`, `npm run dev`) before
    ending your turn — see `.cursor/rules/dev-server-lifecycle.mdc`.

## Dev workflow (tests)

| Tier                | When                                                    | Command                                                           |
| ------------------- | ------------------------------------------------------- | ----------------------------------------------------------------- |
| **Unit only**       | Pure logic, validators, mappers, executor helpers       | `node build/test.mjs --unit`                                      |
| **Integration**     | WS execution, bootstrap, HITL, agents, mock LLM scripts | `node build/test.mjs --integration` (run `build-all` first)       |
| **Verify**          | Default before marking work done                        | `node build/tools/agent-run.mjs verify`                           |
| **Dead code sweep** | Before finish — delete all findings                     | `node build/dead-code.mjs` → delete → `check-exports` → `verify`  |
| **Verify quick**    | Intermediate only (tight loop); **not** feature DoD     | `node build/tools/agent-run.mjs verify --quick`                   |
| **Full gate**       | Pre-PR / release                                        | `npm run format && npm run lint && npm run test && npm run build` |

Integration suite: `tests/integration/**/*.test.ts` (Vitest project `integration`).
Uses temp dirs under `tests/tmp/` — always torn down in tests.

## Dev server verification

Prefer non-blocking checks:

```bash
node build/tools/agent-run.mjs verify
# or, when only execution changed and build is fresh:
node build/tools/agent-run.mjs build-all
node build/test.mjs --integration
```

Only start `langflower start ./demo-project` when **UI/canvas** behaviour must be
checked in a browser. **Never** leave it in the background after verification
unless the user explicitly asked to keep it running.

To stop on Windows (Git Bash):

```bash
netstat -ano | grep ':4010' | grep LISTENING
taskkill //F //PID <pid>
```

## Debugging failures

1. Read the script summary (e.g. `4 TypeScript error(s) in @langflower/ui` or `2 test failure(s) in vitest:unit`).
2. Read the **Issues** list (file:line, TS code, message).
3. Follow the **Hint** line.
4. For full child output: `BUILD_VERBOSE=1 bash build/run.sh build-ui`

## Do not

- Run `tsc` or `ng build` directly unless debugging a single file.
- Skip `shared` when server/cli/UI imports changed types.
- Ignore simplified errors — fix root causes listed under Issues.
- Start `langflower start` / `npm run dev` in the background and leave it running
  after your task ends (stop port 4010 unless the user asked to keep the server up).

## Reference

Full command details: [commands.md](commands.md)
