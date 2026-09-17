# Source map

Every file under `launcher/` and what it is allowed to own. If you cannot
find the behaviour here, it is probably in the **CLI**
(`packages/cli/src/start-command.ts`) or user-global config (ADR-002),
not in this crate.

## Layout

```text
launcher/
  Cargo.toml              crate manifest (name, version, deps, release profile)
  Cargo.lock              pinned crate versions — commit after dep changes
  build.rs                compile Slint + embed Windows .ico
  package.json            npm script wrapper only (not a workspace package)
  README.md               operator + maintainer summary
  AGENTS.md               short rules for coding agents
  docs/                   this guide
  scripts/
    with-portable-rust.mjs  download rustc into .tools/rust/, run cargo
  ui/
    app-window.slint      the window
    icon.png / icon.ico   window + Windows exe icon
  src/
    main.rs               binary entry
    lib.rs                module list
    …                     see table below
  tests/                  Cargo integration tests (no window)
```

`launcher/target/` is gitignored build output. `.tools/rust/` is
gitignored portable toolchain (repo-level `.tools/`).

## `src/` modules

| File                 | Owns                                                                         | Do not put here                                       |
| -------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------- |
| `main.rs`            | Tokio runtime + `ui::run`. Windows subsystem attribute.                      | Business logic                                        |
| `lib.rs`             | `pub mod` list                                                               | Re-exports / barrels                                  |
| `ui.rs`              | Window lifetime, callbacks, `Model`, `sync_ui`, event drain                  | Pure string/state helpers (those go to `ui_state.rs`) |
| `ui_state.rs`        | `RunStatus`, chrome, hints, `human_error`, detect log wording, `log_channel` | OS I/O                                                |
| `ui_event.rs`        | `UiEvent` enum + `UiSender` (mpsc + wake Slint)                              | Handling those events                                 |
| `instances.rs`       | Per-folder table, keys, ports reservation, READY/exit folds                  | Spawning the OS process                               |
| `child.rs`           | `spawn_cli` / `stop_cli` / `kill_tree` / stdout pipes                        | Button enablement                                     |
| `detect.rs`          | `node -v`, npm global list/view, `resolve_cli_bin`                           | UI copy                                               |
| `install.rs`         | winget / macOS pkg / `npm i -g`                                              | Version comparison (detect)                           |
| `ports.rs`           | 4010–4109 scan, skip reserved + bound                                        | Instance map                                          |
| `recents.rs`         | `launcher.json` path, merge, remove, parse, cap 8                            | Run status                                            |
| `ready_line.rs`      | Parse `LANGFLOWER_READY {json}`                                              | Opening the browser                                   |
| `open_url.rs`        | Localhost editor URLs + exact GitHub help page                               | READY parse                                           |
| `clipboard.rs`       | Copy UTF-8 via `arboard`                                                     | Log formatting                                        |
| `path_env.rs`        | Hide console children, refresh PATH, `npm.cmd`                               | Installer recipes                                     |
| `node_semver.rs`     | Parse `v22.22.3`, `>=` engines, compare triples                              | npm spawn                                             |
| `last_event_line.rs` | Latest `Last event:` line (incl. `\r`)                                       | Display — UI does not call this yet                   |

## Build / packaging files

| File                             | Role                                                                      |
| -------------------------------- | ------------------------------------------------------------------------- |
| `Cargo.toml` `[package] version` | Must match GitHub tag `launcher-v*` on a tag push                         |
| `Cargo.toml` `[profile.release]` | Size: `opt-level = "z"`, LTO, strip, `panic = abort`                      |
| `Cargo.toml` `slint` features    | `backend-winit` + `renderer-software` only                                |
| `build.rs`                       | `slint_build::compile("ui/app-window.slint")`; Windows `winresource` icon |
| `package.json`                   | Private wrapper so root `npm run launcher:*` has a local twin             |
| `scripts/with-portable-rust.mjs` | rustup-init into `.tools/rust/`; Windows GNU vs MSVC linker               |

## Tests (`tests/`)

Cargo treats each file as a **separate binary** that links the library.
They do not open Slint.

| File                  | Covers                                                        |
| --------------------- | ------------------------------------------------------------- |
| `ui_state.rs`         | hints, chrome, detect log line, log channels                  |
| `instances.rs`        | multi-row start/stop/error, reserved ports hidden until READY |
| `ports.rs`            | skip reserved + already-bound listeners                       |
| `recents.rs`          | merge / remove / parse / round-trip JSON                      |
| `ready_line.rs`       | READY fact vs human logs                                      |
| `node_semver.rs`      | parse and `>=` compare                                        |
| `last_event_line.rs`  | `Last event:` + `\r` overwrite                                |
| `open_url.rs`         | localhost allow-list + GitHub help URL                        |
| `multi_instance.rs`   | two real stub processes, distinct ports, independent stop     |
| `stub-langflower.mjs` | fake CLI: listen + print READY (used by `multi_instance`)     |

There are no `#[test]` functions inside `src/` today. Prefer adding
another file under `tests/` next to the module you are changing.

## Sibling product files (not in this crate)

| File                                     | Why the launcher cares                                             |
| ---------------------------------------- | ------------------------------------------------------------------ |
| `packages/cli/src/start-command.ts`      | `--no-open`, `formatReadyLine` / `LANGFLOWER_READY`                |
| `packages/cli/src/last-event-writer.ts`  | `Last event:` stdout the Details pane will show                    |
| Root `package.json` `bin.langflower`     | published CLI the global install provides                          |
| `.github/workflows/launcher-ci.yml`      | `cargo test --locked` on Windows + macOS                           |
| `.github/workflows/launcher-release.yml` | unsigned zips on `launcher-v*` / workflow_dispatch                 |
| `docs/ADR.md` ADR-038                    | supervisor vs canvas-in-webview                                    |
| `docs/DONE/EPICS/46-launcher.md`         | landed epic: thin supervisor; toolkit history Tauri → FLTK → Slint |
| `docs/public/launcher.md`                | operator user manual (Help **?** on GitHub)                        |
| `docs/RELEASE.md`                        | how to tag launcher vs npm `v*`                                    |

## Dependencies (what they are for)

You will not use most of these directly. Do not add a crate “because
Rust people do.”

| Crate                  | Job                                               |
| ---------------------- | ------------------------------------------------- |
| `slint`                | Window, layout, software renderer                 |
| `slint-build`          | Compile `.slint` in `build.rs`                    |
| `tokio`                | Child processes, async pipes, timers              |
| `serde` / `serde_json` | READY JSON, recents, npm `--json`                 |
| `rfd`                  | Native folder picker (`default-features = false`) |
| `open`                 | System browser                                    |
| `arboard`              | Clipboard for Details Copy                        |
| `winresource`          | Embed `ui/icon.ico` in the Windows exe            |
| `libc`                 | Unix process-group `kill` (unix only)             |

Slint already pulled `arboard` transitively; the crate depends on it
directly so Copy does not rely on a private UI backend.

## How a typical edit travels

**Rename the Start button**

1. `ui/app-window.slint` — `label: "Start Langflower";`
2. `npm run launcher:dev` to see it. No Rust change.

**Disable Start while a second instance is installing**

1. `ui_state.rs` `can_start` / `chrome` (pure, unit-test it).
2. `ui.rs` `sync_ui` already calls those functions — only change
   `ui.rs` if a new input is required.
3. `tests/ui_state.rs`.

**New spawn flag**

1. Confirm the CLI accepts it (`packages/cli`).
2. `child.rs` `command.arg(…)`.
3. `tests/multi_instance.rs` stub if the flag must be present.

**New Details prefix**

1. `log_channel` in `ui_state.rs` + test.
2. Callers of `append_log(model, key, …)` in `ui.rs` / install path.
