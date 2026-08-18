import type { LangflowerSession } from './langflower-session.js';

/**
 * Drop the session run log so `buildExecutionFeed()` returns null.
 * Call only when the runner is idle (document switch or user Clear).
 */
export const resetSessionExecutionFeed = (session: LangflowerSession): void => {
	session.runtime.runner.clearEventLog();
	session.runId = undefined;
};
