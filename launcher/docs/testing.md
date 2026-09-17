# Testing the launcher

Launcher tests are **Cargo tests**, not Vitest. They live in
`launcher/tests/` and link the library crate. They never open the Slint
window.

## Run

From the repo root:

```bash
npm run launcher:test
```

Equivalent (already inside the portable-Rust wrapper, cwd `launcher/`):

```bash
cargo test
cargo test --locked    # what CI runs
```

Useful filters:

```bash
# inside launcher/, with PATH already set by the wrapper
cargo test detect_log_line
cargo test --test instances
cargo test --test multi_instance
```

`npm run launcher:test` does not take those extra args today; use the
wrapper if you need a filter:

```bash
node ./launcher/scripts/with-portable-rust.mjs cargo test detect_log_line
```

## What “a test file” is

Each `tests/*.rs` is its own binary:

```rust
use langflower_launcher::ui_state::detect_log_line;

#[test]
fn detect_log_line_when_versions_are_current() {
    assert_eq!(
        detect_log_line(true, Some("v22.22.3"), "22.22.3", Some("0.1.2"), false),
        "Node.js v22.22.3 and Langflower 0.1.2 already have current versions."
    );
}
```

`#[test]` is the `it('…')` equivalent. `assert_eq!` prints both sides on
failure.

You do not import `.ts` files. You also do not start port 4010 from
Vitest for these tests.

## Map of suites

| File                 | Style              | Why it exists                                                        |
| -------------------- | ------------------ | -------------------------------------------------------------------- |
| `ui_state.rs`        | Pure               | Button chrome, hints, detect wording, `[install]` vs `[launcher]`    |
| `instances.rs`       | In-memory manager  | Two projects, reserved ports hidden until READY, stop isolation      |
| `ports.rs`           | Real `TcpListener` | Skip bound + reserved ports                                          |
| `recents.rs`         | Pure JSON          | Cap 8, unique prepend, remove, bad JSON → empty                      |
| `ready_line.rs`      | Pure               | Ignore human logs; parse READY JSON                                  |
| `node_semver.rs`     | Pure               | `v` prefix, `engines.node` `>=`, compare                             |
| `last_event_line.rs` | Pure               | `Last event:` + TTY `\r`                                             |
| `open_url.rs`        | Pure               | Localhost allow-list + exact GitHub help URL                         |
| `multi_instance.rs`  | Process            | Two `stub-langflower.mjs` children, distinct ports, independent stop |

`stub-langflower.mjs` is a tiny Node HTTP server that prints
`LANGFLOWER_READY` — it is **not** the product CLI. The test sets
`LANGFLOWER_LAUNCHER_BIN` to that stub.

`multi_instance.rs` **must** use
`#[tokio::test(flavor = "multi_thread")]`. A current-thread Tokio test
that `recv()`s events while the spawn needs the same thread will hang
until timeout.

## What we do not test here

- Pixel layout / Slint screenshots
- winget / macOS pkg (would need admin and network)
- GitHub Actions zip publishing
- Angular editor
- Monorepo `verify` integration tests

If you change spawn/READY/stop, prefer a library test or
`multi_instance` over “I clicked the window once.”

## How to add a test (no Rust fluency required)

1. Identify the **pure** function (`ui_state`, `ready_line`, `ports`,
   …). Put the case next to existing tests in that file.
2. Copy the nearest `#[test] fn name() { … }` block. Function names are
   `snake_case`.
3. `npm run launcher:test`.
4. If you only changed Slint literals, a new test is optional; still run
   the suite so the `.slint` still compiles (`build.rs` runs on every
   `cargo test`).

If the behaviour is “button X calls spawn,” test the **fold**
(`InstanceManager::begin_start`) or the **child** (`spawn_cli` with the
stub), not the callback wiring. Callbacks are glue; they go stale if
you snapshot them.

## Contract tests that live in TypeScript

READY and `--no-open` are owned by the CLI. If you change the READY
JSON shape, update **both**:

- `packages/cli/src/start-command.ts` (+ its `.test.ts`)
- `launcher/src/ready_line.rs` + `launcher/tests/ready_line.rs`

CI will not fail the CLI job when you only edit `launcher/`, and the
launcher CI will not run CLI Vitest. Cross-edit both in the same change.

## After tests

Launcher-only: green `npm run launcher:test` is the crate gate.

If you also touched TypeScript, still run the monorepo hard gate
(`typecheck` **and** full `test` / `verify`). Green Cargo is not a
`tsc` pass.
