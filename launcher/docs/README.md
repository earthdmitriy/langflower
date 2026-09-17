# Langflower launcher — author guide

This folder documents the desktop **launcher**: a small native window that
starts the existing `langflower` CLI. You can read and change it without
knowing Rust first. Start here, then open the chapter you need.

| Chapter                                   | Read when                                                 |
| ----------------------------------------- | --------------------------------------------------------- |
| [Rust primer](rust-primer.md)             | You have never used Cargo / `.rs` files                   |
| [Architecture](architecture.md)           | You need the process model, events, or instance lifecycle |
| [Source map](source-map.md)               | You need “which file owns this behaviour?”                |
| [Window](window.md)                       | You are changing labels, layout, Details, or buttons      |
| [Build and release](build-and-release.md) | You need to run, compile, or ship zips                    |
| [Testing](testing.md)                     | You need to add or run launcher tests                     |

Operator-facing summary (what to download, how to dogfood):
[launcher/README.md](../README.md). Product decision:
[ADR-038](../../docs/ADR.md#adr-038--launcher-is-a-cli-supervisor).

## What this program is

The launcher is a **supervisor**, not the editor.

1. The window is a native Slint scene (no HTML, no Angular, no WebView2).
2. **Start** spawns the same process a terminal user would run:

    ```text
    node  <global langflower bin>  <projectDir>  --no-open  -p  <port>
    ```

3. The child CLI owns the HTTP server and the Angular UI. After it prints
   a `LANGFLOWER_READY` line, the launcher opens that URL in the **system
   browser**.
4. Several project folders can run at once. Each child gets its own port
   in **4010–4109**. Start / Stop / Open apply to the **selected** folder.
   Other children keep running.
5. Closing the launcher window stops **every child it started**. Closing a
   browser tab does not. Unrelated `langflower` processes (started from a
   terminal) are not signalled.

It does **not**:

- embed the canvas
- bundle Node.js, `ui-dist`, or the CLI `dist/`
- call `createServer` from Rust
- import `@langflower/server`, `@langflower/cli` sources, or the Angular
  UI
- live under `packages/` (that tree is npm workspaces only)

The published npm package remains the product. The launcher zip is an
optional start path for people who do not want a terminal.

## Mental model (TypeScript authors)

Think of three layers:

```text
Slint markup          ≈  HTML + CSS for one window
  ui/app-window.slint     (compiled at build time into Rust types)

ui.rs + ui_state.rs   ≈  a store + event handlers
                         (buttons write intents; a fold updates Model)

child / detect /      ≈  Node child_process + npm / winget helpers
install / recents
```

Background work (spawn CLI, install Node, `npm view`) runs on a **Tokio**
runtime — the same idea as Node’s event loop, but a separate thread pool.
The window thread stays free. Results come back as `UiEvent` values, which
the UI thread applies to `Model` and then copies into Slint properties.

There is no Angular, no RxJS, and no WebSocket inside this crate. The
editor’s WS bus starts only after the child CLI is listening.

## Hard rules (do not silently reverse)

- Do not add WebView / Electron to host the canvas, and do not revive
  Tauri as the launcher toolkit (already tried: WebView, large exe;
  then FLTK: moderate size, ugly UI; Slint is accepted). An embedded
  canvas would be a different product
  ([TBD-002](../../docs/TBD.md#tbd-002--embedded-canvas-desktop-shell)).
- Do not vendor Node or the CLI inside the zip.
- Do not auto-update Langflower. Offer **Update** / **Skip**.
- Do not open a URL unless it starts with `http://127.0.0.1:` or is
  the allow-listed GitHub user manual (`HELP_MANUAL_URL`).
- Do not persist live process state. Recents are paths only
  (`launcher.json` next to `langflower.jsonc`).
- Keep the software renderer. Do not turn on Slint GPU / Skia features
  without a new ADR.
- English UI copy only (project rule).

## Fast “where do I edit?”

| I want to…                       | Open                                                            |
| -------------------------------- | --------------------------------------------------------------- |
| Change a button label or layout  | `ui/app-window.slint`                                           |
| Change when Start is enabled     | `src/ui_state.rs` (`can_start`, `chrome`, `hint_text`)          |
| Change the first Details line    | `src/ui_state.rs` (`detect_log_line`, `log_channel`)            |
| Change spawn arguments           | `src/child.rs`                                                  |
| Change READY parsing             | `src/ready_line.rs` **and** `packages/cli/src/start-command.ts` |
| Change Node / CLI install        | `src/install.rs`                                                |
| Change version detection         | `src/detect.rs`                                                 |
| Change recents path / cap        | `src/recents.rs`                                                |
| Change port range                | `src/ports.rs`                                                  |
| Copy Details to clipboard        | `src/clipboard.rs` + Copy callback in `src/ui.rs`               |
| Help **?** opens the user manual | `src/open_url.rs` (`HELP_MANUAL_URL`) + `ui/app-window.slint`   |
| Run / test / release             | [build-and-release.md](build-and-release.md)                    |

If you only change Slint or Rust **copy**, you still compile with
`npm run launcher:dev` (or `:test`). There is no hot reload like `ng serve`.

## What “done” means for this crate

TypeScript gates (`npm run typecheck`, `npm run test` / `verify`) do
**not** compile the launcher. After a launcher change, also run:

```bash
npm run launcher:test
```

CI for this crate is `.github/workflows/launcher-ci.yml` (`cargo test
--locked` on Windows and macOS). It is path-filtered to `launcher/**`.
