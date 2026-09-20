import { afterEach, describe, expect, it, vi } from 'vitest';
import { sleepTool } from './tool.js';

const invoke = (
	args: Readonly<Record<string, unknown>>,
	signal?: AbortSignal,
): Promise<string> =>
	sleepTool.invoke(
		{
			projectRoot: '/tmp',
			denyPaths: [],
			allowedRoots: [],
			bashEnabled: false,
			...(signal !== undefined ? { signal } : {}),
		},
		args,
	);

describe('sleep builtin', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('sleeps the requested integer seconds', async () => {
		vi.useFakeTimers();
		const pending = invoke({ seconds: 2 });
		await vi.advanceTimersByTimeAsync(1999);
		let settled = false;
		void pending.then(() => {
			settled = true;
		});
		await Promise.resolve();
		expect(settled).toBe(false);
		await vi.advanceTimersByTimeAsync(1);
		await expect(pending).resolves.toBe('Slept 2s.');
	});

	it('rejects missing, fractional, zero, and over-cap seconds', async () => {
		await expect(invoke({})).rejects.toThrow(/integer argument/i);
		await expect(invoke({ seconds: '2' })).rejects.toThrow(
			/integer argument/i,
		);
		await expect(invoke({ seconds: 1.5 })).rejects.toThrow(
			/integer argument/i,
		);
		await expect(invoke({ seconds: 0 })).rejects.toThrow(
			/between 1 and 300/,
		);
		await expect(invoke({ seconds: 301 })).rejects.toThrow(
			/between 1 and 300/,
		);
		await expect(invoke({ seconds: -1 })).rejects.toThrow(
			/between 1 and 300/,
		);
	});

	it('aborts when the invoke signal fires', async () => {
		vi.useFakeTimers();
		const abort = new AbortController();
		const pending = invoke({ seconds: 30 }, abort.signal);
		abort.abort();
		await expect(pending).rejects.toThrow(/aborted/i);
	});
});
