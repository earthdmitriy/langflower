# Code regression — SUMMARY

Date: 2026-09-20
Scope: full
Mode: **delta**, then drain of behavior + docs/delete baskets.

**Totals (open, counted from chunk `## Findings`):** Critical=0 · Important=7

Suggestions stay in the chunk reports and are not counted here.

2026-09-20 drain (behavior + docs/delete): 22 Important closed in
[LEDGER.md](LEDGER.md). Left open are the shuffling / no-repro cluster:
pack-cache collision, Sub-Agent `tap`, permission-floor ADR, websocket
`/ws` default, `runnerStatus` two-writers, draft credentials twin,
divider two-writers.

## Remaining Important

| Chunk                                   | id                                         | Why still open                                         |
| --------------------------------------- | ------------------------------------------ | ------------------------------------------------------ |
| [compiler](compiler.md)                 | `compiler-pack-cache-name-collision`       | Rare name alias; not first-pass                        |
| [common-nodes-ai](common-nodes-ai.md)   | `sub-agent-tap-history`                    | Large Sub-Agent refactor, no user repro                |
| [common-nodes-ai](common-nodes-ai.md)   | `permission-floor-twin-without-adr`        | ADR + parity only                                      |
| [websocket-bridge](websocket-bridge.md) | `websocket-bridge-server-ws-path-fallback` | Hardening if callers already pass `path`               |
| [server-core](server-core.md)           | `server-core-runner-status-two-writers`    | One-writer move without a lying-lock repro             |
| [server-core](server-core.md)           | `server-core-draft-credentials-twin`       | Share `resolveEnvRef` — same behavior if copies match  |
| [ui-editor](ui-editor.md)               | `ui-editor-divider-two-writers`            | Fold merge is shuffling; persist floor already shipped |

## Suggested leftover order

Do **not** start these without a repro or an ADR decision. They are
code-shuffling relative to the drain that just landed.

## Chunk index

- [shared](shared.md) — Critical=0 Important=0
- [node-sdk](node-sdk.md) — Critical=0 Important=0
- [runtime](runtime.md) — Critical=0 Important=0
- [tools](tools.md) — Critical=0 Important=0
- [compiler](compiler.md) — Critical=0 Important=1
- [common-nodes-ai](common-nodes-ai.md) — Critical=0 Important=2
- [common-nodes-domain](common-nodes-domain.md) — Critical=0 Important=0
- [common-nodes-rest](common-nodes-rest.md) — Critical=0 Important=0
- [eval](eval.md) — Critical=0 Important=0
- [langflower-mcp](langflower-mcp.md) — Critical=0 Important=0
- [websocket-bridge](websocket-bridge.md) — Critical=0 Important=1
- [server-bridge](server-bridge.md) — Critical=0 Important=0
- [server-core](server-core.md) — Critical=0 Important=2
- [ui-editor](ui-editor.md) — Critical=0 Important=1
- [ui-sidebar-feed](ui-sidebar-feed.md) — Critical=0 Important=0
- [ui-feed](ui-feed.md) — Critical=0 Important=0
- [ui-canvas](ui-canvas.md) — Critical=0 Important=0
- [ui-composer](ui-composer.md) — Critical=0 Important=0
- [ui-palette](ui-palette.md) — Critical=0 Important=0
- [ui-services](ui-services.md) — Critical=0 Important=0
- [ui-rest](ui-rest.md) — Critical=0 Important=0
- [cli](cli.md) — Critical=0 Important=0
- [integration-tests](integration-tests.md) — Critical=0 Important=0
- [launcher](launcher.md) — Critical=0 Important=0
