import type { Subject } from 'rxjs';
import type {
	LangflowerBridge,
	LangflowerClient,
} from './langflower-bridge.types.js';

export type {
	LangflowerBridge,
	LangflowerClient,
} from './langflower-bridge.types.js';

export const clientEmit = <T extends keyof LangflowerClient, Payload>(
	client: LangflowerClient,
	channel: T,
	payload: Payload,
): void => {
	const subject = (client as unknown as Record<string, Subject<Payload>>)[
		channel
	];

	if (subject === undefined) {
		throw new Error(`Missing client channel: ${channel}`);
	}

	subject.next(payload);
};

export const bridgeEmit = <T extends keyof LangflowerClient, Payload>(
	bridge: LangflowerBridge,
	channel: T,
	payload: Payload,
): void => {
	const subject = (bridge as unknown as Record<string, Subject<Payload>>)[
		channel
	];

	if (subject === undefined) {
		throw new Error(`Missing bridge channel: ${channel}`);
	}

	subject.next(payload);
};
