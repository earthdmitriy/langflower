# Window (Slint)

The launcher UI is **one window**, described in `ui/app-window.slint` and
driven from `src/ui.rs`. There is no router, no second page, and no
embedded browser.

## What the operator sees

Top to bottom:

1. Flower mark + **Langflower** title + header pill (**Ready** green or
   **Working…** amber while an installer runs). The pill is **global**
   (install), not per-project. A **?** help icon opens the user manual
   on GitHub (`docs/public/launcher.md`).
2. **Choose your project** — path field + **Browse** (native folder
   dialog via `rfd`).
3. **Recent projects** — up to 8 rows. Each row: folder name, full path,
   status, port (only when Running), optional **Open UI ↗**, and **×** to
   drop the path from recents (does not Stop a running instance).
4. Conditional install row: **Install Node.js**, **Install Langflower** /
   **Update (x → y)**, **Skip**.
5. Primary action for the **selected** folder: **Start Langflower**, or
   **Stop Langflower**, or Stop + **Open Langflower ↗**.
6. Hint line (muted): “Ready to start”, “demo is running on port 4011”,
   human errors, “This may take a minute…”.
7. **Details** disclosure. Open: dark log + **Copy**. Closed: one-line
   chevron. Log text is not selectable.

Window size: preferred 560×640, min 480×520. Background `#F4F1EC`.

## Properties vs callbacks

Slint **properties** are the view model. Rust writes them in `sync_ui`.
Hyphens in Slint become underscores in Rust (`hint-text` →
`set_hint_text`).

| Slint property                                                | Meaning                                   |
| ------------------------------------------------------------- | ----------------------------------------- |
| `project-path`                                                | Selected folder (in-out; typing edits it) |
| `recents`                                                     | `[RecentItem]` list                       |
| `status-text` / `status-color`                                | Header pill                               |
| `hint-text`                                                   | Line above Details                        |
| `details-text`                                                | Full concatenated log                     |
| `details-open`                                                | Disclosure; UI-local, not in `Model`      |
| `show-start` / `show-stop` / `show-open`                      | Which primary buttons exist               |
| `start-enabled` / `stop-enabled` / `open-enabled`             | Dim vs active                             |
| `browse-enabled` / `project-enabled`                          | Locked during install                     |
| `show-install-node` / `show-install-cli` / `show-skip-update` | Install row                               |
| `install-cli-label`                                           | “Install Langflower” or “Update (a → b)”  |

**Callbacks** are button clicks. Rust registers `ui.on_start_clicked(…)`.

| Callback                                       | Typical effect                      |
| ---------------------------------------------- | ----------------------------------- |
| `browse-clicked`                               | Folder picker → `project-path`      |
| `project-edited`                               | Re-run `sync_ui` (Start enablement) |
| `recent-clicked`                               | Select that path                    |
| `recent-open-clicked`                          | Open that instance’s URL            |
| `recent-remove-clicked`                        | Drop path from recents + persist    |
| `start-clicked`                                | Allocate port, spawn CLI            |
| `stop-clicked`                                 | Kill selected child tree            |
| `open-clicked`                                 | Open selected Running URL           |
| `install-node-clicked` / `install-cli-clicked` | Tokio installer                     |
| `skip-clicked`                                 | Hide Update for this session        |
| `copy-log-clicked`                             | Clipboard                           |
| `help-clicked`                                 | Open GitHub user manual             |

Enter in the path field fires `start-clicked`. Space / Enter on
`ActionButton` also clicks (FocusScope). Clickable `TouchArea`s use
`mouse-cursor: pointer` (buttons only while enabled). The path field
keeps the text caret.

## Chrome state machine

Pure function `chrome(status, installing, can_start, ready)` in
`ui_state.rs`. `ready` means Running **and** a URL exists.

| Selected status | Buttons                                |
| --------------- | -------------------------------------- |
| Ready / Error   | Start (enabled if `can_start`)         |
| Starting        | Stop                                   |
| Running         | Stop + Open (Open enabled after READY) |
| Stopping        | none (brief)                           |

Browse stays enabled unless `installing`. You can select another recent
and Start it while the first is Running. You cannot Start the same
folder twice.

Header colour: Ready `(0x2F, 0x7D, 0x4A)`, Working `(0xB4, 0x53, 0x09)`.
Recent-row dots use the same greens / amber / danger / muted.

## Copy you can change without Rust

Safe in `.slint` alone:

- Window title, section headings, button labels that are **literals**
  (“Browse”, “Copy”, “Open UI ↗”, “Start Langflower”, “Stop Langflower”)
- Theme colours in `global Theme`
- Spacing, radii, min sizes
- Empty recents string (“No recent projects yet”)

Must stay in `ui_state.rs` (English, tested):

- Header “Ready” / “Working…”
- All `hint_text` / `human_error` strings
- Detect Details lines
- Recents status “Not running” / “Starting…” / “Running” / …
- Install CLI label is built in `ui.rs` (`Update ({local} → {remote})`)

Do not mix languages. Product copy is English even if chat with the
maintainer is not.

## Details pane

- Closed: transparent, 28 px, `▸  Details`.
- Open: `#1E1A16` panel, `▾  Details` + **Copy**, `Flickable` stuck to
  the bottom (`content-y` follows new lines).
- Font: `"Cascadia Mono, Consolas, Menlo, monospace"`, 11 px, `#D7D0C6`.
- Software renderer: avoid `drop-shadow` and avoid `clip` together with
  `border-radius`.

Copy does not toast. Success is silent. Failure appends a `[launcher]`
line.

## Icons

`ui/icon.png` is the window icon and the in-title flower. `ui/icon.ico`
is embedded into the Windows exe by `build.rs`. Both are cropped from
repo `assets/Icon.png`. If you replace them, keep `cargo:rerun-if-changed`
in `build.rs` in sync (already listed).

## If the window looks wrong after a Slint edit

1. Rebuild (`npm run launcher:dev`). There is no HMR.
2. Check the software-renderer restrictions above.
3. If you renamed a property or callback, fix `ui.rs` `set_*` / `on_*`.
4. `if root.details-open:` style conditionals create/destroy children;
   do not store Slint component state that must survive a toggle except
   `details-open` itself.
