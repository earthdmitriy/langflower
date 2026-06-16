import { langflowerWsConfig } from '@langflower/shared/langflower.js';
import { matchAnyGlob } from './match-glob.js';
import {
	ACTION_EXCLUDE_GLOBS,
	ACTION_NAMESPACE_GLOBS,
} from './mcp-exposure-policy.js';

export const listActionIntents = (): readonly string[] => {
	const keys = Object.keys(langflowerWsConfig.fromClientToServer);

	return keys.filter(
		(key) =>
			matchAnyGlob(ACTION_NAMESPACE_GLOBS, key) &&
			!matchAnyGlob(ACTION_EXCLUDE_GLOBS, key),
	);
};
