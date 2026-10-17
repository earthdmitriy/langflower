---
kind: adr
owner: docs
covers: []
status: current
id: ADR-011
supersedes: []
superseded-by: []
package: docs
---

## ADR-011 — Cross-platform build scripts (Node + bash)

**Status:** accepted · **Date:** 2026-06-16

**Context:** Agents and developers run on Windows without guaranteed bash; raw
`npm run -ws` output is hard to parse on failure.

**Alternatives considered:**

- **bash-only scripts** — fine on macOS/Linux, fails on Windows CMD/PowerShell.
- **npm scripts only, no wrapper** — no structured error summaries for agents.
- **Make / just / task runners** — extra install, less universal in Node ecosystem.

**Decision:** Node `.mjs` implementations with formatted errors; optional bash
wrappers; `build/tools/agent-run.mjs` for Windows.

**Tradeoffs accepted:**

- (+) One implementation (Node), multiple entrypoints.
- (+) Readable failure output for CI and agents.
- (−) Duplication of entrypoint names (`.sh` + `.mjs` + `agent-run.mjs`).
- (−) `npm run build` assumes bash on PATH where configured.

**Consequences:**

- Agents on Windows: prefer `node build/tools/agent-run.mjs <cmd>`.

---
