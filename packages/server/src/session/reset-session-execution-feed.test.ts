import type { RunId } from '@langflower/runtime';
import { describe, expect, it } from 'vitest';
import { LangflowerSession } from './langflower-session.js';
import { resetSessionExecutionFeed } from './reset-session-execution-feed.js';

describe('resetSessionExecutionFeed', () => {
	it('clears the event log and runId so buildExecutionFeed is null', () => {
		const session = new LangflowerSession();
		session.activeWorkflowId = 'wf-1';
		session.runId = 'run-1' as RunId;
		session.runnerStatus = 'idle';

		resetSessionExecutionFeed(session);

		expect(session.runId).toBeUndefined();
		expect(session.buildExecutionFeed()).toBeNull();
	});
});
