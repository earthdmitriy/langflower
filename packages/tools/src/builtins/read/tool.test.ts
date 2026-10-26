import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SESSION_UPLOAD_MAX_BYTES } from '@langflower/node-sdk';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { HandlerContext, StageSessionUploadInput } from '../types.js';
import { isUnderSessionUploadCeiling, readTool } from './tool.js';

const ctxFor = (
	projectRoot: string,
	stageSessionUpload?: HandlerContext['stageSessionUpload'],
): HandlerContext => ({
	projectRoot,
	denyPaths: [],
	allowedRoots: [],
	bashEnabled: false,
	...(stageSessionUpload !== undefined ? { stageSessionUpload } : {}),
});

describe('isUnderSessionUploadCeiling', () => {
	it('refuses a declared size at the production ceiling', () => {
		expect(SESSION_UPLOAD_MAX_BYTES).toBe(50 * 1024 * 1024);
		expect(isUnderSessionUploadCeiling(SESSION_UPLOAD_MAX_BYTES)).toBe(
			false,
		);
		expect(isUnderSessionUploadCeiling(SESSION_UPLOAD_MAX_BYTES + 1)).toBe(
			false,
		);
		expect(isUnderSessionUploadCeiling(SESSION_UPLOAD_MAX_BYTES - 1)).toBe(
			true,
		);
	});
});

describe('read builtin media', () => {
	let projectRoot: string;

	beforeEach(async () => {
		projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lf-read-'));
	});

	afterEach(async () => {
		await fs.rm(projectRoot, { recursive: true, force: true });
	});

	it.each([
		['1.png', 'image/png'],
		['photo.jpg', 'image/jpeg'],
		['photo.jpeg', 'image/jpeg'],
		['anim.gif', 'image/gif'],
		['still.webp', 'image/webp'],
		['clip.wav', 'audio/wav'],
		['clip.mp3', 'audio/mpeg'],
		['page.pdf', 'application/pdf'],
	] as const)(
		'stages %s as %s and returns one line without base64',
		async (name, mimeType) => {
			const bytes = Buffer.from(`bytes-${name}`);
			await fs.writeFile(path.join(projectRoot, name), bytes);
			const seen: StageSessionUploadInput[] = [];
			const text = await readTool.invoke(
				ctxFor(projectRoot, async (input) => {
					seen.push(input);
					return {
						fileId: 'file-1',
						name: input.name,
						mimeType: input.mimeType,
						size: input.bytes.byteLength,
					};
				}),
				{ path: name },
			);

			expect(seen).toHaveLength(1);
			expect(seen[0]?.name).toBe(name);
			expect(seen[0]?.mimeType).toBe(mimeType);
			expect(Buffer.from(seen[0]?.bytes ?? [])).toEqual(bytes);
			expect(text).toBe(
				`${name} (${mimeType}, ${bytes.byteLength} bytes)`,
			);
			expect(text).not.toContain('base64');
			expect(text).not.toContain('data:');
			expect(text).not.toContain(bytes.toString('utf8'));
		},
	);

	it('fails closed for a png when no session upload hook is bound', async () => {
		await fs.writeFile(path.join(projectRoot, '1.png'), 'hello-png');
		await expect(
			readTool.invoke(ctxFor(projectRoot), { path: '1.png' }),
		).rejects.toThrow(/no session upload hook is bound/);
	});

	it('keeps a text read on UTF-8 and does not stage it', async () => {
		await fs.writeFile(path.join(projectRoot, 'notes.txt'), 'plain text');
		const seen: StageSessionUploadInput[] = [];
		const text = await readTool.invoke(
			ctxFor(projectRoot, async (input) => {
				seen.push(input);
				return {
					fileId: 'file-1',
					name: input.name,
					mimeType: input.mimeType,
					size: input.bytes.byteLength,
				};
			}),
			{ path: 'notes.txt' },
		);

		expect(seen).toEqual([]);
		expect(text).toBe('plain text');
	});

	it('keeps a video read on UTF-8 and does not stage it', async () => {
		await fs.writeFile(path.join(projectRoot, 'clip.mp4'), 'not-an-image');
		const seen: StageSessionUploadInput[] = [];
		const text = await readTool.invoke(
			ctxFor(projectRoot, async (input) => {
				seen.push(input);
				return {
					fileId: 'file-1',
					name: input.name,
					mimeType: input.mimeType,
					size: input.bytes.byteLength,
				};
			}),
			{ path: 'clip.mp4' },
		);

		expect(seen).toEqual([]);
		expect(text).toBe('not-an-image');
	});
});
