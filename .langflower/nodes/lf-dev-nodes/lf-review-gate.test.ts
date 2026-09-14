import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNodeHarness } from '@langflower/node-sdk/testing';
import lfReviewGate from './lf-review-gate.ts';

vi.mock('node:child_process', () => ({
	spawn: vi.fn(),
	execFile: vi.fn(),
}));

const mockSpawn = vi.mocked(spawn);

const emitSpawn = (exitCode: number, stdout = '', stderr = '') => {
	const child = new EventEmitter() as ReturnType<typeof spawn>;
	const out = new EventEmitter();
	const err = new EventEmitter();
	Object.assign(child, { stdout: out, stderr: err });
	queueMicrotask(() => {
		if (stdout.length > 0) {
			out.emit('data', stdout);
		}

		if (stderr.length > 0) {
			err.emit('data', stderr);
		}

		child.emit('close', exitCode);
	});
	return child;
};

const spawnCommands = (): readonly string[] =>
	mockSpawn.mock.calls.map((call) => String(call[0]));

describe('lf-review-gate', () => {
	afterEach(() => {
		mockSpawn.mockReset();
	});

	it('declares ok as trigger passthrough without a live inferTypeFrom stream', () => {
		const okOut = lfReviewGate.outputsConfigs.find(
			(port) => port.portId === 'ok',
		);
		expect(okOut).toMatchObject({
			fromInput: 'trigger',
			wireType: 'dynamic',
		});
		expect(okOut).not.toHaveProperty('inferTypeFrom');
		expect(() => JSON.stringify(okOut)).not.toThrow();
		expect(JSON.stringify(okOut)).not.toContain('currentObservers');
	});

	it('formats even when prettier exits non-zero, then runs typecheck and test', async () => {
		mockSpawn
			.mockImplementationOnce(() =>
				emitSpawn(1, '', 'packages/foo.ts format check failed'),
			)
			.mockImplementationOnce(() => emitSpawn(0, 'ok\n'))
			.mockImplementationOnce(() => emitSpawn(0, 'ok\n'));
		const harness = createNodeHarness(lfReviewGate, {
			projectDir: '/proj',
		});
		const ok = harness.next<unknown>('ok');
		const payload = { run: 1 };
		harness.send('trigger', payload);
		await expect(ok).resolves.toEqual(payload);
		expect(spawnCommands()).toEqual([
			'npm run format',
			'npm run typecheck',
			'npm run test',
		]);
		harness.dispose();
	});

	it('stops after typecheck failure once format passed', async () => {
		mockSpawn
			.mockImplementationOnce(() => emitSpawn(0, 'ok\n'))
			.mockImplementationOnce(() =>
				emitSpawn(1, '', 'packages/foo.ts(1,1): error TS2345: boom'),
			);
		const harness = createNodeHarness(lfReviewGate, {
			projectDir: '/proj',
		});
		const fail = harness.next<string>('fail');
		harness.send('trigger', { run: 1 });
		const detail = await fail;
		expect(detail).toContain('failed  npm_typecheck');
		expect(detail).toContain('TS2345');
		expect(spawnCommands()).toEqual([
			'npm run format',
			'npm run typecheck',
		]);
		harness.dispose();
	});

	it('passthroughs trigger on ok when all three steps pass', async () => {
		mockSpawn.mockImplementation(() => emitSpawn(0, 'ok\n'));
		const harness = createNodeHarness(lfReviewGate, {
			projectDir: '/proj',
		});
		const ok = harness.next<unknown>('ok');
		const payload = { run: 1 };
		harness.send('trigger', payload);
		await expect(ok).resolves.toEqual(payload);
		expect(spawnCommands()).toEqual([
			'npm run format',
			'npm run typecheck',
			'npm run test',
		]);
		harness.dispose();
	});
});
