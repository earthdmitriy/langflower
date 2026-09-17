# Desktop launcher

The launcher is a small window that starts Langflower **without a
terminal**. It picks a project folder, can install Node.js and the
global `langflower` CLI, then runs the **same** CLI a terminal user
would run. The editor still opens in your **system browser**.

This window is not the canvas. It does not embed the editor, and it
does not include Node.js or the CLI inside the zip.

## Download

Unsigned Windows and macOS zips are on
[GitHub Releases](https://github.com/earthdmitriy/langflower/releases)
(tags `launcher-v*`, not the npm `v*` tags).

- `langflower-launcher-windows-x64.zip`
- `langflower-launcher-windows-arm64.zip`
- `langflower-launcher-macos-arm64.zip`
- `langflower-launcher-macos-x64.zip`

Unpack and run `langflower-launcher.exe` (Windows) or
`langflower-launcher` (macOS). Windows SmartScreen and macOS Gatekeeper
will warn because the binary is unsigned. On macOS: right-click the
file → **Open**.

Linux has no published zip in v1.

## First run

You still need:

1. **Node.js ≥ 22**
2. The global CLI: `npm install -g langflower`

If Node is missing or too old, the window shows **Install Node.js**
(Windows: winget LTS; macOS: official Node `.pkg` from nodejs.org, which
asks for administrator permission). If Node is fine but Langflower is
missing, it shows **Install Langflower**. If a newer CLI is on npm, it
offers **Update** and **Skip**. Skip lasts for this session only.

Install buttons are hidden while any project the launcher started is
still running. Stop those first.

The **?** button in the title row opens this page on GitHub.

## Start a project

1. **Browse** to a folder, type a path, or click a **Recent** row.
   **×** on a row removes it from recents only (it does not Stop a
   running project).
2. Click **Start Langflower** (or press Enter in the path field).
3. Wait until the hint says the project is running on a port.
4. The system browser opens `http://127.0.0.1:<port>` after the CLI is
   ready. Use **Open Langflower ↗** (or **Open UI ↗** on a recent row)
   if you closed the tab.

An empty folder is fine: the CLI creates `.langflower/` on first start.
Your other files are left alone.

**Start** stays disabled until Node meets the minimum, a global
`langflower` is installed, and a folder is chosen.

## Several projects at once

Each folder gets its own Langflower process and port (starting at
**4010**, then the next free port through **4109**). Start, Stop, and
Open apply to the **selected** folder. Other rows keep running.

You cannot start the same folder twice. Select another recent and Start
it while the first is still up.

## Stop and close

- **Stop Langflower** ends the selected process only.
- **Closing the launcher window** stops **every** process this window
  started.
- Closing a **browser tab** does not stop the server. Reopen the URL
  while that row still says Running.

Processes you started from a terminal are not stopped by this window.

## Details

Open **Details** at the bottom for the CLI and installer log. **Copy**
puts the log on the clipboard (the text itself is not selectable).

Prefixes:

- `[launcher]` — version check and launcher messages
- `[install]` — Node or Langflower install output
- `[folder-name]` — that project’s CLI output

If Node and Langflower are already current, the first line says they
already have current versions — that is not an install.

## If something goes wrong

| What you see                     | What to try                                               |
| -------------------------------- | --------------------------------------------------------- |
| Start stays grey                 | Install Node and/or Langflower; choose a folder           |
| “That folder could not be found” | Browse again; the path must exist                         |
| “No free port is available”      | Stop other Langflower instances using 4010–4109           |
| Gatekeeper / SmartScreen         | Unsigned zip — Open anyway as above                       |
| Editor does not load             | Wait for Running; open Details; try Open ↗                |
| Update offer every launch        | Skip is session-only; Update installs `langflower@latest` |

Need the terminal path instead? See
[Getting started](getting-started.md). Once a project is running, use
[Using the editor](using-the-editor.md).
