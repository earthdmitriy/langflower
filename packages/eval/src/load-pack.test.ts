import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadEvalPack } from './load-pack.js';

const writePack = async (
	packDir: string,
	pack: Record<string, unknown>,
): Promise<void> => {
	await fs.writeFile(
		path.join(packDir, 'pack.json'),
		JSON.stringify(pack),
		'utf8',
	);
};

describe('loadEvalPack', () => {
	let packDir: string;

	beforeEach(async () => {
		packDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lf-eval-pack-'));
	});

	afterEach(async () => {
		await fs.rm(packDir, { recursive: true, force: true });
	});

	it('rejects empty expected (includes would always match otherwise)', async () => {
		await writePack(packDir, {
			id: 'bad-expected',
			threshold: 1,
			scorer: 'includes',
			cases: [{ id: 'c1', input: 'hi', expected: '' }],
		});
		await expect(loadEvalPack(packDir)).rejects.toThrow(
			/non-empty expected/,
		);
	});

	it('rejects missing expected', async () => {
		await writePack(packDir, {
			id: 'missing-expected',
			threshold: 1,
			scorer: 'exact',
			cases: [{ id: 'c1', input: 'hi' }],
		});
		await expect(loadEvalPack(packDir)).rejects.toThrow(
			/non-empty expected/,
		);
	});

	it('rejects whitespace-only expected', async () => {
		await writePack(packDir, {
			id: 'ws-expected',
			threshold: 1,
			scorer: 'exact',
			cases: [{ id: 'c1', input: 'hi', expected: '   ' }],
		});
		await expect(loadEvalPack(packDir)).rejects.toThrow(
			/non-empty expected/,
		);
	});

	it('rejects duplicate case ids', async () => {
		await writePack(packDir, {
			id: 'dup-ids',
			threshold: 1,
			scorer: 'exact',
			cases: [
				{ id: 'same', input: 'a', expected: 'a' },
				{ id: 'same', input: 'b', expected: 'b' },
			],
		});
		await expect(loadEvalPack(packDir)).rejects.toThrow(
			/duplicate case id "same"/,
		);
	});
});
