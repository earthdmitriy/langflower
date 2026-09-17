# langflower-launcher

Slint supervisor. **Do not** import `@langflower/server`,
`@langflower/cli` sources, or the Angular UI.

Spawn `node <global langflower bin> <projectDir> --no-open -p <port>`.
One child per project folder; several may run at once.
Dev override: `LANGFLOWER_LAUNCHER_BIN` (spawn only; Start still needs
detect to see Node + a global CLI).

GitHub Release zips: tag `launcher-v*` (must match `Cargo.toml` version).
CI is `dtolnay/rust-toolchain` + `cargo`, not `with-portable-rust.mjs`.

This crate is `launcher/` at the repo root. It is **not** an npm
workspace package.

Author guide (no Rust assumed): [docs/README.md](docs/README.md).
Also [README.md](README.md) and
[ADR-038](../docs/ADR.md#adr-038--launcher-is-a-cli-supervisor).
