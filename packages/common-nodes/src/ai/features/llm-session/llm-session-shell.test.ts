import { statefulObservable } from '@rx-evo/stateful-observable';
import {
	concat,
	delay,
	filter,
	firstValueFrom,
	of,
	Subject,
	throwError,
	type Observable,
} from 'rxjs';
import { describe, expect, it } from 'vitest';
import type { NodeStateJson, ToolHandle } from '@langflower/node-sdk';
import type { ChatCompletionMessage } from '../chat-completion-stream.js';
import { critiqueNode } from '../../nodes/critique/node.js';
import { fakeLlmNode } from '../../nodes/fake-llm/node.js';
import { openAiLlmNode } from '../../nodes/openai-llm/node.js';
import { reviewNode } from '../../nodes/review/node.js';
import { subAgentNode } from '../../nodes/sub-agent/node.js';
import {
	assembleLlmAgentInventoryContext,
	createLlmSessionCycle$,
} from './llm-session-shell.js';

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
		const { cycle$ } = createLlmSessionCycle$<
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

describe('assembleLlmAgentInventoryContext', () => {
	it('attaches getTools that re-reads collected inventory', () => {
		const handle: ToolHandle = {
			toolId: 'read',
			name: 'read',
			description: 'read',
			inputSchema: { type: 'object' },
			invoke: async () => 'ok',
		};
		const assembled = assembleLlmAgentInventoryContext(
			'hello',
			[handle],
			'',
			{
				projectDir: '/p',
				runId: 'r1',
				nodeId: 'n1',
				params: {},
				chat: async () =>
					(async function* () {
						yield { kind: 'done' as const, text: '' };
					})(),
				toolHandles: [],
				skillMarkdown: '',
				agentsMarkdown: '',
				requestPermission: async () => 'allow',
				getLiveWiredTools: () => [],
			},
		);

		expect(assembled.prompt).toBe('hello');
		expect(assembled.tools.map((tool) => tool.toolId)).toEqual(['read']);
		expect(assembled.getTools?.().map((tool) => tool.toolId)).toEqual([
			'read',
		]);
		expect(assembled.toolCtx).toEqual({
			projectDir: '/p',
			runId: 'r1',
		});
		expect(assembled.resetSessionOnInput).toBe(false);
	});

	it('reads resetSessionOnInput only when the param is true', () => {
		const base = {
			projectDir: '/p',
			runId: 'r1',
			nodeId: 'n1',
			params: { resetSessionOnInput: true },
			chat: async () =>
				(async function* () {
					yield { kind: 'done' as const, text: '' };
				})(),
			toolHandles: [],
			skillMarkdown: '',
			agentsMarkdown: '',
			requestPermission: async () => 'allow' as const,
			getLiveWiredTools: () => [],
		};
		expect(
			assembleLlmAgentInventoryContext('hello', [], '', base)
				.resetSessionOnInput,
		).toBe(true);
		expect(
			assembleLlmAgentInventoryContext('hello', [], '', {
				...base,
				params: { resetSessionOnInput: 'true' },
			}).resetSessionOnInput,
		).toBe(false);
	});
});

type AgentContext = {
	readonly maxFeedbackTurns: number;
	readonly prompt: string;
	readonly resetSessionOnInput?: boolean;
};

type TurnChunk =
	| { readonly kind: 'response'; readonly text: string }
	| { readonly kind: 'toolLog'; readonly text: string }
	| {
			readonly kind: 'historySync';
			readonly messages: readonly ChatCompletionMessage[];
	  };

type SeenTurn = {
	readonly payload: unknown;
	readonly history: readonly ChatCompletionMessage[];
};

const agentPrelude = (prompt: string): readonly ChatCompletionMessage[] => [
	{ role: 'system', content: 'sys' },
	{ role: 'user', content: prompt },
];

const systemPrelude = (): readonly ChatCompletionMessage[] => [
	{ role: 'system', content: 'sys' },
];

const longHistory = (): readonly ChatCompletionMessage[] => [
	{ role: 'system', content: 'sys' },
	...Array.from({ length: 6 }, (_, index) => [
		{ role: 'user' as const, content: `u${index}` },
		{ role: 'assistant' as const, content: `a${index}` },
	]).flat(),
];

const openCycle = (options: {
	readonly primeTurn0: boolean;
	readonly context: AgentContext | Subject<AgentContext>;
	readonly prelude: (
		context: AgentContext,
	) => readonly ChatCompletionMessage[];
	readonly appendUserFeedbackToHistory?: boolean;
	readonly trackAssistantHistory?: boolean;
	readonly beforeStart?: (hook: {
		readonly restore: (value: NodeStateJson | null) => {
			readonly ok: boolean;
			readonly message?: string;
		};
	}) => void;
	readonly runTurn?: (
		context: AgentContext,
		payload: unknown,
		history: readonly ChatCompletionMessage[],
	) => Observable<TurnChunk>;
}) => {
	const turns$ = new Subject<unknown>();
	const seen: SeenTurn[] = [];
	const persisted: NodeStateJson[] = [];
	const chunks: TurnChunk[] = [];
	const errors: unknown[] = [];
	const contextInput =
		options.context instanceof Subject
			? options.context
			: of(options.context);
	const context$ = statefulObservable({
		input: contextInput,
		loader: (context: AgentContext) => of(context),
	});
	const innerTurn =
		options.runTurn ??
		((_context, payload) =>
			of({
				kind: 'response' as const,
				text: payload === undefined ? 't0' : `fb:${String(payload)}`,
			}));
	const { cycle$, state } = createLlmSessionCycle$<
		AgentContext,
		TurnChunk,
		undefined,
		unknown,
		undefined
	>(
		context$,
		turns$,
		(context) => ({
			history: options.prelude(context),
			trackAssistantHistory: options.trackAssistantHistory ?? true,
			appendUserFeedbackToHistory:
				options.appendUserFeedbackToHistory ?? true,
			session: undefined,
		}),
		(context, payload, history) => {
			seen.push({ payload, history: [...history] });
			return innerTurn(context, payload, history);
		},
		{ primeTurn0: options.primeTurn0 },
	);

	options.beforeStart?.(state);

	const persistSub = state.persist$.subscribe((value) => {
		persisted.push(value);
	});
	const cycleSub = cycle$.subscribe({
		next: (chunk) => {
			chunks.push(chunk);
		},
		error: (error: unknown) => {
			errors.push(error);
		},
	});

	return {
		turns$,
		seen,
		persisted,
		chunks,
		errors,
		state,
		cycleSub,
		persistSub,
		stop: () => {
			cycleSub.unsubscribe();
			persistSub.unsubscribe();
		},
	};
};

const isStateObject = (
	value: NodeStateJson,
): value is { readonly [key: string]: NodeStateJson } =>
	value !== null && typeof value === 'object' && !Array.isArray(value);

const historyOf = (
	snapshot: NodeStateJson | undefined,
): NodeStateJson | undefined => {
	if (snapshot === undefined || !isStateObject(snapshot)) {
		return undefined;
	}

	return snapshot['history'];
};

describe('createLlmSessionCycle$ node state', () => {
	it('assigns ChatCompletionMessage to NodeStateJson', () => {
		const message: ChatCompletionMessage = {
			role: 'assistant',
			content: 'hi',
			tool_calls: [{ id: '1', name: 'fn', arguments: '{}' }],
		};
		const asJson = (value: ChatCompletionMessage): NodeStateJson => value;
		expect(asJson(message)).toEqual(message);
	});

	it('persists { history } once per completed turn and not when the turn errors', () => {
		let calls = 0;
		const cycle = openCycle({
			primeTurn0: true,
			context: {
				maxFeedbackTurns: 0,
				prompt: 'original',
			},
			prelude: (context) => agentPrelude(context.prompt),
			runTurn: () => {
				calls += 1;
				if (calls === 1) {
					return of({ kind: 'response', text: 't0' });
				}

				return concat(
					of({ kind: 'response' as const, text: 'PARTIAL' }),
					throwError(() => new Error('boom')),
				);
			},
		});

		expect(cycle.persisted).toEqual([
			{
				history: [
					{ role: 'system', content: 'sys' },
					{ role: 'user', content: 'original' },
					{ role: 'assistant', content: 't0' },
				],
			},
		]);

		cycle.turns$.next('again');
		expect(cycle.errors).toHaveLength(1);
		expect(cycle.persisted).toHaveLength(1);
		expect(JSON.stringify(cycle.persisted)).not.toContain('PARTIAL');
		cycle.stop();
	});

	it('does not persist when a turn is unsubscribed mid-stream', () => {
		const gate = new Subject<TurnChunk>();
		const cycle = openCycle({
			primeTurn0: true,
			context: { maxFeedbackTurns: 0, prompt: 'original' },
			prelude: (context) => agentPrelude(context.prompt),
			runTurn: () => gate.asObservable(),
		});

		expect(cycle.seen).toHaveLength(1);
		expect(cycle.persisted).toEqual([]);
		cycle.cycleSub.unsubscribe();
		gate.next({ kind: 'response', text: 'PARTIAL' });
		gate.complete();
		expect(cycle.persisted).toEqual([]);
		cycle.persistSub.unsubscribe();
		gate.complete();
	});

	it('restore on primeTurn0 appends the new prompt and the priming turn runs', () => {
		const stored: readonly ChatCompletionMessage[] = [
			{ role: 'system', content: 'FROZEN' },
			{
				role: 'assistant',
				content: '',
				tool_calls: [{ id: 'call-1', name: 'fn', arguments: '{}' }],
			},
		];
		const cycle = openCycle({
			primeTurn0: true,
			context: { maxFeedbackTurns: 0, prompt: 'new prompt' },
			prelude: (context) => agentPrelude(context.prompt),
			beforeStart: (hook) => {
				expect(hook.restore({ history: [...stored] })).toEqual({
					ok: true,
				});
			},
		});

		expect(cycle.seen[0]).toEqual({
			payload: undefined,
			history: [...stored, { role: 'user', content: 'new prompt' }],
		});
		expect(historyOf(cycle.persisted[0])).toEqual([
			...stored,
			{ role: 'user', content: 'new prompt' },
			{ role: 'assistant', content: 't0' },
		]);
		cycle.stop();
	});

	it('restore on path-choice waits with turn0Done until the turn input', () => {
		const stored = longHistory();
		const cycle = openCycle({
			primeTurn0: false,
			context: { maxFeedbackTurns: 1, prompt: 'task' },
			prelude: () => systemPrelude(),
			appendUserFeedbackToHistory: false,
			trackAssistantHistory: false,
			beforeStart: (hook) => {
				expect(hook.restore({ history: stored })).toEqual({ ok: true });
			},
		});

		expect(cycle.seen).toEqual([]);
		cycle.turns$.next('revision');
		expect(cycle.seen).toEqual([{ payload: 'revision', history: stored }]);
		cycle.turns$.next('again');
		expect(cycle.seen).toHaveLength(1);
		expect(cycle.errors).toHaveLength(1);
		expect(cycle.chunks.some((chunk) => chunk.kind === 'toolLog')).toBe(
			true,
		);
		cycle.stop();
	});

	it('starts feedbackTurns at 0 after restore even when history is long', () => {
		const stored = longHistory();
		const cycle = openCycle({
			primeTurn0: true,
			context: { maxFeedbackTurns: 1, prompt: 'new prompt' },
			prelude: (context) => agentPrelude(context.prompt),
			beforeStart: (hook) => {
				hook.restore({ history: stored });
			},
		});

		expect(cycle.seen).toHaveLength(1);
		cycle.turns$.next('one');
		expect(cycle.seen).toHaveLength(2);
		expect(cycle.errors).toEqual([]);
		cycle.turns$.next('two');
		expect(cycle.seen).toHaveLength(2);
		expect(cycle.errors).toHaveLength(1);
		cycle.stop();
	});

	it('drops a restored session when a later context changes preparation', () => {
		const contexts = new Subject<AgentContext>();
		const stored: readonly ChatCompletionMessage[] = [
			{ role: 'system', content: 'FROZEN' },
			{ role: 'assistant', content: 'old' },
		];
		const cycle = openCycle({
			primeTurn0: true,
			context: contexts,
			prelude: (context) => agentPrelude(context.prompt),
			beforeStart: (hook) => {
				hook.restore({ history: [...stored] });
			},
		});

		contexts.next({ maxFeedbackTurns: 0, prompt: 'first' });
		expect(cycle.seen[0]?.history[0]).toEqual({
			role: 'system',
			content: 'FROZEN',
		});
		contexts.next({ maxFeedbackTurns: 0, prompt: 'second' });
		expect(cycle.seen[1]?.history).toEqual(agentPrelude('second'));
		expect(historyOf(cycle.persisted.at(-1))).toEqual([
			...agentPrelude('second'),
			{ role: 'assistant', content: 't0' },
		]);
		cycle.stop();
	});

	it('resetSessionOnInput replaces OpenAI history before the feedback turn', () => {
		const stored: readonly ChatCompletionMessage[] = [
			{ role: 'system', content: 'FROZEN' },
			{ role: 'assistant', content: 'old' },
		];
		const cycle = openCycle({
			primeTurn0: true,
			context: {
				maxFeedbackTurns: 0,
				prompt: 'original',
				resetSessionOnInput: true,
			},
			prelude: (context) => agentPrelude(context.prompt),
			beforeStart: (hook) => {
				hook.restore({ history: [...stored] });
			},
		});

		expect(cycle.seen[0]?.history[0]).toEqual({
			role: 'system',
			content: 'FROZEN',
		});
		cycle.turns$.next('   ');
		expect(cycle.seen).toHaveLength(1);
		cycle.turns$.next('fresh input');
		expect(cycle.seen[1]).toEqual({
			payload: 'fresh input',
			history: [
				...agentPrelude('original'),
				{ role: 'user', content: 'fresh input' },
			],
		});
		cycle.stop();
	});

	it('resetSessionOnInput is a no-op when the flag is off', () => {
		const cycle = openCycle({
			primeTurn0: true,
			context: { maxFeedbackTurns: 0, prompt: 'original' },
			prelude: (context) => agentPrelude(context.prompt),
		});

		cycle.turns$.next('more');
		expect(cycle.seen[1]?.history).toEqual([
			...agentPrelude('original'),
			{ role: 'assistant', content: 't0' },
			{ role: 'user', content: 'more' },
		]);
		cycle.stop();
	});

	it('resetSessionOnInput starts path-choice from the system prelude', () => {
		const kept: readonly ChatCompletionMessage[] = [
			{ role: 'system', content: 'sys' },
			{ role: 'user', content: 'kept' },
			{ role: 'assistant', content: 'kept' },
		];
		const on = openCycle({
			primeTurn0: false,
			context: {
				maxFeedbackTurns: 0,
				prompt: 'task',
				resetSessionOnInput: true,
			},
			prelude: () => systemPrelude(),
			appendUserFeedbackToHistory: false,
			trackAssistantHistory: false,
			runTurn: (_context, payload) =>
				payload === 'first'
					? of({ kind: 'historySync', messages: kept })
					: of({ kind: 'response', text: 'ok' }),
		});

		on.turns$.next('first');
		on.turns$.next('second');
		expect(on.seen[0]?.history).toEqual(systemPrelude());
		expect(on.seen[1]?.history).toEqual(systemPrelude());
		on.stop();

		const off = openCycle({
			primeTurn0: false,
			context: { maxFeedbackTurns: 0, prompt: 'task' },
			prelude: () => systemPrelude(),
			appendUserFeedbackToHistory: false,
			trackAssistantHistory: false,
			runTurn: (_context, payload) =>
				payload === 'first'
					? of({ kind: 'historySync', messages: kept })
					: of({ kind: 'response', text: 'ok' }),
		});
		off.turns$.next('first');
		off.turns$.next('second');
		expect(off.seen[1]?.history).toEqual(kept);
		off.stop();
	});

	it('refuses a restore value that is not { history } and restore(null) clears it', () => {
		const cycle = openCycle({
			primeTurn0: true,
			context: { maxFeedbackTurns: 0, prompt: 'original' },
			prelude: (context) => agentPrelude(context.prompt),
			beforeStart: (hook) => {
				const stored: readonly ChatCompletionMessage[] = [
					{ role: 'system', content: 'FROZEN' },
				];
				expect(hook.restore({ history: 'nope' })).toEqual({
					ok: false,
					message:
						'Node state must be { history: ChatCompletionMessage[] }',
				});
				expect(hook.restore({ history: [...stored] })).toEqual({
					ok: true,
				});
				expect(
					hook.restore({
						history: [...stored],
						feedbackTurns: 9,
					}),
				).toMatchObject({ ok: false });
			},
		});

		expect(cycle.seen[0]?.history[0]).toEqual({
			role: 'system',
			content: 'FROZEN',
		});
		cycle.stop();

		const cleared = openCycle({
			primeTurn0: true,
			context: { maxFeedbackTurns: 0, prompt: 'original' },
			prelude: (context) => agentPrelude(context.prompt),
			beforeStart: (hook) => {
				expect(
					hook.restore({
						history: [{ role: 'system', content: 'FROZEN' }],
					}),
				).toEqual({ ok: true });
				expect(hook.restore(null)).toEqual({ ok: true });
			},
		});
		expect(cleared.seen[0]?.history).toEqual(agentPrelude('original'));
		cleared.stop();
	});

	it('keeps resetSessionOnInput off Sub-Agent and on the session agents', () => {
		const field = {
			field: 'resetSessionOnInput',
			type: 'boolean',
			label: 'Reset session on input',
			default: false,
		};
		for (const node of [
			openAiLlmNode,
			fakeLlmNode,
			reviewNode,
			critiqueNode,
		]) {
			expect(node.uiSchema).toContainEqual(field);
			const instance = node.getInstance();
			expect(instance.state?.restore({ history: [] })).toEqual({
				ok: true,
			});
			expect(instance.state?.persist$).toBeDefined();
		}

		expect(subAgentNode.uiSchema.map((item) => item.field)).not.toContain(
			'resetSessionOnInput',
		);
		expect(subAgentNode.getInstance().state).toBeUndefined();
	});
});
