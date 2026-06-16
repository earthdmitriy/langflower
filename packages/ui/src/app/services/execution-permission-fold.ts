import type { RunId } from '@langflower/runtime';
import type {
	RunnerPermissionAskPayload,
	RunnerPermissionReplyPayload,
} from '@langflower/shared/langflower';
import { merge, type Observable } from 'rxjs';
import { map, scan, shareReplay, startWith } from 'rxjs/operators';

type PermissionAskFoldEvent =
	| { readonly type: 'ask'; readonly ask: RunnerPermissionAskPayload }
	| { readonly type: 'accepted'; readonly askId: string }
	| { readonly type: 'hardReset' };

const foldPendingPermissionAsks = (
	state: readonly RunnerPermissionAskPayload[],
	event: PermissionAskFoldEvent,
): readonly RunnerPermissionAskPayload[] => {
	if (event.type === 'hardReset') {
		return [];
	}
	if (event.type === 'accepted') {
		return state.filter((ask) => ask.askId !== event.askId);
	}
	const without = state.filter((ask) => ask.askId !== event.ask.askId);
	return [...without, event.ask];
};

export const createPendingPermissionAsks$ = (deps: {
	readonly permissionAsk$: Observable<RunnerPermissionAskPayload>;
	readonly permissionAccepted$: Observable<RunnerPermissionReplyPayload>;
	readonly runnerDone$: Observable<unknown>;
	readonly runnerInterrupted$: Observable<unknown>;
	readonly runnerStarted$: Observable<RunId>;
	readonly runnerStartNodeStarted$: Observable<RunId>;
}): Observable<readonly RunnerPermissionAskPayload[]> => {
	const ask$ = deps.permissionAsk$.pipe(
		map((ask): PermissionAskFoldEvent => ({
			type: 'ask',
			ask,
		})),
	);
	const accepted$ = deps.permissionAccepted$.pipe(
		map((accepted): PermissionAskFoldEvent => ({
			type: 'accepted',
			askId: accepted.askId,
		})),
	);
	const hardReset$ = merge(
		deps.runnerDone$,
		deps.runnerInterrupted$,
		deps.runnerStarted$,
		deps.runnerStartNodeStarted$,
	).pipe(map((): PermissionAskFoldEvent => ({ type: 'hardReset' })));

	return merge(ask$, accepted$, hardReset$).pipe(
		scan(
			foldPendingPermissionAsks,
			[] as readonly RunnerPermissionAskPayload[],
		),
		startWith([] as readonly RunnerPermissionAskPayload[]),
		shareReplay(1),
	);
};
