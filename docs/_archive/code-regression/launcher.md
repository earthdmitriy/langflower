# Code regression — launcher

## Meta

- Paths: `launcher/src/` (skip `target/`), `launcher/scripts/`, `launcher/docs/`, `launcher/package.json`, `launcher/README.md`, `launcher/AGENTS.md`
- Date: 2026-09-20
- Mode: delta
- Coverage: Reconciled every 2026-09-19 finding against current files. Full read of `launcher/package.json`, `README.md`, `AGENTS.md`, both scripts (`with-portable-rust.mjs`, `package-macos-app.py`), and author docs (`architecture.md`, `source-map.md`, `testing.md`, `build-and-release.md`, `docs/README.md`; skimmed `rust-primer.md`, `window.md`). Full read of Rust: `lib.rs`, `main.rs`, `ready_line.rs`, `child.rs`, `path_env.rs`, `install.rs`, `detect.rs`, `instances.rs`, `ports.rs`, `ui_event.rs`, `open_url.rs`, `recents.rs`, `clipboard.rs`, `node_semver.rs`, `ui_state.rs` (chrome / log helpers). Sampled `ui.rs` `handle_event` + start/stop/READY drain only. Cross-checked root `package.json` `launcher:*` scripts. Confirmed leftovers stayed deleted: no `last_event_line.rs` anywhere in the repo, no `Last event:` parse, no `CMAKE_GENERATOR` / `injectCargoArgs`. Did **not** audit Slint markup (`ui/app-window.slint`) or `launcher/tests/` (outside this chunk’s path list). No RxJS — `REACTIVITY.md` N/A.
- Previous report: 2026-09-19 — Critical=0 Important=1 Suggestion=3

## Previous findings (delta mode)

| id                              | severity  | status | evidence                        |
| ------------------------------- | --------- | ------ | ------------------------------- |
| `launcher-docs-npm-script-twin` | Important | fixed  | Closed 2026-09-20 — see LEDGER. |

## Principles check

- **Thin supervisor / no second product process — PASS.** `spawn_cli` (`launcher/src/child.rs`) runs `node <bin> <projectDir> --no-open -p <port>` and waits for `LANGFLOWER_READY`. No `createServer`, bootstrap, UI-dist, or listen. `AGENTS.md` still forbids importing `@langflower/server`, `@langflower/cli` sources, or Angular.
- **Delete obsolete / no parallel APIs “for later” — PASS.** Product leftovers stayed gone: no `last_event_line.rs`, no `Last event:` parse, no CMake env, no `injectCargoArgs`, no root `launcher` npm twin (only `launcher:*`). Author docs name root `launcher:*` only (LEDGER `launcher-docs-npm-script-twin`, 2026-09-20).
- **No adapters / glue — PASS.** No `*Adapter` / `*Mapper`. READY JSON is a language-boundary contract (`formatReadyLine` / `parse_ready_line`), not field-reshuffle glue. Windows exe-name maps are OS spawn, not a domain twin.
- **No barrels (`index.ts`) — PASS.** No TS product modules. `launcher/src/lib.rs` is a `pub mod` list only; no `last_event` module.
- **Composer entry points — PASS** where it applies. `package-macos-app.py` `main()` is self-test vs package vs zip. `with-portable-rust.mjs` is ensure-toolchain then spawn cargo. `ui.rs` `on_start_clicked` is allocate → `begin_start` → persist → `spawn_cli`.
- **Reuse owner types — PASS for READY.** Consumer is `ready_line.rs` `parse_ready_line` only. `DEFAULT_LISTEN_PORT = 4010` in `ports.rs` remains a documented copy of `@langflower/shared` `DEFAULT_PORT`.
- **Feature-sliced ownership — PASS.** Crate lives at repo-root `launcher/`, not on the TS DAG. Zip does not vendor Node, `ui-dist`, or CLI `dist/`.
- **Tauri / WebView / FLTK leftovers — PASS.** No `tauri.conf`, `src-tauri`, Electron, FLTK, or CMakeLists under the chunk paths.
- **Immutability / RxJS folds / `withLatestFrom` / `type` vs `interface` — N/A** (Rust + Python + untyped Node wrapper + Markdown).
- **Docs match files — PASS.** Author docs name root `launcher:*` only; crate `package.json` has no scripts (LEDGER `launcher-docs-npm-script-twin`, 2026-09-20).

## FOUND_BUGS signals

none

No launcher `BUG-*` entries. `legacy-last-event-protocol` (LEDGER Closed 2026-09-18, re-verified 2026-09-19) stayed deleted — not a recurrence. Browser open is still after a parsed READY fact (`ui.rs` `UiEvent::Ready` → `take_auto_open_url`). `BUG-2026-08-30` (product CLI bundle `require`) remains adjacent, not in this chunk.

## Glue / adapters / parallel types

none

ADR-038-backed split (keep): supervisor always passes `--no-open` and opens the system browser after READY; port scan `4010–4109` lives in `ports.rs`. READY JSON is one producer / one consumer — do not extract a shared schema package. `parse_ready_chunk` remains unused by production `pipe_lines` (line-at-a-time `parse_ready_line` only). Portable rustup vs CI `dtolnay/rust-toolchain` is the documented toolchain split.

## Streamlining & simplifications

none

## Design-flaw fixes

none

Half-built last-event stdout protocol stayed deleted (LEDGER `legacy-last-event-protocol`). Start ownership is still supervisor spawn + READY parse; product process is the npm CLI. Do not invent a third listen fact.

## Findings

none

## Non-issues / looked OK

- **LEDGER `legacy-last-event-protocol` — do not reopen.** No `last_event_line.rs` / `last-event-writer.ts` anywhere in the repo. `ready_line.rs` parses only `LANGFLOWER_READY `. `pipe_lines` does not look for `Last event:`. AGENTS / architecture / source-map say do not restore.
- **CMAKE / `injectCargoArgs` stayed deleted.** `with-portable-rust.mjs` `rustEnv` sets rustup/cargo/PATH/scratch/`CARGO_TARGET_DIR` and MinGW linker flags only. Spawn uses `argv` directly.
- Windows program-name maps, `try_wait` poll, and unused `Log.stream` are working leftovers, not listed classes.
- **No Tauri / Electron / WebView / FLTK sources** under `launcher/scripts/` or `launcher/src/` besides historical “do not revive” notes.
- **Spawn vs CLI start:** one `createServer` path. Supervisor does not reimplement listen, bootstrap, or UI-dist. `--no-open -p` matches ADR-038.
- **READY contract:** `parse_ready_line` on spawn stdout; invalid / non-READY lines are ignored (`None`). Not a mirrored workflow type. Not `false-ready` — browser opens only after a parsed fact.
- **Port ownership:** launcher reserves 4010–4109 (`allocate_port` + `InstanceManager::reserved_ports`). Correct split.
- **`package-macos-app.py`:** unsigned `Langflower.app` + `ditto` zip + `--self-test`. Finder constraint is real.
- **Dogfood override:** `LANGFLOWER_LAUNCHER_BIN` is spawn-only (`resolve_cli_bin`); detect still wants a global CLI.
- **`lib.rs`:** module list only. No `last_event` module.
- No RxJS anti-patterns, no `index.ts` barrels, no launcher import of CLI/server sources.
