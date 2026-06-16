# @langflower/websocket-bridge

Generic typed WebSocket bridge — event-driven RxJS API over a hidden transport.

No RPC, no request/response envelopes. Peers exchange `{ type, payload }` events.
Payload shapes are enforced at compile time via a shared `WsBridgeConfig`; runtime
checks only validate JSON envelope routing.

## Depends on

- `rxjs`
- `ws` (Node server; Node client fallback when `globalThis.WebSocket` is absent)

## Used by

Not wired into Langflower server/UI yet. Intended replacement for ad-hoc WS
protocol code in `@langflower/server` and `@langflower/ui`.

## Install (workspace)

```bash
npm install @langflower/websocket-bridge
```

## Public exports

No barrel `index.ts`. Import concrete entry points:

```typescript
import { message, type WsBridgeConfig } from '@langflower/websocket-bridge';
import { createClient } from '@langflower/websocket-bridge/create-client';
import { createServer } from '@langflower/websocket-bridge/create-server';
```

| Export            | Contents                                                |
| ----------------- | ------------------------------------------------------- |
| `.`               | Types, `message()`, `WsBridgeConfig`, API surface types |
| `./create-client` | `createClient(config, options?)`                        |
| `./create-server` | `createServer(config, options?)`                        |

## Quick start

### 1. Define one shared config

Client and server use the **same** config object. Split messages by direction:

```typescript
import { message, type WsBridgeConfig } from '@langflower/websocket-bridge';

type PingPayload = {
	readonly nonce: string;
};

type PongPayload = {
	readonly nonce: string;
	readonly serverTime: number;
};

export const pingWsConfig = {
	transport: { path: '/ws', port: 4010 },
	fromClientToServer: {
		'ping.sent': message<PingPayload>(),
	},
	fromServerToClient: {
		'pong.received': message<PongPayload>(),
	},
} as const satisfies WsBridgeConfig;
```

`message<T>()` is a type carrier — no casts in consumer config.

### 2. Start server (Node)

```typescript
import { createServer } from '@langflower/websocket-bridge/create-server';
import { pingWsConfig } from './ping-ws-config.js';

const server = createServer(pingWsConfig, { port: 4010, path: '/ws' });

server['ping.sent'].subscribe((payload) => {
	server['pong.received'].next({
		nonce: payload.nonce,
		serverTime: Date.now(),
	});
});
```

### 3. Connect client (browser or Node)

```typescript
import { createClient } from '@langflower/websocket-bridge/create-client';
import { pingWsConfig } from './ping-ws-config.js';

const client = createClient(pingWsConfig);
// Browser: uses window.location + transport.path
// Node/tests: pass explicit url

client['pong.received'].subscribe((payload) => {
	console.log(payload.serverTime);
});

client['ping.sent'].next({ nonce: crypto.randomUUID() });
```

For tests or Node clients:

```typescript
const client = createClient(pingWsConfig, {
	url: 'ws://127.0.0.1:4010/ws',
});
```

## Flat typed API

Outgoing messages are `Subject<Payload>` (`.next()`). Incoming messages are
`Observable<Payload>` (`.subscribe()`). Keys match config event names.

**Client** — `fromClientToServer` → outgoing, `fromServerToClient` → incoming:

```typescript
client['edge.create.requested'].next({ ... });   // Subject
client['edge.create.command'].subscribe(...);    // Observable
```

**Server** — directions reversed:

```typescript
server['edge.create.requested'].subscribe(...);  // Observable
server['edge.create.command'].next({ ... });     // Subject (broadcast)
```

TypeScript rejects unknown keys and wrong payload shapes at compile time.

## Per-client targeted send

`server.connections$` emits one handle per new WebSocket connection. The handle
exposes server→client outgoing subjects for **that client only**:

```typescript
server.connections$.subscribe((connectedClient) => {
	connectedClient['session.ready'].next({ version: 1 });

	connectedClient.disconnected$.subscribe(() => {
		cleanup(connectedClient.id);
	});
});
```

- `server['event'].next(payload)` — broadcast to all open clients.
- `connectedClient['event'].next(payload)` — send to one client.
- Bridge does **not** store event history or replay on reconnect.

## Lifecycle & errors

Both client and server expose:

| Property  | Type                                                        | Role                                              |
| --------- | ----------------------------------------------------------- | ------------------------------------------------- |
| `status$` | `Observable<'connecting' \| 'connected' \| 'disconnected'>` | Transport state                                   |
| `errors$` | `Observable<WsBridgeError>`                                 | Malformed frames, unknown types, transport errors |
| `close()` | `() => void`                                                | Tear down sockets and complete streams            |

Server additionally exposes `connections$`.

Typical `errors$` codes:

| Code                 | Cause                                              |
| -------------------- | -------------------------------------------------- |
| `INVALID_FRAME`      | Not valid JSON envelope                            |
| `INVALID_ENVELOPE`   | JSON without `{ type, payload }`                   |
| `UNKNOWN_EVENT_TYPE` | Known envelope, wrong/unknown `type` for direction |
| `TRANSPORT_ERROR`    | WebSocket error                                    |
| `TRANSPORT_NOT_OPEN` | Client `.next()` while socket closed               |

Unknown wire events go to `errors$`; they do not throw.

## Wire format

Default codec (`defaultWsBridgeCodec`) uses JSON:

```json
{ "type": "ping.sent", "payload": { "nonce": "abc" } }
```

Custom codec: pass `codec` on `WsBridgeConfig`.

## Layout

```text
src/
  bridge-types.ts      Config + typed API types, message()
  bridge-subjects.ts   Subject/Observable maps, routing helpers
  bridge-codec.ts      JSON encode/decode
  bridge-guards.ts     Envelope + direction-aware type guards
  bridge-frame.ts      Inbound frame decode → event | error
  create-client.ts     Browser WebSocket / Node ws client
  create-server.ts     Node ws server + connections$
  testing/             Sample configs and test helpers (not published)
```

## Scripts

```bash
node build/tools/agent-run.mjs build-package websocketBridge
node build/tools/agent-run.mjs build-package websocketBridge typecheck
npm run test -w @langflower/websocket-bridge
```

## Design constraints

- **One config** for client and server — no separate client/server registries.
- **No RPC** — no `{ id, method, result }` envelopes; use events only.
- **Compile-time payloads** — runtime guards shallow-check envelope routing only.
- **No barrel files** — import concrete paths (see `AGENTS.md`).

## Agent notes

See [AGENTS.md](./AGENTS.md) for monorepo build commands and module map.
