import type {
	LangflowerBridge,
	LangflowerClient,
} from './langflower-bridge.types.js';

const clientIndex = new WeakMap<
	LangflowerBridge,
	Map<string, LangflowerClient>
>();

export const indexClient = (
	bridge: LangflowerBridge,
	client: LangflowerClient,
): void => {
	let map = clientIndex.get(bridge);

	if (map === undefined) {
		map = new Map();
		clientIndex.set(bridge, map);
	}

	map.set(client.id, client);
};

export const unindexClient = (
	bridge: LangflowerBridge,
	clientId: string,
): void => {
	clientIndex.get(bridge)?.delete(clientId);
};

export const findClientById = (
	bridge: LangflowerBridge,
	clientId: string,
): LangflowerClient | undefined => clientIndex.get(bridge)?.get(clientId);

export const clearClientIndex = (bridge: LangflowerBridge): void => {
	clientIndex.delete(bridge);
};
