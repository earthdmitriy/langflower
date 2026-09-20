import { langflowerWsConfig } from '@langflower/shared/langflower-bus-config.js';
import { matchAnyGlob } from './match-glob.js';
import { ACTION_NAMESPACE_GLOBS } from './mcp-exposure-policy.js';

export type ClientIntentKey =
	keyof typeof langflowerWsConfig.fromClientToServer;

export const listActionIntents = (): readonly ClientIntentKey[] => {
	const keys = Object.keys(
		langflowerWsConfig.fromClientToServer,
	) as ClientIntentKey[];

	return keys.filter((key) => matchAnyGlob(ACTION_NAMESPACE_GLOBS, key));
};
