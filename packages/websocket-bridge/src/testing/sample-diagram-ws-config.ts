import { message, type WsBridgeConfig } from '../bridge-types.js';

export type EdgeConnectionPayload = {
	readonly fromNodeId: string;
	readonly fromPortId: string;
	readonly toNodeId: string;
	readonly toPortId: string;
};

export type EdgeCreateCommandPayload = {
	readonly edgeId: string;
};

export type SessionReadyPayload = {
	readonly version: number;
};

/** Sample config from plan — edge create request + command. */
export const diagramWsConfig = {
	transport: { path: '/ws', port: 4010 },
	fromClientToServer: {
		'edge.create.requested': message<EdgeConnectionPayload>(),
	},
	fromServerToClient: {
		'edge.create.command': message<EdgeCreateCommandPayload>(),
		'session.ready': message<SessionReadyPayload>(),
	},
} as const satisfies WsBridgeConfig;

export type DiagramWsConfig = typeof diagramWsConfig;
