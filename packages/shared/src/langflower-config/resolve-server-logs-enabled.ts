import type { LangflowerConfig } from '../types/langflower-config.js';

/**
 * Effective bridge diagnostic logging from a merged (project > global) config.
 * Missing `serverLogs` defaults to enabled.
 */
export const resolveServerLogsEnabled = (config: LangflowerConfig): boolean =>
	config.serverLogs !== false;
