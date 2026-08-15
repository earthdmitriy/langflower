import { Subject, concat, delay, of, toArray } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { runLlmSessionMachine } from './run-session-machine.js';

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

describe('runLlmSessionMachine', () => {
	it('queues turns and folds assistant/user history without mutation', async () => {
		const turns$ = new Subject<unknown>();
		const histories: string[][] = [];
		const resultPromise = new Promise<Chunk[]>((resolve, reject) => {
			runLlmSessionMachine(
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
			runLlmSessionMachine(
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
			runLlmSessionMachine(
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
				runLlmSessionMachine(
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
				runLlmSessionMachine(
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
