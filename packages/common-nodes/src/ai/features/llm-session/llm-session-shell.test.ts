import { statefulObservable } from '@rx-evo/stateful-observable';
import { concat, delay, filter, firstValueFrom, of, Subject } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { createLlmSessionCycle$ } from './llm-session-shell.js';

type Chunk =
	| { readonly kind: 'reasoning'; readonly text: string }
	| { readonly kind: 'response'; readonly text: string };

describe('createLlmSessionCycle$ pending', () => {
	it('stamps pending before the first chunk and again on the next feedback turn', async () => {
		const turns$ = new Subject<unknown>();
		const context$ = statefulObservable({
			input: of({ maxFeedbackTurns: 0 }),
			loader: (context) => of(context),
		});
		const cycle$ = createLlmSessionCycle$<
			{ readonly maxFeedbackTurns: number },
			Chunk,
			undefined,
			unknown,
			undefined
		>(
			context$,
			turns$,
			() => ({
				history: [],
				trackAssistantHistory: true,
				appendUserFeedbackToHistory: true,
				session: undefined,
			}),
			(_context, payload) =>
				concat(
					of({
						kind: 'reasoning' as const,
						text: 'think',
					}).pipe(delay(20)),
					of({
						kind: 'response' as const,
						text:
							payload === undefined
								? 't0'
								: `fb:${String(payload)}`,
					}),
				),
		);

		const pendingTrue: number[] = [];
		const responses: string[] = [];
		const sub = cycle$.subscribe({
			pending: (pending) => {
				if (pending) {
					pendingTrue.push(Date.now());
				}
			},
			next: (chunk) => {
				if (chunk.kind === 'response') {
					responses.push(chunk.text);
				}
			},
		});

		await firstValueFrom(
			cycle$.value$.pipe(
				filter(
					(chunk): chunk is Extract<Chunk, { kind: 'response' }> =>
						chunk.kind === 'response' && chunk.text === 't0',
				),
			),
		);
		expect(pendingTrue.length).toBeGreaterThanOrEqual(1);
		expect(responses).toEqual(['t0']);
		const pendingAfterTurn0 = pendingTrue.length;

		turns$.next('again');
		await firstValueFrom(
			cycle$.value$.pipe(
				filter(
					(chunk): chunk is Extract<Chunk, { kind: 'response' }> =>
						chunk.kind === 'response' && chunk.text === 'fb:again',
				),
			),
		);
		sub.unsubscribe();

		expect(pendingTrue.length).toBeGreaterThan(pendingAfterTurn0);
		expect(responses).toEqual(['t0', 'fb:again']);
	});
});
