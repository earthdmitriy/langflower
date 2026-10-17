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

| Goal                       | Command                                                                 |
| -------------------------- | ----------------------------------------------------------------------- |
| Fast logic check           | `bash build/run.sh test --unit`                                         |
| WS / execution / bootstrap | `bash build/run.sh test --integration` (after `build-all`)              |
| Agent default before done  | `bash build/run.sh verify`                                              |
| Faster verify              | `bash build/run.sh verify --quick`                                      |
| Full gate                  | `npm run format --all && npm run lint && npm run test && npm run build` |

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

## Docs generators

`docs-gen` regenerates `docs/adr/README.md`, `docs/bugs/README.md`,
`docs/architecture/DOC_MAP.md`, and the package-local registry in
`docs/README.md` from frontmatter. `docs-sync` compares
`packages/server/skeleton/skills/**` with `demo-project/.langflower/skills/**`
and `.langflower/skills/**`.

```bash
node build/tools/agent-run.mjs docs-gen --check
node build/tools/agent-run.mjs docs-gen
node build/tools/agent-run.mjs docs-sync --check
```

Run `docs-sync` without `--check` only after the user confirms the dirty
`.langflower` and `demo-project` skill copies may be overwritten.

## Agent-run command keys

- `build-shared` — Build @langflower/shared
- `build-server` — Build @langflower/server
- `build-cli` — Build langflower CLI
- `cleanup` — Remove node_modules and package-lock.json
- `install` — npm install
- `check-exports` — Detect orphan exports (pass --fix to auto-remove, --json for machine output)
- `dead-code` — List dead code: unused files, orphan exports, unused types (--json, --scope, --kind)
- `fix-exports` — Move single-use exports to consumer packages
- `clean-orphans` — Remove exports with zero consumers
