# Build, dogfood, and release

How to run the window on a development machine, what the npm wrappers
do, and how unsigned zips get onto GitHub Releases.

## Prerequisites

- Node.js meeting root `engines.node` (today **≥ 22.22.3**) — same as
  the product CLI.
- A C linker:
    - **Windows + VS Build Tools** (“Desktop development with C++”) →
      MSVC `link.exe` and the `windows-msvc` toolchain.
    - **Windows without VS** → MinGW `gcc` (for example w64devkit) and the
      `windows-gnu` toolchain. Git Bash `link` is **not** the MSVC linker;
      the wrapper ignores Git’s `/usr/bin/link`.
    - **macOS** → Xcode command-line tools (`clang`).
- Network the first time, to download rustup + crates.

CMake is **not** required for the Slint software renderer.

You do **not** need a system-wide Rust install. Prefer the portable
toolchain.

## Portable Rust (local)

`launcher/scripts/with-portable-rust.mjs`:

1. Creates `.tools/rust/` (`RUSTUP_HOME`, `CARGO_HOME`) — gitignored
   via repo `.tools/`.
2. Downloads `rustup-init` from `static.rust-lang.org` if needed
   (`--no-modify-path`, minimal profile, stable).
3. Picks host triple (MSVC vs GNU on Windows; arm64 vs x64 on macOS).
4. Sets `CARGO_TARGET_DIR` to `launcher/target/`.
5. Runs the rest of the command with that env.

Root `package.json` scripts (cwd = repo root):

```bash
npm run rust:install     # only ensure the toolchain
npm run launcher         # same as launcher:dev
npm run launcher:dev     # cargo run  → debug binary + window
npm run launcher:build   # cargo build --release
npm run launcher:test    # cargo test
```

`launcher/package.json` duplicates those paths for people who `cd
launcher`. It is **not** an npm workspace member.

CI never calls this script. Workflows use `dtolnay/rust-toolchain@stable`
plus `Swatinem/rust-cache`.

## Dogfood (run against this repo’s CLI)

Build the TypeScript CLI first (`npm run build` or at least the CLI
package). Then from the repo root:

```bash
export LANGFLOWER_LAUNCHER_BIN="$(pwd)/packages/cli/bin/langflower.js"
npm run launcher:dev
```

Git Bash on Windows: the same `export` works.

Start still requires detect to see **Node + a global `langflower`**. The
env var only replaces the **bin that is spawned**. Typical setup: install
or link the CLI once (`npm run install-local` or `npm install -g
langflower`), then use the override so clicks run your working tree.

The window runs:

```text
node  $LANGFLOWER_LAUNCHER_BIN  <folder>  --no-open  -p  <port>
```

Several folders at once are expected.

## Local release binary

```bash
npm run launcher:test
npm run launcher:build
```

Output:

| OS            | Path                                              |
| ------------- | ------------------------------------------------- |
| Windows       | `launcher/target/release/langflower-launcher.exe` |
| macOS / Linux | `launcher/target/release/langflower-launcher`     |

That file is the whole app. It does not include Node or the CLI. Zip it
yourself only for local sharing; official assets come from GitHub
Actions.

Release profile (`Cargo.toml`): small binary (`opt-level = "z"`, LTO,
single codegen unit, strip, `panic = abort`). Debug `cargo run` is
larger and slower to start, and on Windows still shows a console.

## GitHub Actions

### CI — `.github/workflows/launcher-ci.yml`

Runs on push/PR to `master` when `launcher/**` or the two launcher
workflows change.

- Matrix: `windows-latest`, `macos-latest`
- `cargo test --locked` in `launcher/`
- `MACOSX_DEPLOYMENT_TARGET=11.0`

`--locked` means `Cargo.lock` must match `Cargo.toml`. After adding a
crate, commit the lockfile.

### Release — `.github/workflows/launcher-release.yml`

Triggers:

- Push tag `launcher-v*` (for example `launcher-v0.1.0`)
- Manual **Run workflow** with a `launcher-v*` tag name

On a **tag push**, the job fails if the tag suffix ≠
`version` in `launcher/Cargo.toml`. Manual dispatch skips that check and
can publish the current SHA onto an existing tag.

Matrix:

| Asset zip                               | Runner                 | Target                    |
| --------------------------------------- | ---------------------- | ------------------------- |
| `langflower-launcher-windows-x64.zip`   | `windows-latest`       | `x86_64-pc-windows-msvc`  |
| `langflower-launcher-windows-arm64.zip` | `windows-11-arm`       | `aarch64-pc-windows-msvc` |
| `langflower-launcher-macos-arm64.zip`   | `macos-latest`         | `aarch64-apple-darwin`    |
| `langflower-launcher-macos-x64.zip`     | `macos-latest` (cross) | `x86_64-apple-darwin`     |

Native jobs run `cargo test --locked` then `cargo build --release
--locked --target …`. The Intel macOS zip is **cross-compiled**; tests
are skipped for that target.

If GitHub does not provide `windows-11-arm` on this repo’s plan, switch
that job to `windows-latest` and keep `--target aarch64-pc-windows-msvc`
(cross). Documented in the operator README.

Each zip contains **only the binary** (plus execute bit on non-Windows).
`publish` downloads the four zips, writes `SHA256SUMS.txt`, and creates
a GitHub Release titled `Launcher X.Y.Z`.

npm CLI tags are **`vX.Y.Z`**. Never attach launcher zips to those
releases.

## How to cut a launcher release

From [docs/RELEASE.md](../../docs/RELEASE.md):

1. Bump `version` in `launcher/Cargo.toml` (and commit `Cargo.lock` if
   it changed).
2. Tag and push:

    ```bash
    git tag launcher-vX.Y.Z
    git push origin launcher-vX.Y.Z
    ```

3. Wait for the workflow. Download zips from the GitHub Release.

Unsigned v1: Windows SmartScreen and macOS Gatekeeper warn. On macOS:
right-click the binary → Open. NSIS / DMG / signing / notarization /
binary auto-update are **not** in this crate yet (ADR-038 revisit).

## Operator install (what the zip does not do)

The person who downloads a zip still needs:

1. Node.js ≥ 22 (the window can offer LTS via winget / official pkg).
2. `npm install -g langflower`.

Then they run `langflower-launcher.exe` / `langflower-launcher`.

## Troubleshooting local builds

| Symptom                             | Likely cause                                                                |
| ----------------------------------- | --------------------------------------------------------------------------- |
| `link` errors about coff / msvc     | Git `link.exe` used; install VS Build Tools or MinGW and re-run the wrapper |
| `No MSVC link.exe and no MinGW gcc` | Wrapper exited on purpose — install a linker                                |
| Window never appears, cargo stuck   | First crate compile of Slint is slow (minutes). Watch `Compiling slint`     |
| Start disabled forever              | Detect sees no global CLI or Node too old; open Details                     |
| Spawn uses old CLI                  | Unset vs set `LANGFLOWER_LAUNCHER_BIN`; confirm `npm root -g`               |
| Port errors                         | Something already bound 4010–4109; Stop other instances                     |
| macOS “damaged” / cannot open       | Gatekeeper on unsigned binary — right-click → Open                          |
| Tests hang on `multi_instance`      | Must stay `#[tokio::test(flavor = "multi_thread")]`                         |

## TypeScript gates vs this crate

`npm run typecheck` and `npm run test` / `verify` **do not** build the
launcher. They still must pass when you also touch TS/docs that the
monorepo checks. For a launcher-only change:

```bash
npm run launcher:test
```

When the change set includes both Rust and TypeScript, run launcher
tests **and** the monorepo typecheck + full verify (project hard gate).
