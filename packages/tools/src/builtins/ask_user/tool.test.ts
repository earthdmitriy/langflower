import { describe, expect, it } from 'vitest';
import { askUserTool } from './tool.js';

const baseCtx = {
	projectRoot: '/tmp',
	denyPaths: [],
	allowedRoots: [],
	bashEnabled: false,
};

describe('ask_user builtin', () => {
	it('returns the host answer', async () => {
		const text = await askUserTool.invoke(
			{
				...baseCtx,
				askUser: async (request) => {
					expect(request.question).toBe('What is the goal?');
					return 'Ship ask_user';
				},
			},
			{ question: '  What is the goal?  ' },
		);

		expect(text).toBe('Ship ask_user');
	});

	it('fails closed without a host hook', async () => {
		await expect(
			askUserTool.invoke(baseCtx, { question: 'Need a name?' }),
		).rejects.toThrow(/live HITL host/i);
	});

	it('requires a non-empty question', async () => {
		await expect(
			askUserTool.invoke(
				{
					...baseCtx,
					askUser: async () => 'nope',
				},
				{ question: '   ' },
			),
		).rejects.toThrow(/question/i);
	});

	it('aborts when the invoke signal fires', async () => {
		const controller = new AbortController();
		let asked = false;
		const pending = askUserTool.invoke(
			{
				...baseCtx,
				signal: controller.signal,
				askUser: () => {
					asked = true;
					return new Promise<string>(() => undefined);
				},
			},
			{ question: 'Still there?' },
		);

		await Promise.resolve();
		expect(asked).toBe(true);
		controller.abort();
		await expect(pending).rejects.toThrow(/aborted/i);
	});
});
