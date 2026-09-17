# Architecture

How the launcher process is shaped, how events move, and what happens
from “double-click” to “browser opens.”

Product constraints are locked in
[ADR-038](../../docs/ADR.md#adr-038--launcher-is-a-cli-supervisor).
This page describes **the current code**, including multi-instance
behaviour that the original epic 46 one-child sketch does not mention.

## Processes

```text
┌──────────────────────────────────────────────┐
│  langflower-launcher  (this crate)           │
│                                              │
│  UI thread          Tokio thread pool        │
│  Slint window       spawn / stop / install   │
│  Model + recents    stdout/stderr pipes      │
└──────────────┬───────────────────────────────┘
               │  node <bin> <dir> --no-open -p N
               ▼
┌──────────────────────────────────────────────┐
│  langflower CLI  (npm global, or override)   │
│  createServer → http://127.0.0.1:N           │
│  prints LANGFLOWER_READY {url,port,projectDir}│
└──────────────┬───────────────────────────────┘
               │  system browser (after READY)
               ▼
┌──────────────────────────────────────────────┐
│  Angular editor in Chrome / Edge / Safari    │
│  talks to the CLI over WebSocket as usual    │
└──────────────────────────────────────────────┘
```

One launcher process. **Zero or more** CLI children (one per project
folder). Zero or more browser tabs. The editor never runs inside the
launcher.

## Startup sequence

1. `src/main.rs` builds a multi-thread Tokio runtime (needed so blocking
   UI close can `block_on` child kills without deadlocking).
2. Release builds on Windows use `windows_subsystem = "windows"` so no
   extra console window appears. Debug builds still have a console.
3. `ui::run` creates `LauncherWindow`, loads recents from
   `launcher.json`, and paints the first frame (Start disabled until
   detect finishes).
4. A 50 ms Slint timer plus `UiSender::send` drain `UiEvent`s onto the
   UI thread.
5. Detect runs on a blocking Tokio task (`detect_runtime`): refresh PATH,
   `node -v`, `npm list -g langflower`, optional `npm view langflower
version` (12 s timeout).
6. Details gets a **launcher** channel line (not `[install]`). If Node
   and Langflower already meet the bar and no update is available:

    `Node.js v… and Langflower … already have current versions.`

7. Install buttons appear only when nothing the launcher started is
   still running:
    - Node missing / too old → **Install Node.js**
    - Node OK, CLI missing → **Install Langflower**
    - CLI present, registry newer → **Update (local → remote)** + **Skip**

Skip is **in-memory for this session**. The next launch offers Update
again. Registry failure with a local CLI: log a warning, Start still
works.

## Start a project

Selected path comes from the folder field (`project-path`). Recents
click sets that field. Enter in the field also fires Start.

Guards (`can_start` in `ui_state.rs`):

- not installing
- selected instance is not Starting / Running / Stopping
- path non-empty
- Node meets minimum
- global `langflower` exists (or `LANGFLOWER_LAUNCHER_BIN` is set —
  detect still requires a global install for the **Start** enablement
  flag today; the override is used at spawn time)

Then:

1. Confirm the path is a directory (else Error + hint).
2. `allocate_port` — first free port in 4010–4109 that is not reserved
   by another launcher-owned instance (including ones still Starting).
3. `InstanceManager::begin_start` marks the folder Starting and reserves
   the port. Same folder cannot start twice (`project_key` canonicalizes;
   Windows keys are lowercased).
4. Path is prepended to recents (cap 8) and written to `launcher.json`.
5. Tokio `spawn_cli`:
    - resolve bin (`LANGFLOWER_LAUNCHER_BIN` or
      `$(npm root -g)/langflower/bin/langflower.js`)
    - `node <bin> <dir> --no-open -p <port>`
    - pipe stdout and stderr
    - on Unix, put the child in its own process group so Stop can signal
      the tree
    - on Windows, `CREATE_NO_WINDOW` so `node` does not flash a console
6. Each output line is a `UiEvent::Log` prefixed in Details with
   `[folder-name]`.
7. A line matching `LANGFLOWER_READY {…}` also becomes `UiEvent::Ready`.
8. Ready: status Running, store URL + bound port, **once** open the
   system browser (`take_auto_open_url`). Later **Open Langflower ↗**
   reuses the same URL.
9. Child exit: if the user asked Stop or exit code 0 → Ready; else Error
   (`Langflower stopped unexpectedly` after `human_error`).

`--no-open` is required. The CLI would otherwise open the browser itself
and race the launcher. READY is written with `fs.writeSync(1, …)` in
`packages/cli/src/start-command.ts` so supervisors do not depend on
regex of human logs.

## Stop and close

**Stop Langflower** (selected project): `mark_stopping`, then
`taskkill /F /T /PID` (Windows) or `kill(-pid, SIGTERM)` (Unix process
group), then `start_kill`. Other instances keep running.

**Close window:** gather every `ChildSlot`, `stop_cli_silent` each,
quit the Slint loop. This is the “operator walked away” path. Browser
tabs that are still open will fail to talk to the server; that is
expected (detach / keep-running-without-window is epic 19 for the **CLI
terminal** path, not for this supervisor).

## Event bus (not WebSocket)

```text
Tokio / blocking threads          UI thread
        │                              │
        │  UiSender::send(event)       │
        │     mpsc channel             │
        │     slint::invoke_from_      │
        │       event_loop(drain)      │
        └────────────►─────────────────┤
                                       │ handle_event → Model
                                       │ sync_ui → Slint properties
```

`UiEvent` variants (`src/ui_event.rs`):

| Event         | Who sends it                 | What the UI does                           |
| ------------- | ---------------------------- | ------------------------------------------ |
| `Log`         | child pipes, installer pipes | append Details (`LOG_CAP` 2000 lines)      |
| `Ready`       | parsed stdout                | Running + maybe auto-open                  |
| `Exit`        | wait loop / stop             | Ready or Error                             |
| `SpawnFailed` | `spawn_cli` Err              | Error + log                                |
| `DetectDone`  | startup / after install      | apply detect, first Details line           |
| `InstallDone` | Node / CLI installer         | `installing = false`; re-detect on success |

`sync_ui` is the only place that writes Slint properties from `Model`.
Button callbacks mutate `Model` then call `sync_ui`. Do not set Slint
properties from Tokio tasks.

## Instance table

`InstanceManager` is a `HashMap` keyed by `project_key(path)`.

Each `Instance` holds:

- display path (what the user typed)
- `RunStatus`
- assigned port (reserved while Starting) vs bound port (from READY)
- URL (localhost only)
- last error string
- `stop_requested` / `opened_browser` flags
- `ChildSlot` (the OS process)

Chrome (which buttons exist / are enabled) is a **pure function** of the
**selected** row plus global `installing`. Recents rows show every
instance’s status; **Open UI ↗** on a row opens that row’s URL even if
it is not selected.

Port numbers are hidden until Running (`display_port`). Starting reserves
the port so a second Start cannot steal 4010, but the recents line does
not show “port 4010” until READY.

## Detect and install

Detect is **read-only**. It never installs.

| Check           | Command / source                                                  |
| --------------- | ----------------------------------------------------------------- |
| Node version    | `node -v`                                                         |
| Minimum         | `engines.node` on the global `langflower` package, else `22.22.3` |
| CLI version     | `npm list -g langflower --depth=0 --json`                         |
| Registry latest | `npm view langflower version` (12 s, skipped if Node is not OK)   |
| Update?         | parsed semver triples, remote > local                             |

Install (operator must click):

| OS      | Node                                                                                  | Langflower                                |
| ------- | ------------------------------------------------------------------------------------- | ----------------------------------------- |
| Windows | `winget install --id OpenJS.NodeJS.LTS -e` (agreements accepted)                      | `npm install -g langflower@latest`        |
| macOS   | download official LTS `.pkg` from `nodejs.org/dist`, `osascript` installer with admin | same npm global                           |
| Linux   | error: out of scope for v1                                                            | npm global still attempted if Node exists |

Winget exit code `-1978335189` is treated as success (already installed /
no-op class). After any install, PATH is refreshed (Windows: re-read
Machine+User Path via PowerShell; macOS: ensure `/usr/local/bin` is on
PATH) and detect runs again.

Install is refused while **any** launcher-owned child is live.

## Details log

`append_log` prefixes each line:

| Internal key | Visible prefix  | Used for                             |
| ------------ | --------------- | ------------------------------------ |
| `launcher`   | `[launcher]`    | detect, copy errors, open-URL errors |
| `installer`  | `[install]`     | real Node/CLI install + Skip         |
| project path | `[folder-name]` | that child’s stdout/stderr           |

Do not send detect through `installer`. That was the misleading
`[install] Node v … Langflower v …` line when versions were already
current.

Copy concatenates `log_lines` and sets the system clipboard (`arboard`).
Empty copy is allowed (no extra log line). Clipboard failure appends
`Could not copy log: …`.

`Last event:` lines from the CLI appear in Details as ordinary stdout.
`src/last_event_line.rs` can parse the latest one (TTY `\r` overwrites
included) but the window does not yet promote it to a dedicated widget.
Keep the parser; do not delete it as unused product code without checking
epic 46.

## Recents file

Same user-global directory as `langflower.jsonc` (ADR-002):

| OS      | Path                                                                                |
| ------- | ----------------------------------------------------------------------------------- |
| Windows | `%APPDATA%\langflower\launcher.json`                                                |
| macOS   | `~/Library/Application Support/langflower/launcher.json`                            |
| Linux   | `$XDG_CONFIG_HOME/langflower/launcher.json` or `~/.config/langflower/launcher.json` |

Shape:

```json
{ "recents": ["C:\\work\\demo", "D:\\other"] }
```

Most-recent first, unique, max 8. Invalid JSON → empty list (no crash).
Live status is **not** in this file. **×** on a row calls `remove_recent`
and writes the file again. A running instance is not stopped.

## Environment

| Variable                  | Role                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------- |
| `LANGFLOWER_LAUNCHER_BIN` | Absolute path to `langflower.js` (or the stub in tests). Used at **spawn** time only. |
| `PATH`                    | Must contain `node` / `npm` after install; refreshed in-process.                      |
| `APPDATA` / `HOME`        | Recents location.                                                                     |

The override does not change detect. Start still requires a usable Node
**and** a global `langflower` (`npm list -g`). Dogfood therefore assumes
you already have a global install (`npm install -g langflower` or
`npm run install-local`), then point `LANGFLOWER_LAUNCHER_BIN` at
`packages/cli/bin/langflower.js` so Start launches the working tree
instead of the published copy.

If the override is set but is not a file, spawn fails with
`LANGFLOWER_LAUNCHER_BIN is not a file: …`.

## What not to add

- A second HTTP server in Rust.
- Opening `http://localhost` (hostname) or arbitrary `https://` URLs.
  The help button is an allow-listed exception
  (`HELP_MANUAL_URL` on GitHub).
- Silent port bump outside 4010–4109.
- Persisting Running state across launcher restarts.
- Auto-install on startup.
- GPU Slint backends “for looks.”
