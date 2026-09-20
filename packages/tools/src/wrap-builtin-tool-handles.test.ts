import { describe, expect, it, vi } from 'vitest';
import type { Harness } from './harness-types.js';
import { wrapBuiltinToolHandles } from './wrap-builtin-tool-handles.js';

const registration = (
	toolId: string,
): ReturnType<Harness['listBuiltinRegistrations']>[number] => ({
	toolId,
	name: toolId,
	description: `${toolId} tool`,
	inputSchema: { type: 'object' },
});

describe('wrapBuiltinToolHandles', () => {
	it('omits always-deny builtins from inventory', () => {
		const harness: Harness = {
			listBuiltinRegistrations: () => [
				registration('read'),
				registration('bash'),
			],
			invoke: async () => ({ ok: true, text: 'ok' }),
		};

		const handles = wrapBuiltinToolHandles(harness, {
			bash: { '*': 'deny' },
		});

		expect(handles.map((handle) => handle.toolId)).toEqual(['read']);
	});

	it('throws harness failure text from invoke', async () => {
		const harness: Harness = {
			listBuiltinRegistrations: () => [registration('read')],
			invoke: async () => ({ ok: false, text: 'blocked' }),
		};

		const [handle] = wrapBuiltinToolHandles(harness);
		await expect(handle.invoke({ path: 'a.txt' })).rejects.toThrow(
			'blocked',
		);
	});

	it('forwards abort signal from the host tool context', async () => {
		const invoke = vi.fn(async () => ({ ok: true, text: 'ok' as const }));
		const harness: Harness = {
			listBuiltinRegistrations: () => [registration('read')],
			invoke,
		};
		const signal = new AbortController().signal;
		const [handle] = wrapBuiltinToolHandles(harness);

		await handle.invoke(
			{ path: 'a.txt' },
			{
				projectDir: '/p',
				runId: 'r1',
				signal,
			},
		);

		expect(invoke).toHaveBeenCalledWith({
			toolId: 'read',
			args: { path: 'a.txt' },
			signal,
		});
	});
});
