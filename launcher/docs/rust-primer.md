# Rust primer for this crate

You do not need to become a Rust programmer to change the launcher. This
page maps **this crate only** onto TypeScript habits. It is not a general
Rust tutorial.

## Cargo ≈ npm, for one package

| npm                                 | Cargo (here)                                          |
| ----------------------------------- | ----------------------------------------------------- |
| `package.json`                      | `launcher/Cargo.toml`                                 |
| `package-lock.json`                 | `launcher/Cargo.lock` (commit it)                     |
| `node_modules/`                     | downloaded crates + `launcher/target/` (gitignored)   |
| `"name"` / `"version"`              | `[package] name` / `version`                          |
| `"dependencies"`                    | `[dependencies]`                                      |
| `"devDependencies"`                 | not used; tests live in the same crate                |
| `npm install`                       | first `cargo build` / `cargo test` fetches crates     |
| `npm run build`                     | `cargo build --release`                               |
| `npm test`                          | `cargo test`                                          |
| workspace package under `packages/` | **not this.** The crate sits at repo-root `launcher/` |

From the **repo root**, prefer the npm wrappers so a portable Rust
toolchain is installed under `.tools/rust/` (gitignored) and your user
PATH is left alone:

```bash
npm run rust:install      # download rustc/cargo once
npm run launcher:dev      # cargo run (debug window)
npm run launcher:build    # cargo build --release
npm run launcher:test     # cargo test
```

Those scripts `cd` into `launcher/` for you. Running bare `cargo` only
works if you already have Rust on PATH **and** your current directory is
`launcher/`.

GitHub Actions does **not** use the portable wrapper. It installs Rust
with `dtolnay/rust-toolchain`.

## Crate, lib, and bin

One Cargo package can expose:

- a **library** (`src/lib.rs`) — other Rust files and tests `use`
  `langflower_launcher::…`
- a **binary** (`src/main.rs`) — the `.exe` / `langflower-launcher`
  the user double-clicks

`src/main.rs` is a few lines: start a Tokio runtime, then call
`langflower_launcher::ui::run(…)`. Almost all behaviour lives in the
library so tests can call it without opening the window.

`src/lib.rs` is a **module list**, not a TypeScript barrel that re-exports
types. Each `pub mod foo;` means “compile `src/foo.rs`”.

## File = module

| You see                                     | Meaning                   |
| ------------------------------------------- | ------------------------- |
| `src/detect.rs`                             | module `detect`           |
| `pub fn detect_runtime()`                   | exported from that module |
| `use crate::detect::detect_runtime;`        | import from this crate    |
| `use crate::detect::{self, DetectRuntime};` | module + one type         |

There is no `index.ts`. Do not add one. Keep helpers next to the one
consumer unless two files share them.

## Types you will keep hitting

### `String` vs `&str`

- `String` — owned text (like a JS string you can store).
- `&str` — borrowed slice (like reading a string without copying).

Function arguments often take `&str`. Stored fields on `Model` are usually
`String`. `.to_string()` / `.into()` copy into an owned `String`.

### `Option<T>` ≈ `T | undefined`

```rust
pub node_version: Option<String>,  // Some("v22.22.3") or None
```

Callers write `if let Some(version) = …` or `.map(|item| …).unwrap_or(…)`.
There is no implicit `undefined`. Missing values must be handled.

### `Result<T, E>` ≈ expected failure

Langflower TypeScript uses `{ ok: true | false }`. This crate uses Rust’s
`Result`:

```rust
pub fn allocate_port(reserved: &[u16]) -> Result<u16, String>
```

- `Ok(4010)` — success.
- `Err("No free port…")` — expected failure, usually shown in Details.

`?` at the end of a call means “if Err, return it to the caller”
(similar to throwing, but typed). The UI layer turns `Err` into a log
line plus a human hint. Do not `unwrap()` / `expect()` in product paths
except for “the window could not even be created” at startup.

### `enum` for states

```rust
pub enum RunStatus {
    Ready,
    Starting,
    Running,
    Stopping,
    Error,
}
```

This is a closed set, like a string union `'ready' | 'starting' | …` that
the compiler checks. `match status { … }` must cover every variant.

### `struct` for records

```rust
pub struct DetectRuntime {
    pub node_ok: bool,
    pub min_node: String,
    // …
}
```

`pub` means other modules may read the field. There are no Angular
services; data is plain structs moved or borrowed between functions.

## `match` instead of a switch

```rust
match project_key {
    "installer" => "install".to_string(),
    "launcher" => "launcher".to_string(),
    other => project_name(other),
}
```

If you add a variant to an enum, `cargo test` / `cargo build` will fail
until every `match` is updated. That is the point.

## `async` / Tokio ≈ Node event loop, split out

`async fn spawn_cli(…)` awaits child I/O. Tokio is the runtime (started
in `main.rs`).

The **Slint window cannot await**. So:

1. A button callback runs on the UI thread.
2. It `rt.spawn(async move { … })` work onto Tokio.
3. That work `tx.send(UiEvent::…)` when done.
4. The UI thread `match`es the event and updates `Model`.

Do not call `std::thread::sleep` or run `npm install` on the UI thread.
Install and spawn already go through Tokio.

`#[tokio::test(flavor = "multi_thread")]` is required when a test both
spawns async work **and** blocks on `recv` for events. A single-thread
Tokio test can deadlock (the wait never lets the spawn run). See
`tests/multi_instance.rs`.

## `#[cfg(windows)]` — compile-time `if (process.platform)`

```rust
#[cfg(windows)]
{ /* winget install */ }

#[cfg(target_os = "macos")]
{ /* official .pkg */ }
```

Code behind `#[cfg(windows)]` does not exist in the macOS binary, and
the other way around. Linux Node install is explicitly out of scope for
v1 (`Err("Linux Node install is out of scope…")`).

`path_env.rs` also maps `npm` → `npm.cmd` on Windows and hides extra
console windows (`CREATE_NO_WINDOW`).

## Ownership in one sentence

Rust will not let two places **mutate** the same value at the same time
without a lock. The launcher keeps UI state in a `Model` inside a
`RefCell`, reached through a thread-local `CTX` so Slint callbacks can
find it. Child processes live in `ChildSlot` (`Mutex<Option<Child>>`)
because Tokio tasks need to kill them from another thread.

If the compiler talks about “borrow” / “moved value”, you usually need
`.clone()` on a handle (`UiSender`, `ChildSlot`, `String` for a path)
before an `async move` block. Cloning those handles is cheap (they wrap
`Arc`). Cloning huge logs is not — the Details pane concatenates
`log_lines` only when syncing the UI.

## Slint is not HTML

`ui/app-window.slint` is a declarative UI language. `build.rs` compiles
it **before** Rust compiles. `slint::include_modules!()` in `ui.rs`
brings in a generated `LauncherWindow` type with:

- `get_*` / `set_*` for properties (`project-path` → `set_project_path`)
- `on_*` for callbacks (`start-clicked` → `on_start_clicked`)

Property names use hyphens in Slint and underscores in Rust. Changing a
property name in `.slint` without updating `ui.rs` fails the build, which
is what you want.

Slint **Text** in the Details pane is not selectable. Copy is a button
(`copy-log-clicked` → `arboard` clipboard). Do not fight the widget;
keep the button.

The software renderer **cannot** combine `drop-shadow` with
`clip` + `border-radius`. If a visual tweak “should work” and the window
goes blank or asserts, that restriction is why.

## Common compiler messages

| Compiler says                             | Typical cause                                                                          |
| ----------------------------------------- | -------------------------------------------------------------------------------------- |
| `cannot find value` / `unresolved import` | Typo, or you forgot `pub mod` in `lib.rs`                                              |
| `mismatched types`                        | `String` vs `&str`, or `Option` vs bare value                                          |
| `use of moved value`                      | You passed a `String` into a function that took ownership; `.clone()` or pass `&str`   |
| `borrowed as mutable`                     | Two overlapping `&mut` to `Model`; do the read, then the write                         |
| `match must be exhaustive`                | New enum variant; add an arm                                                           |
| `unused import` / `unused variable`       | Prefix with `_` or delete; CI treats warnings depending on flags — still clean them up |

`cargo test` compiles **and** runs tests. A type error looks like a test
failure at the top, but the body is a compiler diagnostic. Scroll to the
`error[E0…]` line.

## Formatting and line length

This crate uses tabs and tries to keep lines near 80 columns (same
spirit as the TypeScript house style). There is no Prettier for Rust in
the root `npm run format` path. Match neighbouring files.

## What you can ignore (for now)

You do not need: lifetimes (`'a`), unsafe (except the Unix `kill` process
group in `child.rs`), macros beyond `println!` / `format!` /
`slint::include_modules!()`, or traits. If a change seems to require
those, stop and ask — the crate is deliberately small.
