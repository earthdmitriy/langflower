# Epic 46 — Launcher

**Status:** landed  
**Goal:** a **thin OS supervisor window** (not a particular toolkit, not
an embedded canvas). The npm CLI remains the product process; the
editor opens in the system browser.

**Toolkit history (tried, then replaced):**

1. **Tauri 2 / WebView2** — tried. WebView dependency and a **large**
   executable. Rejected. Tauri was never the intended product; it was
   one attempt at a small window.
2. **FLTK** — tried. **Moderate** size, but an **ugly** debug-form UI.
   Replaced.
3. **Slint** (software renderer) — **accepted**. **Smallest** binary,
   decent UI, no WebView.

Process model (spawn global CLI, READY, system browser) stayed the same
across those attempts. NSIS/DMG deferred; v1 is `cargo build --release`
plus GitHub Release zips (`launcher-v*`).

**Depends on:** [epic 44](44-startup-optimization.md)
(landed — product CLI bundle + heartbeat); [epic 19](19-detachable-long-run.md)
(landed — `Run settled:` stdout); published root package `langflower` on npm.  
**Index:** [README.md](README.md)  
**Related horizon (not this epic):** embedding the Angular canvas in a
webview is [TBD-002](../../TBD.md#tbd-002--embedded-canvas-desktop-shell)
— a different product, not a launcher follow-up.  
**Do not mix with:** embedding the Angular canvas in a webview; bundling
Node.js inside the `.exe` / `.dmg`; Electron; a second copy of
`createServer` inside the launcher process.

## Goal

Ship a **thin OS window** so an operator can download Langflower, pick a
project folder, start the existing CLI against that folder, and open the
**full UI in the system browser** — without using a terminal.

The launcher is a **supervisor**, not a new runtime. The npm CLI remains
the product process. The canvas stays in the browser the user already
has.

**Pre-phase (CLI, before the window):** a single **Last event:** stdout line so
an operator (terminal or later launcher log) can see **what the workflow
is doing** while the browser is closed. Settle lines from epic 19 stay;
this is live progress, not only the outcome.

## Problem

Today the only supported start path is Node + `npm install -g langflower`

- `langflower` ([install/](../../../install/README.md)). That is still
  the right architecture; it is a poor **first run** for people who will
  not open a shell.

A full desktop shell (Electron or any WebView wrapping the Angular app)
was a non-goal. This epic is narrower: one small window that
installs/updates **system** Node and **global** `langflower`, then
spawns the CLI. The window toolkit is not the goal — see toolkit
history above.

## Locked decisions

1. **Slint** (software renderer) is the accepted window toolkit — after
   Tauri (WebView, large exe) and FLTK (moderate size, ugly UI). Window
   UI is a small native scene (no HTML, no Angular, no ngDiagram). Do not
   embed a Chromium or WebView2 just to host four controls and a log.
2. **Spawn the published CLI as a child process.** Do not call
   `createServer` from the launcher. Command shape:

    ```text
    node  <global langflower bin>  <projectDir>  --no-open  [-p <port>]
    ```

    Capture stdout/stderr into the log pane. `windowsHide: true` (no extra
    console window). Stop / close-window = kill the process **tree**.

3. **Do not bundle Node.js** in the `.exe` / `.dmg`. If `node` is missing
   or below `engines.node` on the installed `langflower` package
   (today `>= 22.22.3`), the launcher **offers** to install the current
   **Node.js LTS** from an **official** channel, then continues only after
   the operator consents:
    - Windows: winget `OpenJS.NodeJS.LTS` (OpenJS Foundation) or the
      official MSI from `https://nodejs.org/dist/` — same family as
      [install/windows.ps1](../../../install/windows.ps1).
    - macOS: official Node.js `.pkg` from `nodejs.org` (not nvm / fnm /
      Homebrew as the launcher path).
    - If Node already meets the minimum, **leave it alone**.
    - Never silently replace a working Node. Log the installer output in
      the pane.
4. **Product bits stay on npm.** After Node is usable, the launcher
   ensures a global `langflower` (`npm install -g langflower` when
   missing). It does not vendor `dist/` / `ui-dist/` / `vendor/` inside
   the launcher archive.
5. **Version check on launcher start** (once per launch, non-blocking
   except when `langflower` is missing):
    - Compare `npm view langflower version` (registry `latest`) to the
      global install.
    - If newer: **offer** Update / Skip. Update = `npm install -g
langflower@latest` with live log. Never auto-update.
    - Registry / network failure: log a warning; do not block Start when
      a local global install already exists.
    - Offline + no global install: Start stays disabled until install
      succeeds.
6. **Do not auto-open the browser.** CLI grows `--no-open`. The window
   shows a clickable `http://127.0.0.1:<port>` after listen. Opening the
   link uses the **system** browser.
7. **Ready contract.** After listen, CLI prints one machine line the
   launcher parses (do not rely on regex of human logs forever):

    ```text
    LANGFLOWER_READY {"url":"http://127.0.0.1:4010","port":4010,"projectDir":"..."}
    ```

    Human lines (`Starting Langflower...`, compile, settle) still go to
    the log pane.

8. **One window = one child.** Changing folder requires Stop first.
   Default port from project `.langflower/config.json` else **4010**.
   `EADDRINUSE` / `порт занят` stays a loud log error (no silent port
   bump in this epic).
9. **Package layout:** `launcher/` at repo root — Cargo bin + Slint UI
   (not under `packages/`, which is npm workspaces).
   **Not** on the TS product DAG (must not import `@langflower/server`,
   `@langflower/cli` sources, or UI). `typecheck-all` / `check-exports`
   skip it. Distributable is the release binary (zip), not an npm package.
10. **Targets for v1:** maintainer `cargo build --release` zip (Windows
    x64 first; macOS when available). NSIS/DMG deferred. Unsigned artifacts
    are acceptable for v1; document SmartScreen / Gatekeeper. Code
    signing + notarization is out of this epic.
11. **Recents** live in the user-global Langflower dir (ADR-002:
    `%APPDATA%\langflower\`, `~/Library/Application Support/langflower/`),
    e.g. `launcher.json` — never in the project tree.
12. **Last event line (pre-phase, CLI).** While a run is live, stdout shows
    one human line prefixed `Last event:` so a closed-browser operator
    (and the launcher log) can see current graph activity. Project from
    existing `runner.events$` (same subscription as `onRunSettled`) —
    do not fork a second settle/feed fold ([FOUND_BUGS](../../FOUND_BUGS.md)
    BUG-2026-07-21). Format + identity throttle live in server
    `observability/`; CLI only writes the resulting string.
    Shape (one line, ~120 cols):

    ```text
    Last event: <node name> · <portId> · pending|value|error
    ```

    Optional short preview on `value`/`error` (objects → `JSON`, strings
    truncated). **Not** one line per LLM token: rewrite only when
    `(nodeId, portId, kind)` changes, or pending→value/error, or at most
    ~4 Hz on the same streaming port. HITL waits MUST appear
    (`waiting · permission.ask · <tool>` / `ask_user` / canvas HITL) so
    a detached operator does not think the process hung.
    **TTY:** overwrite in place (`\r` + pad). **Non-TTY** (pipe, launcher,
    CI): newline only when the formatted text changes after throttle —
    no `\r` in pipes. Epic 19 `Run settled: …` remains a **new** line
    after the last-event row. Idle (no run): no last-event line until
    `runner.started`.

## UI (normative)

One window (~480×640):

- Working directory path + **Browse** (native folder picker).
- Recents (click to fill the path).
- **Start** / **Stop** + status (`idle` / `starting` / `running` /
  `error`).
- Clickable **Open UI** URL (disabled until `LANGFLOWER_READY`).
- Optional pinned **Last event** row (parse the latest child line that
  starts with `Last event:`) — slice B; pre-phase already prints it on
  CLI stdout.
- Log pane: child + installer stdout/stderr, autoscroll, last ~2000
  lines.

States: `idle → starting → running → idle`; any child non-zero exit →
`error` with Start re-enabled.

Empty folder: CLI bootstrap unchanged (creates `.langflower/`). Launcher
does not reimplement bootstrap.

## In scope

### Pre-phase — CLI last-event line

Lands **before** window slices. Terminal-only observability for
[detachable-long-run](../../use-cases/detachable-long-run.md) (new S5)
and for the future launcher log.

- `formatLastEventLine` in
  `packages/server/src/observability/` (not `@langflower/shared` — not a
  domain/WS type); unit tests for pending / value / error / HITL wait /
  truncation / throttle identity. CLI receives a ready string via
  `createServer({ onLastEventLine })`.
- CLI / `createServer` hook on `runner.events$` (+ permission /
  `askUser` facts already on the bridge) writes the last-event line.
  Do not import UI feed-folding.
- TTY `\r` vs non-TTY newline per locked decision 12.
- `Run settled:` still prints on natural `done` (epic 19). Interrupt
  may update last-event to stopped; do not invent a second settle
  vocabulary.
- Docs: detachable-long-run S5 + STATUS CLI row.

### Slice A — ADR + CLI contract

- **ADR-038** (process model): Slint supervisor; spawn global CLI; no
  bundled Node; npm as the product channel; `--no-open`;
  `LANGFLOWER_READY`; close-window kills the tree; UI in system browser.
- `langflower --no-open` (and `langflower start --no-open`): skip
  `open()`. Default CLI path still opens the browser (terminal users).
- Print `LANGFLOWER_READY` JSON after listen (including `--no-open`).
- Unit tests: flag parse; READY line shape; `open()` not called when
  `--no-open`.

### Slice B — Slint window + spawn

- `launcher/` Slint app: folder picker, recents, Start/Stop,
  Details log, Open Langflower via OS browser.
- Spawn/kill helpers in Rust; PATH
  after Node install must be refreshed (Windows registry Path).
- Pin the latest `Last event:` line from child stdout (pre-phase) above
  the scrolling log.
- Dogfood: optional env/config to spawn the workspace
  `packages/cli/bin/langflower.js` instead of global npm (dev only).

### Slice C — Official Node bootstrap

- Detect `node -v` vs required `engines.node`.
- Prompt → install current Node.js LTS from the official channel (locked
  above). Reuse the spirit of `install/windows.ps1` / `install/macos.sh`
  but **do not** use nvm on macOS for this path.
- Show installer output in the log. Re-check version before enabling
  Start.
- Unit-test the semver gate (pure); installer I/O can be faked.

### Slice D — npm langflower install + update offer

- On launch: resolve global `langflower` version vs `npm view
langflower version`.
- Missing → offer **Install**. Newer registry → offer **Update**. Equal
  → quiet.
- Buttons run `npm install -g …` with log. Skip leaves the current
  global install.
- Timeout / registry down: warn in log; Start allowed if global CLI
  exists.

### Slice E — Distributables + docs

- Documented maintainer `cargo build --release` produces a zip-able
  binary (NSIS/DMG later).
- PRODUCT / STATUS / GLOSSARY Part 1 / getting-started / public manuals /
  helper KB: launcher is an **optional** start path; CLI remains
  canonical; canvas is still the system browser.
- `install/` scripts stay valid for terminal users.

## Out of scope

- Bundling Node, `ui-dist`, or the CLI `dist/` inside the launcher.
- Embedding the Angular editor / HITL / canvas in a WebView.
- Electron, Neutralino, Wails, or reviving Tauri/WebView2 as the
  launcher (already tried; rejected).
- Auto-update of the **launcher binary** — follow-up;
  v1 updates **langflower via npm** only.
- NSIS/DMG / GitHub Actions artifacts (deferred).
- Silent Node or langflower upgrades.
- nvm / fnm / Homebrew / apt as the launcher Node installer.
- Auto-picking the next free port.
- Multiple children in one window; Linux AppImage; Windows arm64;
  Intel macOS (unless cheap to add).
- Code signing, Apple notarization, SmartScreen reputation.
- Rewriting `@langflower/server` bind/auth for LAN (ADR-006 still
  localhost).
- Dumping the work-log / `executionFeed` to stdout; token-level CLI
  streaming; duplicating `serverLogs` JSONL as the last-event line.

## Acceptance criteria

0. **Pre-phase:** with `langflower` running and the browser closed, a live
   run updates a single `Last event:` stdout line (node + port +
   pending/value/error or HITL wait). Streaming does not flood the
   terminal. Natural settle still prints `Run settled: …` on a new line.
   Unit tests cover the formatter + throttle identity. Detachable-long-run
   S5 documented.
1. On a machine **without** Node, the launcher explains the gap, installs
   current Node.js LTS from an official channel **after consent**, then
   can install global `langflower` the same way. It never ships a Node
   binary inside the archive.
2. On a machine **with** Node meeting `engines.node` and global
   `langflower`, Start on a folder binds localhost, log shows heartbeat +
   READY, Open UI opens the system browser, and the existing editor
   works. Closing the launcher stops the child.
3. If npm `latest` > global version, launch shows an update offer; Skip
   still allows Start; Update runs `npm install -g langflower@latest`.
   No silent bump.
4. `--no-open` is tested; default `langflower` from a terminal still
   opens the browser.
5. ADR-038 recorded. PRODUCT / STATUS / TBD-002 / helper KB
   match: launcher ≠ canvas-in-webview; an embedded-canvas shell remains
   a non-goal (TBD-002 is horizon only, not a Tauri plan).
6. Close-out verify green (below).

## Verify

- Intermediate (optional): focused vitest on last-event formatter /
  throttle, `--no-open` / READY / semver gate; `npm run launcher:dev`
  smoke of the window; `verify --quick` while iterating CLI.
- **Close-out (required):** `npm run typecheck` (or
  `node build/tools/agent-run.mjs typecheck`) **and** `npm run test` or
  full `verify` (unit **and** integration). Do not mark the epic done on
  `--quick`, focused vitest, or tests without typecheck.
- Launcher has no TypeScript; `typecheck-all` does not compile it.
  Intermediate: `cargo test` / `cargo build --release` in the crate.
- `dead-code` / `check-exports` after CLI flag/export changes.

## Implementation notes (non-normative)

Likely touch:

- [`packages/server/src/observability/format-last-event-line.ts`](../../../packages/server/src/observability/format-last-event-line.ts)
  — `formatLastEventLine`; keep settle formatter in shared unchanged.
- [`packages/cli/src/start-command.ts`](../../../packages/cli/src/start-command.ts)
  / [`packages/server/src/bridge/attach-langflower-bridge.ts`](../../../packages/server/src/bridge/attach-langflower-bridge.ts)
  — last-event writer on `events$`; later `--no-open`, READY line, keep
  `open()` as default.
- New [`launcher/`](../../../launcher/) — Slint Cargo
  bin (`ui/app-window.slint` + `src/ui.rs`).
- Docs listed in slice E.

Reuse detection/install ideas from [`install/`](../../../install/), but
macOS launcher must use the official Node pkg, not nvm.

## Links

- [PRODUCT.md](../../PRODUCT.md) Non-goals (canvas-in-webview still out)
- [TBD-002](../../TBD.md#tbd-002--embedded-canvas-desktop-shell)
  (horizon only — not the launcher path)
- [install/README.md](../../../install/README.md)
- [packages/cli/AGENTS.md](../../../packages/cli/AGENTS.md)
- [ADR-006](../../ADR.md#adr-006--express--ws-localhost-only-no-auth-stage-1)
  (localhost bind)
- [getting-started](../../features/getting-started.md)
- [detachable-long-run](../../use-cases/detachable-long-run.md) S4 settle /
  S5 last-event
