import type {
	RunnerAskUserAskPayload,
	RunnerAskUserReplyPayload,
} from '@langflower/shared/langflower';
import type { RunId } from '@langflower/runtime';
import { Subject } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { createPendingAskUserAsks$ } from '../execution-ask-user-fold.js';

describe('createPendingAskUserAsks$', () => {
	it('removes an ask only after server acceptance', () => {
		const askUserAsk$ = new Subject<RunnerAskUserAskPayload>();
		const askUserAccepted$ = new Subject<RunnerAskUserReplyPayload>();
		const runnerDone$ = new Subject<void>();
		const runnerInterrupted$ = new Subject<void>();
		const runnerStarted$ = new Subject<RunId>();
		const runnerStartNodeStarted$ = new Subject<RunId>();
		const states: (readonly RunnerAskUserAskPayload[])[] = [];
		const subscription = createPendingAskUserAsks$({
			askUserAsk$,
			askUserAccepted$,
			runnerDone$,
			runnerInterrupted$,
			runnerStarted$,
			runnerStartNodeStarted$,
		}).subscribe((state) => states.push(state));
		const ask: RunnerAskUserAskPayload = {
			runId: 'run-1',
			askId: 'ask-1',
			nodeId: 'node-1',
			question: 'What is the project name?',
		};

		askUserAsk$.next(ask);
		expect(states.at(-1)).toEqual([ask]);

		askUserAccepted$.next({
			runId: ask.runId,
			askId: ask.askId,
			text: 'Langflower',
		});
		expect(states.at(-1)).toEqual([]);

		subscription.unsubscribe();
	});
});
