# Langflower launcher

Thin **Slint** supervisor window. It does **not** embed the editor, does
not use WebView2, and does not bundle Node.js. The published npm CLI
remains the product process. See
[ADR-038](../docs/ADR.md#adr-038--launcher-is-a-cli-supervisor).

**Authors who do not know Rust:** start at
[docs/README.md](docs/README.md) (primer, architecture, source map,
window, build, tests). Agent rules:
[AGENTS.md](AGENTS.md).

**User manual:** [docs/public/launcher.md](../docs/public/launcher.md)
(the **?** button in the window opens this file on GitHub).

## What the window does

Pick a project folder, optionally install Node.js LTS / global
`langflower`, then **Start**. The launcher spawns
`node <bin> <folder> --no-open -p <port>` (default port **4010**, then
the next free port through **4109**). After the child prints
`LANGFLOWER_READY`, the **system browser** opens
`http://127.0.0.1:<port>`. Several folders can run at once. Closing the
window stops children **this** process started.

Details (disclosure at the bottom) is the CLI log. **Copy** puts it on
the clipboard. Detect lines use `[launcher]`; real installs use
`[install]`.

## Dogfood (dev)

From the repo root, with a built CLI (`npm run build` or at least
`packages/cli`) **and** a global `langflower` so Start enables
(`npm run install-local` or `npm install -g langflower`):

```bash
export LANGFLOWER_LAUNCHER_BIN="$(pwd)/packages/cli/bin/langflower.js"
npm run launcher:dev
```

On Windows Git Bash, the same `LANGFLOWER_LAUNCHER_BIN` override applies.
The override changes which bin is spawned; detect still looks at the
global install.

## GitHub Release (unsigned zip)

Published binaries are **not** on npm. GitHub Actions builds four zips on
tag `launcher-v*` (must match `version` in `Cargo.toml`) and on manual
**Run workflow** (`workflow_dispatch`):

- `langflower-launcher-windows-x64.zip`
- `langflower-launcher-windows-arm64.zip`
- `langflower-launcher-macos-arm64.zip`
- `langflower-launcher-macos-x64.zip`

plus `SHA256SUMS.txt`. npm CLI tags (`vX.Y.Z`) are a different series —
do not attach launcher zips to them.

The zip is a supervisor only. Install Node.js ≥ 22 and
`npm install -g langflower` separately. Windows SmartScreen and macOS
Gatekeeper will warn until a signing epic. On macOS: right-click → Open.

Windows ARM64 uses the GitHub-hosted `windows-11-arm` runner. If that
label is missing for the repo plan, switch the job to
`windows-latest` and `cargo build --target aarch64-pc-windows-msvc`.
macOS Intel is cross-compiled on `macos-latest`. NSIS/DMG stay later.

```bash
git tag launcher-v0.1.0
git push origin launcher-v0.1.0
```

Full release notes: [docs/build-and-release.md](docs/build-and-release.md).

## Maintainer build (local)

Requires the Slint software renderer, Node meeting `engines.node`, and a
Rust toolchain. `launcher` / `launcher:dev` / `launcher:build` install a
**portable** rustup under `.tools/rust/` (gitignored) and do not modify
the user PATH. GitHub Actions uses `dtolnay/rust-toolchain` instead of
that wrapper.

On Windows, Git's `link` is not the MSVC linker. If VS Build Tools are
absent, the wrapper uses `windows-gnu` plus MinGW `gcc` (for example
w64devkit). CMake is not required for the Slint UI.

```bash
npm install
npm run rust:install   # optional preflight
npm run launcher:test
npm run launcher:build
```

Output: `launcher/target/release/langflower-launcher.exe` (Windows)
or `langflower-launcher` (macOS/Linux).

## Layout

Slint markup in `ui/app-window.slint`. Window and `.exe` icons from
`ui/icon.png` / `ui/icon.ico` (cropped from `assets/Icon.png`). Spawn/install
in Rust. Lives at repo-root `launcher/` (not under `packages/`, which
is npm workspaces only). Not on the TS product DAG
(`build/lib/paths.mjs` PACKAGES). File-by-file map:
[docs/source-map.md](docs/source-map.md).

Recents: user-global `launcher.json` next to `langflower.jsonc` (ADR-002).
