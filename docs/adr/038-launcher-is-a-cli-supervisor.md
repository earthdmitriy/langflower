---
kind: adr
owner: docs
covers: []
status: current
id: ADR-038
supersedes: []
superseded-by: []
package: docs
---

## ADR-038 — Launcher is a CLI supervisor

**Status:** accepted · **Date:** 2026-09-16 · **Updated:** 2026-09-17

**Context:** Operators who are not comfortable with a terminal still need
to pick a project folder, start Langflower, and open the editor. The
goal is a **thin supervisor window**, not a particular GUI toolkit and
not an app that hosts the Angular canvas. Embedding the canvas in a
WebView (Tauri, Electron, WebView2) would duplicate the product process,
pull a browser runtime (WebView2 is missing on some Windows LTSC
images), and blur “tool in the user’s repo” with “the app is the canvas.”

**Tried, then replaced (toolkit path):**

1. **Tauri 2 / WebView2** — tried first as an easy native window. Rejected:
   WebView dependency, **large** executable (~22 MB class), and a second
   UI stack if used to host the editor. Tauri was never the product
   goal; it was one candidate for “a small window.”
2. **FLTK native widgets** — tried next. No WebView, **moderate** size
   (~12 MB), but the window looked like a debug form (ugly UI). Also
   needs cmake/g++ or a bundled MSVC build on Windows GNU. Replaced.
3. **Slint** with the **software renderer** — accepted. **Smallest**
   binary, decent UI, no WebView, no GPU/Skia path.

**Also considered, not adopted:** Qt / Slint Skia / egui (heavy or GPU);
CLI only (already ships; does not cover the non-terminal operator);
embedding the editor in any webview shell (separate long-horizon item,
[TBD-002](../_work/TBD.md#tbd-002--embedded-canvas-desktop-shell)).

**Decision:** The desktop window is a **supervisor**, not a runtime.

1. **Slint** with the **software renderer** (no Skia, no FemtoVG, no
   WebView). Markup in `launcher/ui/`; process logic in Rust.
2. Spawn the published CLI: `node <global langflower bin> <projectDir>
--no-open -p <port>`. Default port **4010**; later instances get the
   next free port in 4010–4109. Dev override: `LANGFLOWER_LAUNCHER_BIN`.
3. Parse `LANGFLOWER_READY` JSON on child stdout. Open that instance’s
   local URL in the **system browser** only after READY
   (`http://127.0.0.1:…`). Each project has its own child, status, and
   port. Start/Stop/Open apply to the **selected** project; other
   instances keep running.
4. Recents live in user-global `launcher.json` next to
   `langflower.jsonc` (ADR-002). Not in the project tree. Live process
   state is not persisted.
5. Closing the launcher stops **all children it started**. Closing a
   **browser tab** does not (epic 19 detach). Unrelated Langflower
   processes are not signalled.
6. v1 packaging is a zip per OS/arch, published as a GitHub Release on
   tag `launcher-v*` (and `workflow_dispatch`). Windows zips are
   unsigned. macOS zips contain **`Langflower.app`** (not a naked Mach-O,
   so Finder does not open Terminal), ad-hoc signed
   (`codesign --force --sign -`) so the arm64 seal covers `Info.plist`.
   That tag series is **not** the npm CLI tag `vX.Y.Z`. NSIS/DMG,
   Developer ID, notarization, and binary auto-update are later.

**Tradeoffs accepted:**

- (+) No WebView2; works on Windows without a browser control.
- (+) Product process stays the npm CLI; one spawn path with the
  terminal.
- (+) Software renderer keeps GPU/OpenGL out of the default path.
- (−) Window is not the canvas; users still need a system browser for
  the editor.
- (−) Slint royalty-free / GPL dual license must stay acceptable for
  the launcher crate.
- (−) Software renderer cannot use `drop-shadow` or `clip` +
  `border-radius` together.

**Consequences:**

- Code: [`launcher/`](../../launcher).
- Docs: this ADR; epic 46 (`docs/_archive/DONE/EPICS/46-launcher.md`);
  [launcher author guide](../../launcher/docs/README.md) (written for
  maintainers who do not know Rust).
- Embedding the canvas in a native webview remains
  [TBD-002](../_work/TBD.md#tbd-002--embedded-canvas-desktop-shell) — not a
  launcher follow-up.

**Revisit trigger:** Signing / NSIS / DMG; or a product decision to
embed the editor (new ADR). Do not silently revive Tauri, FLTK, or a
WebView host as “the launcher.”

---
