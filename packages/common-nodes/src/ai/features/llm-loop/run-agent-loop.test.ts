import { ReplaySubject, Subject, filter, firstValueFrom, toArray } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import type { CreateChatCompletionStreamArgs } from '../chat-completion-stream.js';
import {
	DEFAULT_AUTOKICK_USER_MESSAGE,
	DEFAULT_LLM_RECOVERY_POLICY,
} from './llm-loop-types.js';
import { runAgentLoop } from './run-agent-loop.js';

describe('runAgentLoop recovery', () => {
	it('suspends after a provider 500 and continues after Steer', async () => {
		let call = 0;
		const messagesSeen: string[][] = [];
		const steerControl$ = new ReplaySubject<
			| { readonly kind: 'pause' }
			| { readonly kind: 'steer'; readonly text: string }
		>(1);
		const chunksPromise = firstValueFrom(
			runAgentLoop({
				factory: async (args) => {
					call += 1;
					messagesSeen.push(
						args.messages.map((message) => message.content),
					);
					if (call === 1) {
						throw {
							status: 500,
							message: '<html>Internal Server Error</html>',
						};
					}
					return (async function* () {
						yield {
							kind: 'done' as const,
							text: 'recovered',
						};
					})();
				},
				providerId: 'mock',
				model: 'mock',
				messages: [{ role: 'user', content: 'start' }],
				tools: [],
				maxIterations: 3,
				steerControl$,
				recovery: {
					...DEFAULT_LLM_RECOVERY_POLICY,
					maxTransientRetries: 0,
					autokickOnIdle: false,
				},
			}).pipe(toArray()),
		);

		await new Promise((resolve) => setTimeout(resolve, 20));
		steerControl$.next({
			kind: 'steer',
			text: 'continue safely',
		});

		const chunks = await chunksPromise;
		expect(call).toBe(2);
		expect(messagesSeen[1]).toEqual(['start', 'continue safely']);
		expect(chunks).toContainEqual({
			kind: 'response',
			text: 'recovered',
		});
	});

	it('treats finish_reason=length as truncation and resumes after Steer', async () => {
		let call = 0;
		let toolInvokes = 0;
		const steerControl$ = new ReplaySubject<
			| { readonly kind: 'pause' }
			| { readonly kind: 'steer'; readonly text: string }
		>(1);
		const chunksPromise = firstValueFrom(
			runAgentLoop({
				factory: async () => {
					call += 1;
					if (call === 1) {
						return (async function* () {
							yield {
								kind: 'done' as const,
								text: 'partial',
								finishReason: 'length' as const,
								toolCalls: [
									{
										id: 'call_1',
										name: 'echo',
										arguments: '{"x":',
									},
								],
							};
						})();
					}
					return (async function* () {
						yield {
							kind: 'done' as const,
							text: 'after steer',
						};
					})();
				},
				providerId: 'mock',
				model: 'mock',
				messages: [{ role: 'user', content: 'start' }],
				tools: [
					{
						toolId: 'echo',
						name: 'echo',
						description: 'echo',
						inputSchema: { type: 'object', properties: {} },
						invoke: async () => {
							toolInvokes += 1;
							return 'ok';
						},
					},
				],
				maxIterations: 3,
				steerControl$,
				recovery: {
					...DEFAULT_LLM_RECOVERY_POLICY,
					maxTransientRetries: 0,
				},
			}).pipe(toArray()),
		);

		await new Promise((resolve) => setTimeout(resolve, 20));
		steerControl$.next({
			kind: 'steer',
			text: 'raise tokens',
		});

		const chunks = await chunksPromise;
		expect(toolInvokes).toBe(0);
		expect(call).toBe(2);
		expect(
			chunks.some(
				(chunk) =>
					chunk.kind === 'recoveryNotice' &&
					chunk.text.includes('finish_reason=length'),
			),
		).toBe(true);
		expect(chunks).toContainEqual({
			kind: 'response',
			text: 'after steer',
		});
	});

	it('treats opaque unknown failures as recoverable and resumes after Steer', async () => {
		let call = 0;
		const steerControl$ = new ReplaySubject<
			| { readonly kind: 'pause' }
			| { readonly kind: 'steer'; readonly text: string }
		>(1);
		const chunksPromise = firstValueFrom(
			runAgentLoop({
				factory: async () => {
					call += 1;
					if (call === 1) {
						throw new Error('opaque provider glitch');
					}
					return (async function* () {
						yield {
							kind: 'done' as const,
							text: 'recovered from unknown',
						};
					})();
				},
				providerId: 'mock',
				model: 'mock',
				messages: [{ role: 'user', content: 'start' }],
				tools: [],
				maxIterations: 3,
				steerControl$,
				recovery: {
					...DEFAULT_LLM_RECOVERY_POLICY,
					maxTransientRetries: 0,
				},
			}).pipe(toArray()),
		);

		await new Promise((resolve) => setTimeout(resolve, 20));
		steerControl$.next({
			kind: 'steer',
			text: 'try again',
		});

		const chunks = await chunksPromise;
		expect(call).toBe(2);
		expect(
			chunks.some(
				(chunk) =>
					chunk.kind === 'recoveryNotice' &&
					chunk.text.includes('Retry budget exhausted'),
			),
		).toBe(true);
		expect(chunks).toContainEqual({
			kind: 'response',
			text: 'recovered from unknown',
		});
	});

	it('keeps authentication failures on the fatal error lane', async () => {
		await expect(
			firstValueFrom(
				runAgentLoop({
					factory: async () => {
						throw { status: 401, message: 'Unauthorized' };
					},
					providerId: 'mock',
					model: 'mock',
					messages: [{ role: 'user', content: 'start' }],
					tools: [],
					maxIterations: 3,
					recovery: {
						...DEFAULT_LLM_RECOVERY_POLICY,
						maxTransientRetries: 0,
					},
				}).pipe(toArray()),
			),
		).rejects.toThrow(/Unauthorized|authentication|401/i);
	});

	it('does not fail-closed on iteration count when maxIterations is 0', async () => {
		let call = 0;
		const chunks = await firstValueFrom(
			runAgentLoop({
				factory: async () => {
					call += 1;
					if (call < 4) {
						return (async function* () {
							yield {
								kind: 'done' as const,
								text: '',
								tool_calls: [
									{
										id: `c${call}`,
										name: 'echo',
										arguments: '{}',
									},
								],
							};
						})();
					}
					return (async function* () {
						yield {
							kind: 'done' as const,
							text: 'done after many rounds',
						};
					})();
				},
				providerId: 'mock',
				model: 'mock',
				messages: [{ role: 'user', content: 'start' }],
				tools: [
					{
						toolId: 'echo',
						name: 'echo',
						description: 'echo',
						inputSchema: { type: 'object', properties: {} },
						invoke: async () => 'ok',
					},
				],
				maxIterations: 0,
			}).pipe(toArray()),
		);

		expect(call).toBe(4);
		expect(chunks).toContainEqual({
			kind: 'response',
			text: 'done after many rounds',
		});
	});

	it('asks continue on maxIterations; Allow resets budget', async () => {
		let call = 0;
		let permissionAsks = 0;
		const chunks = await firstValueFrom(
			runAgentLoop({
				factory: async () => {
					call += 1;
					if (call === 1) {
						return (async function* () {
							yield {
								kind: 'done' as const,
								text: '',
								tool_calls: [
									{
										id: 'c1',
										name: 'echo',
										arguments: '{}',
									},
								],
							};
						})();
					}
					return (async function* () {
						yield {
							kind: 'done' as const,
							text: 'after continue',
						};
					})();
				},
				providerId: 'mock',
				model: 'mock',
				messages: [{ role: 'user', content: 'start' }],
				tools: [
					{
						toolId: 'echo',
						name: 'echo',
						description: 'echo',
						inputSchema: { type: 'object', properties: {} },
						invoke: async () => 'ok',
					},
				],
				maxIterations: 1,
				requestPermission: async (request) => {
					permissionAsks += 1;
					expect(request.toolId).toBe('agent.maxIterations');
					return 'allow';
				},
			}).pipe(toArray()),
		);

		expect(permissionAsks).toBe(1);
		expect(call).toBe(2);
		expect(
			chunks.some(
				(chunk) =>
					chunk.kind === 'toolLog' &&
					chunk.text.includes('Allow to continue'),
			),
		).toBe(true);
		expect(chunks).toContainEqual({
			kind: 'response',
			text: 'after continue',
		});
	});

	it('asks continue on maxIterations; Deny soft-completes', async () => {
		let call = 0;
		const chunks = await firstValueFrom(
			runAgentLoop({
				factory: async () => {
					call += 1;
					return (async function* () {
						yield {
							kind: 'done' as const,
							text: '',
							tool_calls: [
								{
									id: `c${call}`,
									name: 'echo',
									arguments: '{}',
								},
							],
						};
					})();
				},
				providerId: 'mock',
				model: 'mock',
				messages: [{ role: 'user', content: 'start' }],
				tools: [
					{
						toolId: 'echo',
						name: 'echo',
						description: 'echo',
						inputSchema: { type: 'object', properties: {} },
						invoke: async () => 'ok',
					},
				],
				maxIterations: 1,
				requestPermission: async () => 'deny',
			}).pipe(toArray()),
		);

		expect(call).toBe(1);
		expect(
			chunks.some(
				(chunk) =>
					chunk.kind === 'response' &&
					chunk.text.includes('maxIterations'),
			),
		).toBe(true);
	});

	it('commits a single closed assistant/tool block after a tool round', async () => {
		let call = 0;
		const messagesByCall: {
			readonly roles: readonly string[];
			readonly assistantToolCallCounts: readonly number[];
		}[] = [];

		const chunks = await firstValueFrom(
			runAgentLoop({
				factory: async (args) => {
					call += 1;
					messagesByCall.push({
						roles: args.messages.map((message) => message.role),
						assistantToolCallCounts: args.messages.map((message) =>
							message.role === 'assistant'
								? (message.tool_calls?.length ?? 0)
								: 0,
						),
					});
					if (call === 1) {
						return (async function* () {
							yield {
								kind: 'done' as const,
								text: '',
								tool_calls: [
									{
										id: 'c1',
										name: 'echo',
										arguments: '{}',
									},
								],
							};
						})();
					}
					return (async function* () {
						yield {
							kind: 'done' as const,
							text: 'after tools',
						};
					})();
				},
				providerId: 'mock',
				model: 'mock',
				messages: [{ role: 'user', content: 'start' }],
				tools: [
					{
						toolId: 'echo',
						name: 'echo',
						description: 'echo',
						inputSchema: { type: 'object', properties: {} },
						invoke: async () => 'ok',
					},
				],
				maxIterations: 3,
				compaction: { contextSize: 512, compactOnError: false },
			}).pipe(toArray()),
		);

		expect(call).toBe(2);
		const second = messagesByCall[1];
		expect(second).toBeDefined();
		const assistantWithTools = second!.assistantToolCallCounts.filter(
			(count) => count > 0,
		);
		expect(assistantWithTools).toEqual([1]);
		expect(second!.roles.filter((role) => role === 'tool')).toHaveLength(1);
		expect(
			chunks.some(
				(chunk) =>
					chunk.kind === 'toolLog' &&
					chunk.text.includes('Cannot compact history'),
			),
		).toBe(false);
		expect(chunks).toContainEqual({
			kind: 'response',
			text: 'after tools',
		});
	});

	it('suspends once on compaction protocol failure without transient retries', async () => {
		let call = 0;
		const steerControl$ = new ReplaySubject<
			| { readonly kind: 'pause' }
			| { readonly kind: 'steer'; readonly text: string }
		>(1);
		const longPad = 'x'.repeat(2_000);
		const notice = await firstValueFrom(
			runAgentLoop({
				factory: async () => {
					call += 1;
					return (async function* () {
						yield {
							kind: 'done' as const,
							text: 'should not reach provider before repair',
						};
					})();
				},
				providerId: 'mock',
				model: 'mock',
				messages: [
					{ role: 'system', content: longPad },
					{ role: 'user', content: longPad },
					{
						role: 'assistant',
						content: '',
						tool_calls: [
							{
								id: 'orphan',
								name: 'echo',
								arguments: '{}',
							},
						],
					},
					{ role: 'user', content: 'CURRENT' },
				],
				tools: [],
				maxIterations: 3,
				steerControl$,
				compaction: { contextSize: 200, compactOnError: false },
				recovery: {
					...DEFAULT_LLM_RECOVERY_POLICY,
					maxTransientRetries: 2,
					retryBaseDelayMs: 1,
				},
			}).pipe(
				filter(
					(chunk) =>
						chunk.kind === 'recoveryNotice' &&
						chunk.text.includes('Cannot compact history'),
				),
			),
		);

		expect(call).toBe(0);
		expect(notice.kind).toBe('recoveryNotice');
		if (notice.kind !== 'recoveryNotice') {
			return;
		}
		expect(notice.code).toBe('suspended');
		expect(notice.text).toMatch(/Paused for Steer or Resume/);
		expect(notice.text).not.toMatch(/Retrying/);
	});

	it('suspends on a repeating draft stream without erroring', async () => {
		let call = 0;
		const steerControl$ = new ReplaySubject<
			| { readonly kind: 'pause' }
			| { readonly kind: 'steer'; readonly text: string }
		>(1);
		const notice = await firstValueFrom(
			runAgentLoop({
				factory: async () => {
					call += 1;
					return (async function* () {
						for (let index = 0; index < 5; index += 1) {
							yield { kind: 'draft' as const, text: 'loop' };
						}
						yield { kind: 'done' as const, text: 'loop' };
					})();
				},
				providerId: 'mock',
				model: 'mock',
				messages: [{ role: 'user', content: 'start' }],
				tools: [],
				maxIterations: 3,
				steerControl$,
				recovery: {
					...DEFAULT_LLM_RECOVERY_POLICY,
					maxTransientRetries: 0,
					autokickOnIdle: false,
				},
			}).pipe(filter((chunk) => chunk.kind === 'recoveryNotice')),
		);

		expect(call).toBe(1);
		expect(notice.kind).toBe('recoveryNotice');
		if (notice.kind !== 'recoveryNotice') {
			return;
		}
		expect(notice.code).toBe('suspended');
		expect(notice.text).toMatch(/repetition loop/);
	});

	it('autokicks a repeating draft with checkpoint plus kick, not the partial', async () => {
		let call = 0;
		const factoryArgs: CreateChatCompletionStreamArgs[] = [];
		const steerControl$ = new ReplaySubject<
			| { readonly kind: 'pause' }
			| { readonly kind: 'steer'; readonly text: string }
		>(1);
		const chunks = await firstValueFrom(
			runAgentLoop({
				factory: async (args) => {
					call += 1;
					factoryArgs.push(args);
					if (call === 1) {
						return (async function* () {
							for (let index = 0; index < 5; index += 1) {
								yield { kind: 'draft' as const, text: 'loop' };
							}
							yield { kind: 'done' as const, text: 'loop' };
						})();
					}
					return (async function* () {
						yield { kind: 'done' as const, text: 'concise' };
					})();
				},
				providerId: 'mock',
				model: 'mock',
				messages: [{ role: 'user', content: 'start' }],
				tools: [],
				maxIterations: 3,
				steerControl$,
				recovery: {
					...DEFAULT_LLM_RECOVERY_POLICY,
					maxTransientRetries: 0,
					retryBaseDelayMs: 1,
					autokickBackoffMs: 1,
					autokickMaxBackoffMs: 1,
					autokickPenaltyDelta: {
						frequency: 0.5,
						presence: 0.4,
					},
				},
			}).pipe(toArray()),
		);

		expect(call).toBe(2);
		expect(factoryArgs[1]?.messages).toEqual([
			{ role: 'user', content: 'start' },
			{ role: 'user', content: DEFAULT_AUTOKICK_USER_MESSAGE },
		]);
		expect(factoryArgs[1]?.messages).not.toContainEqual({
			role: 'assistant',
			content: 'looplooplooplooploop',
		});
		expect(factoryArgs[1]?.frequency_penalty).toBe(0.5);
		expect(factoryArgs[1]?.presence_penalty).toBe(0.4);
		expect(factoryArgs[0]?.frequency_penalty).toBeUndefined();
		expect(
			chunks.some(
				(chunk) =>
					chunk.kind === 'recoveryNotice' && chunk.code === 'retry',
			),
		).toBe(true);
		const retry = chunks.find(
			(chunk) =>
				chunk.kind === 'recoveryNotice' && chunk.code === 'retry',
		);
		expect(retry).toMatchObject({
			kind: 'recoveryNotice',
			code: 'retry',
			attempt: 1,
			reason: 'dead-loop',
			backoffMs: 1,
		});
		if (retry?.kind === 'recoveryNotice') {
			expect(retry.lastAttemptAt).toBeUndefined();
			expect(retry.nextAttemptAt).toBeGreaterThan(0);
		}
		expect(
			chunks.some(
				(chunk) =>
					chunk.kind === 'recoveryNotice' &&
					chunk.code === 'suspended',
			),
		).toBe(false);
		expect(chunks).toContainEqual({
			kind: 'response',
			text: 'concise',
		});
	});

	it('does not wait idle autokick backoff before a dead-loop reconnect', async () => {
		vi.useFakeTimers();
		let call = 0;
		try {
			const chunksPromise = firstValueFrom(
				runAgentLoop({
					factory: async () => {
						call += 1;
						if (call === 1) {
							return (async function* () {
								for (let index = 0; index < 5; index += 1) {
									yield {
										kind: 'draft' as const,
										text: 'loop',
									};
								}
								yield { kind: 'done' as const, text: 'loop' };
							})();
						}
						return (async function* () {
							yield { kind: 'done' as const, text: 'concise' };
						})();
					},
					providerId: 'mock',
					model: 'mock',
					messages: [{ role: 'user', content: 'start' }],
					tools: [],
					maxIterations: 3,
					recovery: {
						...DEFAULT_LLM_RECOVERY_POLICY,
						maxTransientRetries: 0,
						retryBaseDelayMs: 1,
						autokickBackoffMs: 60_000,
						autokickMaxBackoffMs: 60_000,
					},
				}).pipe(toArray()),
			);

			await vi.advanceTimersByTimeAsync(1);
			const chunks = await chunksPromise;
			expect(call).toBe(2);
			const retry = chunks.find(
				(chunk) =>
					chunk.kind === 'recoveryNotice' && chunk.code === 'retry',
			);
			expect(retry).toMatchObject({
				kind: 'recoveryNotice',
				reason: 'dead-loop',
				backoffMs: 1,
			});
			expect(chunks).toContainEqual({
				kind: 'response',
				text: 'concise',
			});
		} finally {
			vi.useRealTimers();
		}
	});

	it('cancels autokick backoff on Pause without a second factory call', async () => {
		vi.useFakeTimers();
		let call = 0;
		const steerControl$ = new Subject<
			| { readonly kind: 'pause' }
			| { readonly kind: 'steer'; readonly text: string }
		>();
		const chunks: Array<{
			readonly kind: string;
			readonly code?: string;
			readonly text?: string;
		}> = [];
		const sub = runAgentLoop({
			factory: async () => {
				call += 1;
				return (async function* () {
					for (let index = 0; index < 5; index += 1) {
						yield { kind: 'draft' as const, text: 'loop' };
					}
					yield { kind: 'done' as const, text: 'loop' };
				})();
			},
			providerId: 'mock',
			model: 'mock',
			messages: [{ role: 'user', content: 'start' }],
			tools: [],
			maxIterations: 3,
			steerControl$,
			recovery: {
				...DEFAULT_LLM_RECOVERY_POLICY,
				maxTransientRetries: 0,
				autokickBackoffMs: 60_000,
				autokickMaxBackoffMs: 60_000,
			},
		}).subscribe((chunk) => {
			chunks.push(chunk);
		});

		try {
			await vi.advanceTimersByTimeAsync(0);
			expect(
				chunks.some(
					(chunk) =>
						chunk.kind === 'recoveryNotice' &&
						chunk.code === 'retry',
				),
			).toBe(true);

			steerControl$.next({ kind: 'pause' });
			await vi.advanceTimersByTimeAsync(0);

			expect(call).toBe(1);
			expect(
				chunks.some(
					(chunk) =>
						chunk.kind === 'toolLog' &&
						chunk.text?.includes('Paused'),
				),
			).toBe(true);
			expect(chunks.some((chunk) => chunk.kind === 'response')).toBe(
				false,
			);
		} finally {
			sub.unsubscribe();
			vi.useRealTimers();
		}
	});

	it('autokicks an idle empty stream then succeeds', async () => {
		let call = 0;
		const steerControl$ = new ReplaySubject<
			| { readonly kind: 'pause' }
			| { readonly kind: 'steer'; readonly text: string }
		>(1);
		const chunks = await firstValueFrom(
			runAgentLoop({
				factory: async () => {
					call += 1;
					if (call === 1) {
						return (async function* () {
							await new Promise(() => undefined);
						})();
					}
					return (async function* () {
						yield { kind: 'done' as const, text: 'after idle' };
					})();
				},
				providerId: 'mock',
				model: 'mock',
				messages: [{ role: 'user', content: 'start' }],
				tools: [],
				maxIterations: 3,
				steerControl$,
				recovery: {
					...DEFAULT_LLM_RECOVERY_POLICY,
					maxTransientRetries: 0,
					streamIdleTimeoutMs: 40,
					autokickBackoffMs: 1,
					autokickMaxBackoffMs: 1,
				},
			}).pipe(toArray()),
		);

		expect(call).toBe(2);
		const idleRetry = chunks.find(
			(chunk) =>
				chunk.kind === 'recoveryNotice' && chunk.code === 'retry',
		);
		expect(idleRetry).toMatchObject({
			kind: 'recoveryNotice',
			code: 'retry',
			attempt: 1,
			reason: 'idle',
			backoffMs: 1,
		});
		if (idleRetry?.kind === 'recoveryNotice') {
			expect(idleRetry.lastAttemptAt).toBeUndefined();
			expect(idleRetry.nextAttemptAt).toBeGreaterThan(0);
		}
		expect(chunks).toContainEqual({
			kind: 'response',
			text: 'after idle',
		});
	});

	it('stamps lastAttemptAt on the second autokick wait', async () => {
		let call = 0;
		const steerControl$ = new ReplaySubject<
			| { readonly kind: 'pause' }
			| { readonly kind: 'steer'; readonly text: string }
		>(1);
		const chunks = await firstValueFrom(
			runAgentLoop({
				factory: async () => {
					call += 1;
					if (call < 3) {
						return (async function* () {
							for (let index = 0; index < 5; index += 1) {
								yield { kind: 'draft' as const, text: 'loop' };
							}
							yield { kind: 'done' as const, text: 'loop' };
						})();
					}
					return (async function* () {
						yield { kind: 'done' as const, text: 'concise' };
					})();
				},
				providerId: 'mock',
				model: 'mock',
				messages: [{ role: 'user', content: 'start' }],
				tools: [],
				maxIterations: 3,
				steerControl$,
				recovery: {
					...DEFAULT_LLM_RECOVERY_POLICY,
					maxTransientRetries: 0,
					retryBaseDelayMs: 1,
					autokickBackoffMs: 1,
					autokickMaxBackoffMs: 1,
				},
			}).pipe(toArray()),
		);

		const retries = chunks.filter(
			(chunk) =>
				chunk.kind === 'recoveryNotice' && chunk.code === 'retry',
		);
		expect(retries).toHaveLength(2);
		expect(retries[0]).toMatchObject({
			attempt: 1,
			reason: 'dead-loop',
		});
		if (retries[0]?.kind === 'recoveryNotice') {
			expect(retries[0].lastAttemptAt).toBeUndefined();
		}
		expect(retries[1]).toMatchObject({
			attempt: 2,
			reason: 'dead-loop',
		});
		if (retries[1]?.kind === 'recoveryNotice') {
			expect(retries[1].lastAttemptAt).toBeGreaterThan(0);
			expect(retries[1].nextAttemptAt).toBeGreaterThan(
				retries[1].lastAttemptAt ?? 0,
			);
		}
		expect(call).toBe(3);
	});

	it('joins 429 into autokick wait without a kick or penalty', async () => {
		let call = 0;
		const factoryArgs: CreateChatCompletionStreamArgs[] = [];
		const chunks = await firstValueFrom(
			runAgentLoop({
				factory: async (args) => {
					call += 1;
					factoryArgs.push(args);
					if (call === 1) {
						throw { status: 429, message: 'Rate limit' };
					}
					return (async function* () {
						yield { kind: 'done' as const, text: 'after 429' };
					})();
				},
				providerId: 'mock',
				model: 'mock',
				messages: [{ role: 'user', content: 'start' }],
				tools: [],
				maxIterations: 3,
				recovery: {
					...DEFAULT_LLM_RECOVERY_POLICY,
					maxTransientRetries: 0,
					autokickBackoffMs: 1,
					autokickMaxBackoffMs: 1,
					autokickPenaltyDelta: {
						frequency: 0.5,
						presence: 0.4,
					},
				},
			}).pipe(toArray()),
		);

		expect(call).toBe(2);
		expect(factoryArgs[1]?.messages).toEqual([
			{ role: 'user', content: 'start' },
		]);
		expect(factoryArgs[1]?.frequency_penalty).toBeUndefined();
		expect(factoryArgs[1]?.presence_penalty).toBeUndefined();
		const retry = chunks.find(
			(chunk) =>
				chunk.kind === 'recoveryNotice' && chunk.code === 'retry',
		);
		expect(retry).toMatchObject({
			kind: 'recoveryNotice',
			code: 'retry',
			attempt: 1,
			reason: 'rate-limit',
			backoffMs: 1,
		});
		if (retry?.kind === 'recoveryNotice') {
			expect(retry.lastAttemptAt).toBeUndefined();
			expect(retry.nextAttemptAt).toBeGreaterThan(0);
		}
		expect(
			chunks.some(
				(chunk) =>
					chunk.kind === 'recoveryNotice' &&
					chunk.code === 'suspended',
			),
		).toBe(false);
		expect(chunks).toContainEqual({
			kind: 'response',
			text: 'after 429',
		});
	});

	it('uses the short transient budget before joining 429 autokick', async () => {
		let call = 0;
		const chunks = await firstValueFrom(
			runAgentLoop({
				factory: async () => {
					call += 1;
					if (call < 3) {
						throw { status: 429, message: 'Rate limit' };
					}
					return (async function* () {
						yield { kind: 'done' as const, text: 'after budget' };
					})();
				},
				providerId: 'mock',
				model: 'mock',
				messages: [{ role: 'user', content: 'start' }],
				tools: [],
				maxIterations: 3,
				recovery: {
					...DEFAULT_LLM_RECOVERY_POLICY,
					maxTransientRetries: 1,
					retryBaseDelayMs: 1,
					autokickBackoffMs: 1,
					autokickMaxBackoffMs: 1,
				},
			}).pipe(toArray()),
		);

		const retries = chunks.filter(
			(chunk) =>
				chunk.kind === 'recoveryNotice' && chunk.code === 'retry',
		);
		expect(retries).toHaveLength(2);
		expect(retries[0]).toMatchObject({
			attempt: 1,
			reason: 'rate-limit',
			backoffMs: 1,
		});
		expect(retries[1]).toMatchObject({
			attempt: 1,
			reason: 'rate-limit',
			backoffMs: 1,
		});
		expect(call).toBe(3);
		expect(chunks).toContainEqual({
			kind: 'response',
			text: 'after budget',
		});
	});

	it('suspends 429 after the budget when autokick is off', async () => {
		let call = 0;
		const steerControl$ = new ReplaySubject<
			| { readonly kind: 'pause' }
			| { readonly kind: 'steer'; readonly text: string }
		>(1);
		const chunksPromise = firstValueFrom(
			runAgentLoop({
				factory: async () => {
					call += 1;
					if (call === 1) {
						throw { status: 429, message: 'Rate limit' };
					}
					return (async function* () {
						yield { kind: 'done' as const, text: 'after steer' };
					})();
				},
				providerId: 'mock',
				model: 'mock',
				messages: [{ role: 'user', content: 'start' }],
				tools: [],
				maxIterations: 3,
				steerControl$,
				recovery: {
					...DEFAULT_LLM_RECOVERY_POLICY,
					maxTransientRetries: 0,
					autokickOnIdle: false,
				},
			}).pipe(toArray()),
		);

		await new Promise((resolve) => setTimeout(resolve, 20));
		steerControl$.next({
			kind: 'steer',
			text: 'try later',
		});

		const chunks = await chunksPromise;
		expect(call).toBe(2);
		expect(
			chunks.some(
				(chunk) =>
					chunk.kind === 'recoveryNotice' &&
					chunk.code === 'suspended' &&
					chunk.text.includes('Retry budget exhausted'),
			),
		).toBe(true);
		expect(chunks).toContainEqual({
			kind: 'response',
			text: 'after steer',
		});
	});

	it('cancels HTTP autokick backoff on Pause without a second factory call', async () => {
		vi.useFakeTimers();
		let call = 0;
		const steerControl$ = new Subject<
			| { readonly kind: 'pause' }
			| { readonly kind: 'steer'; readonly text: string }
		>();
		const chunks: Array<{
			readonly kind: string;
			readonly code?: string;
			readonly text?: string;
		}> = [];
		const sub = runAgentLoop({
			factory: async () => {
				call += 1;
				throw { status: 500, message: 'unavailable' };
			},
			providerId: 'mock',
			model: 'mock',
			messages: [{ role: 'user', content: 'start' }],
			tools: [],
			maxIterations: 3,
			steerControl$,
			recovery: {
				...DEFAULT_LLM_RECOVERY_POLICY,
				maxTransientRetries: 0,
				autokickBackoffMs: 60_000,
				autokickMaxBackoffMs: 60_000,
			},
		}).subscribe((chunk) => {
			chunks.push(chunk);
		});

		try {
			await vi.advanceTimersByTimeAsync(0);
			expect(
				chunks.some(
					(chunk) =>
						chunk.kind === 'recoveryNotice' &&
						chunk.code === 'retry',
				),
			).toBe(true);

			steerControl$.next({ kind: 'pause' });
			await vi.advanceTimersByTimeAsync(0);

			expect(call).toBe(1);
			expect(
				chunks.some(
					(chunk) =>
						chunk.kind === 'toolLog' &&
						chunk.text?.includes('Paused'),
				),
			).toBe(true);
			expect(chunks.some((chunk) => chunk.kind === 'response')).toBe(
				false,
			);
		} finally {
			sub.unsubscribe();
			vi.useRealTimers();
		}
	});

	it('re-reads getTools each iteration for invoke and provider tools', async () => {
		let phase = 0;
		const providerToolNames: string[][] = [];
		const handleV1 = {
			toolId: 'echo',
			name: 'echo',
			description: 'echo',
			inputSchema: { type: 'object', properties: {} },
			invoke: async () => {
				phase = 1;
				return 'v1';
			},
		};
		const handleV2 = {
			toolId: 'echo',
			name: 'echo',
			description: 'echo',
			inputSchema: { type: 'object', properties: {} },
			invoke: async () => 'v2',
		};
		const handleNew = {
			toolId: 'new_tool',
			name: 'new_tool',
			description: 'new',
			inputSchema: { type: 'object', properties: {} },
			invoke: async () => 'new',
		};

		const chunks = await firstValueFrom(
			runAgentLoop({
				factory: async (args) => {
					providerToolNames.push(
						(args.tools ?? []).map((tool) => tool.function.name),
					);
					const round = providerToolNames.length;
					if (round === 1 || round === 2) {
						return (async function* () {
							yield {
								kind: 'done' as const,
								text: '',
								tool_calls: [
									{
										id: `c${round}`,
										name: 'echo',
										arguments: '{}',
									},
								],
							};
						})();
					}

					return (async function* () {
						yield {
							kind: 'done' as const,
							text: 'done',
						};
					})();
				},
				providerId: 'mock',
				model: 'mock',
				messages: [{ role: 'user', content: 'start' }],
				tools: [handleV1],
				getTools: () =>
					phase === 0 ? [handleV1] : [handleV2, handleNew],
				toolCtx: { projectDir: '/tmp', runId: 'test' },
				maxIterations: 5,
			}).pipe(toArray()),
		);

		expect(providerToolNames[0]).toContain('echo');
		expect(providerToolNames[0]).not.toContain('new_tool');
		expect(providerToolNames[1]).toContain('echo');
		expect(providerToolNames[1]).toContain('new_tool');
		expect(
			chunks.some(
				(chunk) =>
					chunk.kind === 'toolLog' &&
					chunk.text.includes('← echo: v1'),
			),
		).toBe(true);
		expect(
			chunks.some(
				(chunk) =>
					chunk.kind === 'toolLog' &&
					chunk.text.includes('← echo: v2'),
			),
		).toBe(true);
		expect(chunks).toContainEqual({
			kind: 'response',
			text: 'done',
		});
	});

	it('leaves ordinary → toolLog streaming unspecified', async () => {
		const chunks = await firstValueFrom(
			runAgentLoop({
				factory: async () =>
					(async function* () {
						yield {
							kind: 'done' as const,
							text: '',
							tool_calls: [
								{
									id: 'c1',
									name: 'echo',
									arguments: '{}',
								},
							],
						};
					})(),
				providerId: 'mock',
				model: 'mock',
				messages: [{ role: 'user', content: 'start' }],
				tools: [
					{
						toolId: 'echo',
						name: 'echo',
						description: 'echo',
						inputSchema: { type: 'object', properties: {} },
						invoke: async () => 'ok',
					},
				],
				toolCtx: { projectDir: '/tmp', runId: 'test' },
				maxIterations: 2,
			}).pipe(toArray()),
		);

		const callLog = chunks.find(
			(chunk) =>
				chunk.kind === 'toolLog' && chunk.text.startsWith('→ echo'),
		);
		expect(callLog).toMatchObject({ kind: 'toolLog' });
		expect(callLog).not.toHaveProperty('streaming');
	});

	it('does not apply toolTimeoutMs to Sub-Agent tools', async () => {
		let round = 0;
		const chunks = await firstValueFrom(
			runAgentLoop({
				factory: async () => {
					round += 1;
					if (round === 1) {
						return (async function* () {
							yield {
								kind: 'done' as const,
								text: '',
								tool_calls: [
									{
										id: 'c1',
										name: 'Writer_subagent',
										arguments: '{"task":"hi"}',
									},
								],
							};
						})();
					}

					return (async function* () {
						yield {
							kind: 'done' as const,
							text: 'ok',
						};
					})();
				},
				providerId: 'mock',
				model: 'mock',
				messages: [{ role: 'user', content: 'start' }],
				tools: [
					{
						toolId: 'Writer_subagent',
						name: 'Writer(subagent)',
						description: 'writer',
						inputSchema: { type: 'object', properties: {} },
						invoke: async () => {
							await new Promise((resolve) =>
								setTimeout(resolve, 80),
							);
							return 'done';
						},
					},
				],
				toolCtx: { projectDir: '/tmp', runId: 'test' },
				maxIterations: 2,
				recovery: {
					...DEFAULT_LLM_RECOVERY_POLICY,
					toolTimeoutMs: 20,
				},
			}).pipe(toArray()),
		);

		expect(
			chunks.some(
				(chunk) =>
					chunk.kind === 'toolLog' &&
					chunk.text.includes('timed out'),
			),
		).toBe(false);
		expect(
			chunks.some(
				(chunk) =>
					chunk.kind === 'toolLog' &&
					chunk.text.includes('← Writer_subagent: done'),
			),
		).toBe(true);
	});
});
