import type {
	RunnerPermissionAskPayload,
	RunnerPermissionReplyPayload,
} from '@langflower/shared/langflower';
import type { RunId } from '@langflower/runtime';
import { Subject } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { createPendingPermissionAsks$ } from '../execution-permission-fold.js';

describe('createPendingPermissionAsks$', () => {
	it('removes an ask only after server acceptance', () => {
		const permissionAsk$ = new Subject<RunnerPermissionAskPayload>();
		const permissionAccepted$ = new Subject<RunnerPermissionReplyPayload>();
		const runnerDone$ = new Subject<void>();
		const runnerInterrupted$ = new Subject<void>();
		const runnerStarted$ = new Subject<RunId>();
		const runnerStartNodeStarted$ = new Subject<RunId>();
		const states: (readonly RunnerPermissionAskPayload[])[] = [];
		const subscription = createPendingPermissionAsks$({
			permissionAsk$,
			permissionAccepted$,
			runnerDone$,
			runnerInterrupted$,
			runnerStarted$,
			runnerStartNodeStarted$,
		}).subscribe((state) => states.push(state));
		const ask: RunnerPermissionAskPayload = {
			runId: 'run-1',
			askId: 'ask-1',
			nodeId: 'node-1',
			toolId: 'bash',
			detail: 'ls',
			summary: 'Run ls',
		};

		permissionAsk$.next(ask);
		expect(states.at(-1)).toEqual([ask]);

		permissionAccepted$.next({
			runId: ask.runId,
			askId: ask.askId,
			decision: 'allow',
		});
		expect(states.at(-1)).toEqual([]);

		subscription.unsubscribe();
	});
});
