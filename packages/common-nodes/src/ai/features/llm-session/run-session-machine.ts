import type { ChatCompletionMessage } from '../chat-completion-stream.js';
import type { PermissionAskRequest } from '@langflower/tools/permission';
import {
	EMPTY,
	concat,
	filter,
	from,
	map,
	mergeScan,
	of,
	scan,
	startWith,
	switchMap,
	throwError,
	type Observable,
} from 'rxjs';

export type LlmSessionPreparation<Session> = {
	readonly history: readonly ChatCompletionMessage[];
	readonly trackAssistantHistory: boolean;
	readonly appendUserFeedbackToHistory: boolean;
	readonly session: Session;
};

type LlmSessionContext = {
	readonly maxFeedbackTurns: number;
	readonly requestPermission?: (
		request: PermissionAskRequest,
	) => Promise<'allow' | 'deny'>;
};

export type LlmSessionState<Session, Chunk> = {
	readonly history: readonly ChatCompletionMessage[];
	readonly turn0Done: boolean;
	readonly feedbackTurns: number;
	readonly preparation: LlmSessionPreparation<Session>;
	readonly emitted?: Chunk | undefined;
};

export const isBlankTurn = (raw: unknown): boolean =>
	raw === null ||
	raw === undefined ||
	(typeof raw === 'string' && raw.trim().length === 0);

const readHistorySync = (chunk: {
	readonly kind: string;
}): readonly ChatCompletionMessage[] | undefined => {
	if (
		chunk.kind !== 'historySync' ||
		!('messages' in chunk) ||
		!Array.isArray(chunk.messages)
	) {
		return undefined;
	}

	return chunk.messages as readonly ChatCompletionMessage[];
};

const readAssistantResponse = (chunk: {
	readonly kind: string;
}): string | undefined =>
	chunk.kind === 'response' &&
	'text' in chunk &&
	typeof chunk.text === 'string'
		? chunk.text
		: undefined;

const reduceChunk = <Session, Chunk extends { readonly kind: string }>(
	state: LlmSessionState<Session, Chunk>,
	chunk: Chunk,
): LlmSessionState<Session, Chunk> => {
	const syncedHistory = readHistorySync(chunk);
	if (syncedHistory !== undefined) {
		return {
			...state,
			history: [...syncedHistory],
			emitted: chunk,
		};
	}

	const assistantResponse = readAssistantResponse(chunk);
	if (
		assistantResponse !== undefined &&
		state.preparation.trackAssistantHistory
	) {
		return {
			...state,
			history: [
				...state.history,
				{ role: 'assistant', content: assistantResponse },
			],
			emitted: chunk,
		};
	}

	return { ...state, emitted: chunk };
};

const acceptFeedbackTurn = <
	Context extends LlmSessionContext,
	Session,
	Chunk extends { readonly kind: string },
>(
	context: Context,
	state: LlmSessionState<Session, Chunk>,
	raw: unknown,
	runTurn: (
		context: Context,
		turnPayload: unknown,
		history: readonly ChatCompletionMessage[],
		session: Session,
	) => Observable<Chunk>,
	feedbackTurns: number,
): Observable<LlmSessionState<Session, Chunk>> => {
	const history = state.preparation.appendUserFeedbackToHistory
		? [
				...state.history,
				{ role: 'user' as const, content: String(raw ?? '') },
			]
		: state.history;
	const next: LlmSessionState<Session, Chunk> = {
		...state,
		history,
		feedbackTurns,
		emitted: undefined,
	};

	return runTurn(context, raw, next.history, next.preparation.session).pipe(
		scan((accumulator, chunk) => reduceChunk(accumulator, chunk), next),
	);
};

const denyMaxFeedbackTurns = <Session, Chunk extends { readonly kind: string }>(
	state: LlmSessionState<Session, Chunk>,
	maxFeedbackTurns: number,
): Observable<LlmSessionState<Session, Chunk>> => {
	const message =
		`Stopped: maxFeedbackTurns ` + `(${maxFeedbackTurns}) reached`;
	return concat(
		of({
			...state,
			emitted: {
				kind: 'toolLog',
				text: `⚠ ${message}`,
			} as unknown as Chunk,
		}),
		throwError(() => message),
	);
};

export const runTurnFromState = <
	Context extends LlmSessionContext,
	Session,
	Chunk extends { readonly kind: string },
>(
	context: Context,
	state: LlmSessionState<Session, Chunk>,
	raw: unknown,
	primeTurn0: boolean,
	runTurn: (
		context: Context,
		turnPayload: unknown,
		history: readonly ChatCompletionMessage[],
		session: Session,
	) => Observable<Chunk>,
): Observable<LlmSessionState<Session, Chunk>> => {
	if (!state.turn0Done) {
		if (!primeTurn0 && isBlankTurn(raw)) {
			return EMPTY;
		}

		const next = { ...state, turn0Done: true };
		return runTurn(
			context,
			primeTurn0 ? undefined : raw,
			next.history,
			next.preparation.session,
		).pipe(
			scan((accumulator, chunk) => reduceChunk(accumulator, chunk), next),
		);
	}

	if (isBlankTurn(raw)) {
		return EMPTY;
	}

	if (
		context.maxFeedbackTurns > 0 &&
		state.feedbackTurns >= context.maxFeedbackTurns
	) {
		const ask = context.requestPermission;
		if (ask === undefined) {
			return denyMaxFeedbackTurns(state, context.maxFeedbackTurns);
		}

		const waitingText =
			`⚠ Max feedback turns (${context.maxFeedbackTurns}) reached. ` +
			'Allow to continue for another budget, or Deny to stop.';

		return concat(
			of({
				...state,
				emitted: {
					kind: 'toolLog',
					text: waitingText,
				} as unknown as Chunk,
			}),
			from(
				ask({
					toolId: 'agent.maxFeedbackTurns',
					detail: String(context.maxFeedbackTurns),
					summary:
						`Max feedback turns (${context.maxFeedbackTurns}) ` +
						'reached. Allow to continue?',
				}),
			).pipe(
				switchMap((decision) => {
					if (decision !== 'allow') {
						return denyMaxFeedbackTurns(
							state,
							context.maxFeedbackTurns,
						);
					}

					return acceptFeedbackTurn(context, state, raw, runTurn, 1);
				}),
			),
		);
	}

	return acceptFeedbackTurn(
		context,
		state,
		raw,
		runTurn,
		state.feedbackTurns + 1,
	);
};

/**
 * Sequential session fold. Each turn is an inner Observable reduced into the
 * accumulator; concurrency 1 queues feedback while a turn is streaming.
 */
export const runLlmSessionMachine = <
	Context extends LlmSessionContext,
	Session,
	Chunk extends { readonly kind: string },
>(
	context: Context,
	turn$: Observable<unknown>,
	preparation: LlmSessionPreparation<Session>,
	runTurn: (
		context: Context,
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
