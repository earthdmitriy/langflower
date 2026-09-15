import type { RunId } from '@langflower/runtime';
import type {
	RunnerAskUserAskPayload,
	RunnerAskUserReplyPayload,
} from '@langflower/shared/langflower';
import { merge, type Observable } from 'rxjs';
import { map, scan, shareReplay, startWith } from 'rxjs/operators';

type AskUserFoldEvent =
	| { readonly type: 'ask'; readonly ask: RunnerAskUserAskPayload }
	| { readonly type: 'accepted'; readonly askId: string }
	| { readonly type: 'hardReset' };

const foldPendingAskUserAsks = (
	state: readonly RunnerAskUserAskPayload[],
	event: AskUserFoldEvent,
): readonly RunnerAskUserAskPayload[] => {
	if (event.type === 'hardReset') {
		return [];
	}
	if (event.type === 'accepted') {
		return state.filter((ask) => ask.askId !== event.askId);
	}
	const without = state.filter((ask) => ask.askId !== event.ask.askId);
	return [...without, event.ask];
};

export const createPendingAskUserAsks$ = (deps: {
	readonly askUserAsk$: Observable<RunnerAskUserAskPayload>;
	readonly askUserAccepted$: Observable<RunnerAskUserReplyPayload>;
	readonly runnerDone$: Observable<unknown>;
	readonly runnerInterrupted$: Observable<unknown>;
	readonly runnerStarted$: Observable<RunId>;
	readonly runnerStartNodeStarted$: Observable<RunId>;
}): Observable<readonly RunnerAskUserAskPayload[]> => {
	const ask$ = deps.askUserAsk$.pipe(
		map((ask): AskUserFoldEvent => ({
			type: 'ask',
			ask,
		})),
	);
	const accepted$ = deps.askUserAccepted$.pipe(
		map((accepted): AskUserFoldEvent => ({
			type: 'accepted',
			askId: accepted.askId,
		})),
	);
	const hardReset$ = merge(
		deps.runnerDone$,
		deps.runnerInterrupted$,
		deps.runnerStarted$,
		deps.runnerStartNodeStarted$,
	).pipe(map((): AskUserFoldEvent => ({ type: 'hardReset' })));

	return merge(ask$, accepted$, hardReset$).pipe(
		scan(foldPendingAskUserAsks, [] as readonly RunnerAskUserAskPayload[]),
		startWith([] as readonly RunnerAskUserAskPayload[]),
		shareReplay(1),
	);
};
