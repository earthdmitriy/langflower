import type { ToolHandle } from '@langflower/node-sdk';
import type { Harness } from '@langflower/tools/create-project-harness';
import type { CreateChatCompletionStreamArgs } from '../ai/features/chat-completion-stream.js';
import { describe, expect, it, vi } from 'vitest';
import { firstValueFrom, ReplaySubject, toArray } from 'rxjs';
import { runAgentLoop as runInternalToolLoop } from '../ai/features/llm-loop/run-agent-loop.js';
import { SUMMARY_SYSTEM_PROMPT } from '../ai/features/openai/llm-context-compaction.js';

const handle = (toolId: string, invoke: ToolHandle['invoke']): ToolHandle => ({
	toolId,
	name: toolId,
	description: toolId,
	inputSchema: { type: 'object', properties: {} },
	invoke,
});

describe('runInternalToolLoop compaction', () => {
	it('emits toolLog + historySync before streaming when proactive compact runs', async () => {
		const long = 'x'.repeat(8000);
		let call = 0;
		const factory = async (args: CreateChatCompletionStreamArgs) => {
			call += 1;
			const isSummary = args.messages.some(
				(message) =>
					message.role === 'system' &&
					message.content === SUMMARY_SYSTEM_PROMPT,
			);

			if (isSummary) {
				return (async function* () {
					yield {
						kind: 'done' as const,
						text: 'Prior conversation summary',
					};
				})();
			}

			return (async function* () {
				yield { kind: 'draft' as const, text: 'Hello' };
				yield { kind: 'done' as const, text: 'Hello' };
			})();
		};

		const chunks = await firstValueFrom(
			runInternalToolLoop({
				factory,
				providerId: 'mock',
				model: 'mock',
				messages: [
					{ role: 'system', content: 'sys' },
					{ role: 'user', content: long },
					{ role: 'assistant', content: long },
					{ role: 'user', content: 'NOW' },
				],
				tools: [],
				harness: undefined,
				maxIterations: 1,
				compaction: { contextSize: 500, compactOnError: false },
			}).pipe(toArray()),
		);

		expect(chunks[0]?.kind).toBe('toolLog');
		expect(String((chunks[0] as { text: string }).text)).toMatch(
			/Compacted history \(proactive\)/,
		);
		expect(chunks[1]?.kind).toBe('historySync');
		expect(chunks.map((chunk) => chunk.kind)).toContain('response');
		expect(call).toBeGreaterThanOrEqual(2);
	});
});

describe('runInternalToolLoop allowlist', () => {
	it('rejects tool calls outside enabled inventory without invoking harness', async () => {
		const invoke = vi.fn(async () => ({ ok: true as const, text: 'ok' }));
		const harness: Harness = {
			invoke,
			authorize: async () => 'allow',
			listBuiltinRegistrations: () => [],
		};

		const factory = async (_args: CreateChatCompletionStreamArgs) =>
			(async function* () {
				yield {
					kind: 'done' as const,
					text: '',
					tool_calls: [
						{
							id: 'c1',
							name: 'write',
							arguments: JSON.stringify({
								path: 'x.txt',
								content: 'nope',
							}),
						},
					],
				};
			})();

		const chunks = await firstValueFrom(
			runInternalToolLoop({
				factory,
				providerId: 'mock',
				model: 'mock',
				messages: [{ role: 'user', content: 'hi' }],
				tools: [handle('read', async () => 'ok')],
				harness,
				maxIterations: 2,
			}).pipe(toArray()),
		);

		expect(invoke).not.toHaveBeenCalled();
		expect(
			chunks.some(
				(chunk) =>
					chunk.kind === 'toolLog' &&
					chunk.text.includes('not in the enabled allowlist'),
			),
		).toBe(true);
	});

	it('invokes ToolHandle without harness toolId lookup', async () => {
		const invoke = vi.fn(async () => ({ ok: true as const, text: 'nope' }));
		const harness: Harness = {
			invoke,
			authorize: async () => 'allow',
			listBuiltinRegistrations: () => [],
		};
		const handler = vi.fn(async (args: Readonly<Record<string, unknown>>) =>
			JSON.stringify({ echo: args.x }),
		);
		let round = 0;

		const factory = async (_args: CreateChatCompletionStreamArgs) => {
			round += 1;
			return (async function* () {
				if (round === 1) {
					yield {
						kind: 'done' as const,
						text: '',
						tool_calls: [
							{
								id: 'c1',
								name: 'custom_echo',
								arguments: JSON.stringify({ x: 1 }),
							},
						],
					};
					return;
				}

				yield {
					kind: 'done' as const,
					text: 'done',
					tool_calls: [],
				};
			})();
		};

		const chunks = await firstValueFrom(
			runInternalToolLoop({
				factory,
				providerId: 'mock',
				model: 'mock',
				messages: [{ role: 'user', content: 'hi' }],
				tools: [handle('custom_echo', handler)],
				harness,
				toolCtx: {
					projectDir: '/tmp/proj',
					runId: 'run-1',
				},
				maxIterations: 3,
			}).pipe(toArray()),
		);

		expect(invoke).not.toHaveBeenCalled();
		expect(handler).toHaveBeenCalledWith(
			{ x: 1 },
			expect.objectContaining({
				projectDir: '/tmp/proj',
				runId: 'run-1',
			}),
		);
		expect(
			chunks.some(
				(chunk) =>
					chunk.kind === 'toolLog' && chunk.text.includes('"echo":1'),
			),
		).toBe(true);
	});

	it('denies builtin ToolHandle when authorize returns deny', async () => {
		const handler = vi.fn(async () => 'should-not-run');
		const harness: Harness = {
			invoke: vi.fn(async () => ({ ok: true as const, text: 'nope' })),
			authorize: async () => 'deny',
			listBuiltinRegistrations: () => [],
		};
		let round = 0;

		const factory = async (_args: CreateChatCompletionStreamArgs) => {
			round += 1;
			return (async function* () {
				if (round === 1) {
					yield {
						kind: 'done' as const,
						text: '',
						tool_calls: [
							{
								id: 'c1',
								name: 'write',
								arguments: JSON.stringify({
									path: 'a.txt',
									content: 'x',
								}),
							},
						],
					};
					return;
				}

				yield {
					kind: 'done' as const,
					text: 'done',
					tool_calls: [],
				};
			})();
		};

		const chunks = await firstValueFrom(
			runInternalToolLoop({
				factory,
				providerId: 'mock',
				model: 'mock',
				messages: [{ role: 'user', content: 'hi' }],
				tools: [handle('write', handler)],
				harness,
				toolCtx: {
					projectDir: '/tmp/proj',
					runId: 'run-1',
				},
				maxIterations: 3,
			}).pipe(toArray()),
		);

		expect(handler).not.toHaveBeenCalled();
		expect(
			chunks.some(
				(chunk) =>
					chunk.kind === 'toolLog' &&
					chunk.text.includes('Permission denied for write'),
			),
		).toBe(true);
	});

	it('invokes wired custom ToolHandle even when authorize would deny', async () => {
		const handler = vi.fn(async () => 'wired-ok');
		const harness: Harness = {
			invoke: vi.fn(async () => ({ ok: true as const, text: 'nope' })),
			authorize: async () => 'deny',
			listBuiltinRegistrations: () => [],
		};
		let round = 0;

		const factory = async (_args: CreateChatCompletionStreamArgs) => {
			round += 1;
			return (async function* () {
				if (round === 1) {
					yield {
						kind: 'done' as const,
						text: '',
						tool_calls: [
							{
								id: 'c1',
								name: 'append_memory_log',
								arguments: JSON.stringify({
									file_path: 'a.md',
									content: '- note',
								}),
							},
						],
					};
					return;
				}

				yield {
					kind: 'done' as const,
					text: 'done',
					tool_calls: [],
				};
			})();
		};

		const chunks = await firstValueFrom(
			runInternalToolLoop({
				factory,
				providerId: 'mock',
				model: 'mock',
				messages: [{ role: 'user', content: 'hi' }],
				tools: [handle('append_memory_log', handler)],
				harness,
				toolCtx: {
					projectDir: '/tmp/proj',
					runId: 'run-1',
				},
				maxIterations: 3,
			}).pipe(toArray()),
		);

		expect(handler).toHaveBeenCalled();
		expect(
			chunks.some(
				(chunk) =>
					chunk.kind === 'toolLog' && chunk.text.includes('wired-ok'),
			),
		).toBe(true);
	});
});

describe('runInternalToolLoop soft pause (ADR-032)', () => {
	it('awaits steer after pause and continues with steered text', async () => {
		let call = 0;
		const factory = async (args: CreateChatCompletionStreamArgs) => {
			call += 1;
			if (call === 1) {
				return (async function* () {
					yield { kind: 'draft' as const, text: 'partial' };
					await new Promise<void>((resolve) => {
						const signal = args.signal;
						if (signal === undefined || signal.aborted) {
							resolve();
							return;
						}
						signal.addEventListener('abort', () => resolve(), {
							once: true,
						});
					});
				})();
			}
			return (async function* () {
				yield { kind: 'draft' as const, text: 'done' };
				yield { kind: 'done' as const, text: 'done' };
			})();
		};

		const steerControl$ = new ReplaySubject<unknown>(1);
		const seen: Array<{ kind: string; text?: string }> = [];

		const chunksPromise = new Promise<typeof seen>((resolve, reject) => {
			runInternalToolLoop({
				factory,
				providerId: 'mock',
				model: 'mock',
				messages: [{ role: 'user', content: 'hi' }],
				tools: [],
				maxIterations: 3,
				steerControl$,
			}).subscribe({
				next: (chunk) => {
					seen.push(chunk);
				},
				error: reject,
				complete: () => {
					resolve(seen);
				},
			});
		});

		await vi.waitFor(() =>
			expect(
				seen.some(
					(chunk) =>
						chunk.kind === 'draftResponse' &&
						chunk.text === 'partial',
				),
			).toBe(true),
		);
		steerControl$.next({ kind: 'pause' });
		await new Promise((resolve) => setTimeout(resolve, 20));
		steerControl$.next({ kind: 'steer', text: 'continue please' });

		const chunks = await chunksPromise;
		expect(call).toBe(2);
		expect(
			chunks.some(
				(chunk) =>
					chunk.kind === 'draftResponse' && chunk.text === 'partial',
			),
		).toBe(true);
		expect(
			chunks.some(
				(chunk) => chunk.kind === 'response' && chunk.text === 'done',
			),
		).toBe(true);
	});

	it('recovers when provider stream throws AbortError on pause', async () => {
		let call = 0;
		const factory = async (args: CreateChatCompletionStreamArgs) => {
			call += 1;
			if (call === 1) {
				return (async function* () {
					yield { kind: 'draft' as const, text: 'partial' };
					await new Promise<never>((_resolve, reject) => {
						const signal = args.signal;
						const fail = (): void => {
							const err = new Error('Request was aborted.');
							err.name = 'AbortError';
							reject(err);
						};
						if (signal === undefined || signal.aborted) {
							fail();
							return;
						}
						signal.addEventListener('abort', fail, {
							once: true,
						});
					});
				})();
			}
			return (async function* () {
				yield { kind: 'draft' as const, text: 'done' };
				yield { kind: 'done' as const, text: 'done' };
			})();
		};

		const steerControl$ = new ReplaySubject<unknown>(1);
		const seen: Array<{ kind: string; text?: string }> = [];

		const chunksPromise = new Promise<typeof seen>((resolve, reject) => {
			runInternalToolLoop({
				factory,
				providerId: 'mock',
				model: 'mock',
				messages: [{ role: 'user', content: 'hi' }],
				tools: [],
				maxIterations: 3,
				steerControl$,
			}).subscribe({
				next: (chunk) => {
					seen.push(chunk);
				},
				error: reject,
				complete: () => {
					resolve(seen);
				},
			});
		});

		await vi.waitFor(() =>
			expect(
				seen.some(
					(chunk) =>
						chunk.kind === 'draftResponse' &&
						chunk.text === 'partial',
				),
			).toBe(true),
		);
		steerControl$.next({ kind: 'pause' });
		await new Promise((resolve) => setTimeout(resolve, 20));
		steerControl$.next({ kind: 'steer', text: 'continue please' });

		const chunks = await chunksPromise;
		expect(call).toBe(2);
		expect(
			chunks.some(
				(chunk) => chunk.kind === 'response' && chunk.text === 'done',
			),
		).toBe(true);
	});
});
