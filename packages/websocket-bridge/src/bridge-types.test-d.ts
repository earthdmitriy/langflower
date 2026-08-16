import type { Subject } from 'rxjs';
import type { WsBridgeClientApi, WsBridgeServerApi } from './bridge-types.js';
import {
	diagramWsConfig,
	type DiagramWsConfig,
} from './testing/sample-diagram-ws-config.js';

declare const client: WsBridgeClientApi<DiagramWsConfig>;
declare const server: WsBridgeServerApi<DiagramWsConfig>;

// client -> server only
client['edge.create.requested'].next({
	fromNodeId: 'source',
	fromPortId: 'result',
	toNodeId: 'target',
	toPortId: 'input',
});

// server -> client only
client['edge.create.command'].subscribe((_payload) => {
	// payload: EdgeCreateCommandPayload
});

// @ts-expect-error server-only outgoing message is not on client outgoing side
client['edge.create.command'].next({
	edgeId: 'edge-1',
	fromNodeId: 'source',
	fromPortId: 'result',
	toNodeId: 'target',
	toPortId: 'input',
});

// @ts-expect-error incoming message on client is Observable, not outgoing Subject
client['session.ready'].next({ version: 1 });

client['edge.create.requested'].next(
	// @ts-expect-error invalid payload shape for edge.create.requested
	{ edgeId: 'edge-1' },
);

// server -> client broadcast
server['edge.create.command'].next({
	edgeId: 'edge-1',
	fromNodeId: 'source',
	fromPortId: 'result',
	toNodeId: 'target',
	toPortId: 'input',
});

server['session.ready'].next({ version: 1 });

// @ts-expect-error client-only message is not server outgoing
server['edge.create.requested'].next({
	fromNodeId: 'source',
	fromPortId: 'result',
	toNodeId: 'target',
	toPortId: 'input',
});

server.injectInbound('edge.create.requested', {
	fromNodeId: 'source',
	fromPortId: 'result',
	toNodeId: 'target',
	toPortId: 'input',
});

// @ts-expect-error unknown message key
const _unknownClientChannel: Subject<unknown> = client['unknown.message'];
