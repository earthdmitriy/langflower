import { ReplaySubject, filter, firstValueFrom, toArray } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LLM_RECOVERY_POLICY } from './llm-loop-types.js';
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
});
