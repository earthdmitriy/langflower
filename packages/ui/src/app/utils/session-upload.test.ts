import type { HitlUploadedFile } from '@langflower/node-sdk';
import { describe, expect, it, vi } from 'vitest';
import {
	acceptUploadFiles,
	appendAcceptedUploads,
	clipboardUploadFiles,
	dragCarriesFiles,
	dropUploadFiles,
	postSessionUpload,
	SESSION_UPLOAD_NAME_HEADER,
	SESSION_UPLOAD_PATH,
	stageComposerUploads,
} from './session-upload';

const uploaded = (
	fileId: string,
	name: string,
	mimeType: string,
): HitlUploadedFile => ({
	fileId,
	name,
	mimeType,
	size: name.length,
});

describe('acceptUploadFiles', () => {
	it('drops video, text, and an empty file.type before the draft', () => {
		const draft = [{ type: 'image/png', name: 'keep.png' }];
		const picked = [
			{ type: 'video/mp4', name: 'clip.mp4' },
			{ type: 'text/plain', name: 'notes.txt' },
			{ type: '', name: 'no-mime.bin' },
			{ type: 'application/pdf', name: 'page.pdf' },
		];

		expect(acceptUploadFiles(picked).map((file) => file.name)).toEqual([
			'page.pdf',
		]);
		expect(
			appendAcceptedUploads(draft, picked).map((file) => file.name),
		).toEqual(['keep.png', 'page.pdf']);
	});

	it('does not POST a file outside the allowlist', async () => {
		const post = vi.fn();
		const staged = await stageComposerUploads(
			[
				{ type: 'video/mp4', name: 'clip.mp4' },
				{ type: 'text/plain', name: 'notes.txt' },
				{ type: '', name: 'no-mime.bin' },
			],
			post,
		);

		expect(post).not.toHaveBeenCalled();
		expect(staged).toEqual({ ok: true, files: [] });
	});

	it('builds a user turn from image, pdf, and wav POST responses', async () => {
		const responses = [
			uploaded('img-1', 'photo.png', 'image/png'),
			uploaded('pdf-1', 'page.pdf', 'application/pdf'),
			uploaded('wav-1', 'voice.wav', 'audio/wav'),
		];
		const post = vi.fn(
			async (file: { readonly name: string; readonly type: string }) => {
				const match = responses.find(
					(entry) => entry.name === file.name,
				);
				if (match === undefined) {
					return { ok: false as const, message: 'missing' };
				}
				return { ok: true as const, file: match };
			},
		);

		const staged = await stageComposerUploads(
			[
				{ type: 'image/png', name: 'photo.png' },
				{ type: 'video/mp4', name: 'clip.mp4' },
				{ type: 'application/pdf', name: 'page.pdf' },
				{ type: 'audio/wav', name: 'voice.wav' },
			],
			post,
		);

		expect(post.mock.calls.map((call) => call[0]?.type)).toEqual([
			'image/png',
			'application/pdf',
			'audio/wav',
		]);
		expect(staged).toEqual({
			ok: true,
			files: responses,
		});
		if (!staged.ok) {
			return;
		}
		expect({ text: 'what is this', files: staged.files }).toEqual({
			text: 'what is this',
			files: responses,
		});
	});
});

describe('postSessionUpload', () => {
	it('POSTs raw bytes with Content-Type and the file-name header', async () => {
		const fetchMock = vi.fn(
			async () =>
				new Response(
					JSON.stringify(uploaded('id-1', 'photo.png', 'image/png')),
					{
						status: 200,
						headers: { 'Content-Type': 'application/json' },
					},
				),
		);
		vi.stubGlobal('fetch', fetchMock);

		const body = new Blob([Uint8Array.from([1, 2, 3])], {
			type: 'image/png',
		});
		const result = await postSessionUpload({
			type: 'image/png',
			name: 'photo.png',
			body,
		});

		expect(result).toEqual({
			ok: true,
			file: uploaded('id-1', 'photo.png', 'image/png'),
		});
		expect(fetchMock).toHaveBeenCalledWith(SESSION_UPLOAD_PATH, {
			method: 'POST',
			headers: {
				'Content-Type': 'image/png',
				[SESSION_UPLOAD_NAME_HEADER]: 'photo.png',
			},
			body,
		});
		vi.unstubAllGlobals();
	});
});

describe('clipboardUploadFiles', () => {
	const item = (file: File | null, kind = 'file') => ({
		kind,
		getAsFile: () => file,
	});
	const at = new Date(2026, 9, 25, 9, 5, 7);

	it('renames a generic screenshot and keeps the type', () => {
		const shot = new File(['x'], 'image.png', { type: 'image/png' });
		const [pasted] = clipboardUploadFiles({ items: [item(shot)] }, at);
		expect(pasted?.name).toBe('pasted-090507-1.png');
		expect(pasted?.type).toBe('image/png');
	});

	it('keeps a real file name and drops text, video, and empty MIME', () => {
		const real = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
		const video = new File(['x'], 'clip.mp4', { type: 'video/mp4' });
		const bare = new File(['x'], 'blob', { type: '' });
		const files = clipboardUploadFiles(
			{
				items: [
					item(null, 'string'),
					item(real),
					item(video),
					item(bare),
				],
			},
			at,
		);
		expect(files.map((file) => file.name)).toEqual(['photo.jpg']);
	});

	it('falls back to files and tolerates a missing clipboard', () => {
		const pdf = new File(['x'], 'a.pdf', { type: 'application/pdf' });
		expect(clipboardUploadFiles({ files: [pdf] })).toEqual([pdf]);
		expect(clipboardUploadFiles(null)).toEqual([]);
	});
});

describe('dropUploadFiles and dragCarriesFiles', () => {
	it('keeps dropped names and filters the allowlist', () => {
		const png = new File(['x'], 'image.png', { type: 'image/png' });
		const txt = new File(['x'], 'n.txt', { type: 'text/plain' });
		expect(dropUploadFiles({ files: [png, txt] })).toEqual([png]);
	});

	it('detects a file drag', () => {
		expect(dragCarriesFiles(['text/plain', 'Files'])).toBe(true);
		expect(dragCarriesFiles(['text/plain'])).toBe(false);
		expect(dragCarriesFiles(undefined)).toBe(false);
	});
});
