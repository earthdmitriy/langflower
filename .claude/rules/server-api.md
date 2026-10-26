---
paths:
    - 'packages/server/**'
---

# Server package

- **WebSocket** (`bridge/attach-langflower-bridge.ts`) — default UI API; use
  `@langflower/shared/langflower-bus-config` via `@langflower/websocket-bridge`.
  Call stack: `bridge/BRIDGE.md`.
- **REST** (`api/`) — ADR-approved bulk escape hatches only.
- Logic: `session/`, `workflow/`, `palette/`, `config/` — Observables, immutable FS transforms.
- **Never** modify files outside `.langflower/` in user projects.
- Bind localhost only. Registry = immutable snapshots.
- Templates: `templates/` copied on bootstrap.
- See `packages/server/AGENTS.md` and `docs/architecture/ARCHITECTURE.md`.
