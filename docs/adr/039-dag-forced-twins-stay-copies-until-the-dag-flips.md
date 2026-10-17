---
kind: adr
owner: docs
covers: []
status: current
id: ADR-039
supersedes: []
superseded-by: []
package: docs
---

## ADR-039 — DAG-forced twins stay copies until the DAG flips

**Status:** accepted · **Date:** 2026-09-18

**Context:** `@langflower/shared` must not import `@langflower/tools` or
`@langflower/compiler` (UI/protocol kernel). Tools and compiler must not
import shared (I/O and pack toolchain stay below the product kernel).
`@langflower/mcp` must not import tools, and tools must not import mcp
(dev control plane vs workflow MCP client). Some contracts still need the
same bytes on both sides of those cuts: inspector option catalogs, secret-id
charset, MCP stdio/HTTP config shapes, custom-pack compile errors on the WS
snapshot, and MCP stdio frame parse.

**Alternatives considered:**

- **One module imported from both sides** — rejected: that either adds
  `tools → shared` / `compiler → shared` or `shared → tools` /
  `shared → compiler`, both forbidden by the package DAG. Same for
  `tools → mcp` / `mcp → tools`.
- **Move the owner into `node-sdk`** — both already depend on it, but
  MCP inventory ids, jsonc secret charset, builtin tool catalogs, and
  compile-error records are not author-SDK contracts ([ADR-026](./026-unified-mcp-inventory-toolhandle-no-harness-mcp.md),
  node-sdk AGENTS.md).
- **Keep copies with no ADR** — how the repo lived; agents treat twins
  as leftover glue and try to merge them.

**Decision:** Keep these copies. Each has one **owner** and a **snapshot
or inspector twin**. Parity tests are the gate. **Exit: no exit unless
the DAG flips** (a cheaper owner appears that both sides may already
import). Do not add a tools↔shared or compiler↔shared dependency to
delete a copy.

| Contract                      | Owner                                                                     | Twin                                                               | Gate                                                        |
| ----------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------- |
| Wired-tool inspector catalogs | tools `BUILTIN_TOOL_IDS` / `CRAWL_TOOL_CONFIGS` / `MEMORY_TOOL_CONFIGS`   | shared `HARNESS_BUILTIN_TOOL_OPTIONS` / `DOMAIN_PACK_TOOL_OPTIONS` | `wired-tool-options.parity.test.ts`                         |
| Secret id charset             | shared `langflower-config/secret-id.ts` (jsonc / Inspector)               | tools `secrets/secret-id.ts` (interpolator)                        | `secret-id.parity.test.ts`                                  |
| System MCP server entries     | shared `LangflowerMcpStdioServerConfig` / `LangflowerMcpHttpServerConfig` | tools `SystemMcpStdioEntry` / `SystemMcpHttpEntry`                 | structural; do not add a third comment-owner                |
| MCP stdio frame parse         | mcp `mcp-stdio-framing.ts` (server + encode/mode)                         | tools `mcp-stdio-frame-parser.ts` (client parse)                   | `mcp-stdio-frame-parser.parity.test.ts`                     |
| Pack compile errors           | compiler `CompilePackError` / `CompileDiagnostic`                         | shared `CustomPalettePackError` / `PaletteCompilationDiagnostic`   | field-for-field; server assigns `loaded.errors` (no mapper) |

MCP inventory encode/parse is **not** a twin: `@langflower/tools/mcp-tool-id`
is the only copy (server already depends on tools).

**Tradeoffs accepted:**

- (+) Package DAG and thin-server rule stay intact.
- (+) Drift fails a named parity test instead of a silent inspector/runtime split.
- (−) Two files to edit when a catalog id or charset changes.
- (−) Compile errors exist as filesystem records and as WS snapshot types.

**Consequences:**

- Server `custom-palette.service.ts` must not identity-map pack errors.
- Tools `mcp-tool-id.ts` has no shared copy; do not restore one.
- Revisit only if shared may import tools/compiler, or tools/compiler may
  import shared, without breaking UI or the compiler-start light path.
  Framing revisit only if mcp may import tools (or the reverse) without
  mixing the control plane with workflow I/O.

---
