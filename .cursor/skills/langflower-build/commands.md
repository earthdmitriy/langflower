# Langflower build commands

## Architecture

```
build/
├── run.sh              # dispatcher (preferred entrypoint)
├── *.sh                # per-task bash wrappers
├── *.mjs               # Node implementations (error formatting)
├── lib/                # shared helpers
└── tools/              # agent-friendly thin wrappers
```

Bash wrappers delegate to `.mjs`. Node uses cross-platform `npm` spawning.

## Environment

| Variable          | Effect                                             |
| ----------------- | -------------------------------------------------- |
| `BUILD_VERBOSE=1` | Stream full stdout/stderr from child npm processes |

## Packages

| Key      | Workspace            | Path              |
| -------- | -------------------- | ----------------- |
| `shared` | `@langflower/shared` | `packages/shared` |
| `server` | `@langflower/server` | `packages/server` |
| `ui`     | `@langflower/ui`     | `packages/ui`     |
| `cli`    | `langflower`         | `packages/cli`    |

## Error output format

On failure scripts print:

1. **Failed:** step name
2. **Summary:** e.g. `3 TypeScript error(s) in @langflower/ui` or `2 test failure(s) in vitest:unit`
3. **Issues:** `file:line:col` + message (TS, Vitest assertion, etc.)
4. **Hint:** suggested next command
5. **Raw tail:** last lines of combined output

### Test failures (Vitest)

Parsed from `FAIL  path > suite > test` blocks and `AssertionError` lines.
Re-run a single suite: `node build/test.mjs --unit` or `node build/test.mjs --integration`.

## Dev workflow (tests)

| Goal                       | Command                                                           |
| -------------------------- | ----------------------------------------------------------------- |
| Fast logic check           | `bash build/run.sh test --unit`                                   |
| WS / execution / bootstrap | `bash build/run.sh test --integration` (after `build-all`)        |
| Agent default before done  | `bash build/run.sh verify`                                        |
| Faster verify              | `bash build/run.sh verify --quick`                                |
| Full gate                  | `npm run format && npm run lint && npm run test && npm run build` |

Integration tests import compiled `@langflower/server` — always run `build-all`
(or `verify`) before `--integration` if packages changed.

## Examples

```bash
# Full pipeline
bash build/run.sh build-all

# UI only after frontend change
bash build/run.sh build-ui

# Typecheck without emit
bash build/run.sh typecheck

# Custom script on a package
bash build/run.sh build-package ui typecheck

# Clean before release build
bash build/run.sh clean && bash build/run.sh build-all

# Tests
bash build/run.sh test
bash build/run.sh test --unit
node build/tools/agent-run.mjs test --integration
bash build/run.sh verify
node build/tools/agent-run.mjs verify --quick
```
