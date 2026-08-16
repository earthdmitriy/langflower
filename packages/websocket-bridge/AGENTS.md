# @langflower/websocket-bridge

Generic typed WebSocket bridge — event-driven RxJS API over a hidden transport.

## Rules

- No `index.ts` — import concrete modules via `package.json` exports.
- No RPC — only `{ type, payload }` events. `injectInbound` on the server
  API is in-process event injection onto the same inbound observables as a
  socket (not request/response).
- Payload contract is compile-time via shared `WsBridgeConfig`; runtime guards
  only validate envelope routing.
- One config object for both `createClient` and `createServer`.

## Build

```bash
node build/tools/agent-run.mjs build-package websocketBridge
node build/tools/agent-run.mjs build-package websocketBridge typecheck
npm run test -w @langflower/websocket-bridge
```

## Modules

| Module               | Role                                    |
| -------------------- | --------------------------------------- |
| `bridge-types.ts`    | Config + typed API surface              |
| `bridge-subjects.ts` | Subject/Observable maps + routing       |
| `bridge-codec.ts`    | JSON envelope codec                     |
| `bridge-guards.ts`   | Envelope + known-type guards            |
| `create-client.ts`   | Browser `WebSocket` or Node `ws` client |
| `create-server.ts`   | Node `ws` server + `connections$`       |
