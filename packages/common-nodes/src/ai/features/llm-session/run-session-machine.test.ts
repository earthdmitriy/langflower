import {
	Subject,
	concat,
	delay,
	filter,
	map,
	mergeScan,
	of,
	startWith,
	toArray,
	type Observable,
} from 'rxjs';
import { describe, expect, it } from 'vitest';
import type { ChatCompletionMessage } from '../chat-completion-stream.js';
import type { PermissionAskRequest } from '@langflower/tools/permission';
import {
	runTurnFromState,
	type LlmSessionPreparation,
	type LlmSessionState,
} from './run-session-machine.js';

const foldTurns = <Session, Chunk extends { readonly kind: string }>(
	context: {
		readonly maxFeedbackTurns: number;
		readonly requestPermission?: (
			request: PermissionAskRequest,
		) => Promise<'allow' | 'deny'>;
	},
	turn$: Observable<unknown>,
	preparation: LlmSessionPreparation<Session>,
	runTurn: (
		context: typeof context,
		turnPayload: unknown,
		history: readonly ChatCompletionMessage[],
		session: Session,
	) => Observable<Chunk>,
	primeTurn0: boolean,
): Observable<Chunk> => {
	const initial: LlmSessionState<Session, Chunk> = {
		history: [...preparation.history],
		turn0Done: false,
		feedbackTurns: 0,
		preparation,
	};
	const turns$ = primeTurn0 ? turn$.pipe(startWith('')) : turn$;
	return turns$.pipe(
		mergeScan(
			(state, raw) =>
				runTurnFromState(context, state, raw, primeTurn0, runTurn),
			initial,
			1,
		),
		filter(
			(
				state,
			): state is LlmSessionState<Session, Chunk> & {
				readonly emitted: Chunk;
			} => state.emitted !== undefined,
		),
		map((state) => state.emitted),
	);
};

type Chunk =
	| { readonly kind: 'response'; readonly text: string }
	| { readonly kind: 'toolLog'; readonly text: string }
	| {
			readonly kind: 'historySync';
			readonly messages: readonly {
				readonly role: 'user';
				readonly content: string;
			}[];
	  };

describe('runTurnFromState', () => {
	it('queues turns and folds assistant/user history without mutation', async () => {
		const turns$ = new Subject<unknown>();
		const histories: string[][] = [];
		const resultPromise = new Promise<Chunk[]>((resolve, reject) => {
			foldTurns(
				{ maxFeedbackTurns: 0 },
				turns$,
				{
					history: [{ role: 'user', content: 'initial' }],
					trackAssistantHistory: true,
					appendUserFeedbackToHistory: true,
					session: undefined,
				},
				(_context, payload, history) => {
					histories.push(history.map((message) => message.content));
					return concat(
						of({
							kind: 'response' as const,
							text:
								payload === undefined
									? 'first'
									: `next:${String(payload)}`,
						}).pipe(delay(5)),
					);
				},
				true,
			)
				.pipe(toArray())
				.subscribe({
					next: resolve,
					error: reject,
				});
		});

		turns$.next('feedback');
		turns$.complete();

		const chunks = await resultPromise;
		expect(chunks).toEqual([
			{ kind: 'response', text: 'first' },
			{ kind: 'response', text: 'next:feedback' },
		]);
		expect(histories).toEqual([
			['initial'],
			['initial', 'first', 'feedback'],
		]);
	});

	it('uses historySync as the next turn checkpoint', async () => {
		const turns$ = of('packet-a', 'packet-b');
		const histories: string[][] = [];

		const chunks = await new Promise<Chunk[]>((resolve, reject) => {
			foldTurns(
				{ maxFeedbackTurns: 0 },
				turns$,
				{
					history: [],
					trackAssistantHistory: false,
					appendUserFeedbackToHistory: false,
					session: undefined,
				},
				(_context, payload, history) => {
					histories.push(history.map((message) => message.content));
					return of({
						kind: 'historySync' as const,
						messages: [
							{
								role: 'user' as const,
								content: String(payload),
							},
						],
					});
				},
				false,
			)
				.pipe(toArray())
				.subscribe({ next: resolve, error: reject });
		});

		expect(chunks).toHaveLength(2);
		expect(histories).toEqual([[], ['packet-a']]);
	});

	it('asks continue on maxFeedbackTurns; Allow resets budget', async () => {
		const turns$ = of('a', 'b');
		let permissionAsks = 0;
		const turnPayloads: unknown[] = [];

		const chunks = await new Promise<Chunk[]>((resolve, reject) => {
			foldTurns(
				{
					maxFeedbackTurns: 1,
					requestPermission: async (request) => {
						permissionAsks += 1;
						expect(request.toolId).toBe('agent.maxFeedbackTurns');
						return 'allow';
					},
				},
				turns$,
				{
					history: [],
					trackAssistantHistory: true,
					appendUserFeedbackToHistory: true,
					session: undefined,
				},
				(_context, payload) => {
					turnPayloads.push(payload);
					return of({
						kind: 'response' as const,
						text:
							payload === undefined
								? 'turn0'
								: `fb:${String(payload)}`,
					});
				},
				true,
			)
				.pipe(toArray())
				.subscribe({ next: resolve, error: reject });
		});

		expect(permissionAsks).toBe(1);
		expect(turnPayloads).toEqual([undefined, 'a', 'b']);
		expect(chunks.map((chunk) => chunk.kind)).toContain('toolLog');
		expect(
			chunks
				.filter((chunk) => chunk.kind === 'response')
				.map((chunk) => {
					if (chunk.kind !== 'response') {
						return '';
					}
					return chunk.text;
				}),
		).toEqual(['turn0', 'fb:a', 'fb:b']);
	});

	it('asks continue on maxFeedbackTurns; Deny errors the cycle', async () => {
		const turns$ = of('', 'a', 'b');

		await expect(
			new Promise<Chunk[]>((resolve, reject) => {
				foldTurns(
					{
						maxFeedbackTurns: 1,
						requestPermission: async () => 'deny',
					},
					turns$,
					{
						history: [],
						trackAssistantHistory: true,
						appendUserFeedbackToHistory: true,
						session: undefined,
					},
					(_context, payload) =>
						of({
							kind: 'response' as const,
							text:
								payload === undefined
									? 'turn0'
									: `fb:${String(payload)}`,
						}),
					true,
				)
					.pipe(toArray())
					.subscribe({ next: resolve, error: reject });
			}),
		).rejects.toMatch(/maxFeedbackTurns/);
	});

	it('Denies maxFeedbackTurns without requestPermission hook', async () => {
		const turns$ = of('', 'a', 'b');

		await expect(
			new Promise<Chunk[]>((resolve, reject) => {
				foldTurns(
					{ maxFeedbackTurns: 1 },
					turns$,
					{
						history: [],
						trackAssistantHistory: true,
						appendUserFeedbackToHistory: true,
						session: undefined,
					},
					(_context, payload) =>
						of({
							kind: 'response' as const,
							text:
								payload === undefined
									? 'turn0'
									: `fb:${String(payload)}`,
						}),
					true,
				)
					.pipe(toArray())
					.subscribe({ next: resolve, error: reject });
			}),
		).rejects.toMatch(/maxFeedbackTurns/);
	});
});
