# Build tools (agent entrypoints)

Thin bash wrappers for Cursor agents and CI. All forward to `build/run.sh`.

## Commands

| Script             | Action                                                   |
| ------------------ | -------------------------------------------------------- |
| `build-all.sh`     | Full build pipeline                                      |
| `build-shared.sh`  | `@langflower/shared`                                     |
| `build-server.sh`  | `@langflower/server`                                     |
| `build-ui.sh`      | `@langflower/ui`                                         |
| `build-cli.sh`     | `langflower` CLI                                         |
| `build-package.sh` | One package: `./build-package.sh ui typecheck`           |
| `typecheck.sh`     | Typecheck all packages                                   |
| `clean.sh`         | Remove build artifacts                                   |
| `install.sh`       | `npm install`                                            |
| `format.sh`        | Prettier format (`--check` to verify)                    |
| `lint.sh`          | ESLint (`--fix` to auto-fix)                             |
| `test.sh`          | Vitest (`--unit`, `--integration`, `--watch`)            |
| `verify.sh`        | `build-all` + unit + integration (`--quick` = unit only) |
| `agent-run.mjs`    | Cross-platform Node dispatcher (no bash)                 |

## Usage

From repository root:

```bash
bash build/tools/build-all.sh
bash build/tools/build-package.sh shared
bash build/tools/verify.sh
bash build/tools/test.sh --integration
node build/tools/agent-run.mjs build-ui
BUILD_VERBOSE=1 bash build/tools/build-ui.sh
```

**Typical agent verify:** `node build/tools/agent-run.mjs verify` (build + unit +
integration). Use `verify --quick` when integration is already green.

Documented in `.cursor/skills/langflower-build/SKILL.md`.
