import type { RunId } from '@langflower/runtime';
import { describe, expect, it } from 'vitest';
import { LangflowerSession } from './langflower-session.js';
import { resetSessionExecutionFeed } from './reset-session-execution-feed.js';

/**
 * Mirrors the Clear handler policy: ignore clear while the runner is
 * active; otherwise wipe the log and drop `runId`.
 */
const applyClearPolicy = (session: LangflowerSession): boolean => {
	if (session.runnerStatus === 'running') {
		return false;
	}
	resetSessionExecutionFeed(session);
	return true;
};

describe('Clear feed policy', () => {
	it('ignores clear while the runner is running', () => {
		const session = new LangflowerSession();
		session.activeWorkflowId = 'wf-1';
		session.runId = 'run-1' as RunId;
		session.runnerStatus = 'running';

		expect(applyClearPolicy(session)).toBe(false);
		expect(session.runId).toBe('run-1');
		expect(session.buildExecutionFeed()).toEqual({
			runId: 'run-1',
			workflowId: 'wf-1',
			status: 'running',
			events: [],
		});
	});

	it('clears the feed when the runner is idle', () => {
		const session = new LangflowerSession();
		session.activeWorkflowId = 'wf-1';
		session.runId = 'run-1' as RunId;
		session.runnerStatus = 'idle';

		expect(applyClearPolicy(session)).toBe(true);
		expect(session.runId).toBeUndefined();
		expect(session.buildExecutionFeed()).toBeNull();
	});
});
