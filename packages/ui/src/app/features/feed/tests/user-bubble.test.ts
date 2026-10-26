import type { RunId } from '@langflower/runtime';
import { describe, expect, it } from 'vitest';
import type { PortStreamItem } from '../../feed-folding/types';
import { projectUserBubble } from '../user-bubble';

const item = (
	meta: PortStreamItem['meta'],
	value: unknown,
): PortStreamItem => ({
	source: 'port',
	runId: 'run-1' as RunId,
	state: 'value',
	value,
	meta,
	seq: 0,
});

describe('projectUserBubble', () => {
	it('uses GET for an image and name plus MIME for audio and PDF', () => {
		const bubble = projectUserBubble(
			item(
				{
					presentation: 'hitl-user',
					origin: 'hitl-reply',
					files: [
						{
							fileId: 'img-1',
							name: 'photo.png',
							mimeType: 'image/png',
						},
						{
							fileId: 'wav-1',
							name: 'voice.wav',
							mimeType: 'audio/wav',
						},
						{
							fileId: 'pdf-1',
							name: 'page.pdf',
							mimeType: 'application/pdf',
						},
					],
				},
				'what is this',
			),
		);

		expect(bubble).toEqual({
			presentation: 'hitl-user',
			text: 'what is this',
			files: [
				{
					kind: 'image',
					fileId: 'img-1',
					name: 'photo.png',
					mimeType: 'image/png',
					src: '/api/session-uploads/img-1',
				},
				{
					kind: 'file',
					fileId: 'wav-1',
					name: 'voice.wav',
					mimeType: 'audio/wav',
				},
				{
					kind: 'file',
					fileId: 'pdf-1',
					name: 'page.pdf',
					mimeType: 'application/pdf',
				},
			],
		});
		expect(bubble?.files.some((file) => file.kind === 'image')).toBe(true);
		expect(bubble?.presentation).not.toBe('result');
	});

	it('shows a steer image the same way as a composer user bubble', () => {
		const bubble = projectUserBubble(
			item(
				{
					presentation: 'hitl-user',
					origin: 'steer',
					files: [
						{
							fileId: 'img-1',
							name: 'photo.png',
							mimeType: 'image/png',
						},
					],
				},
				'what is this',
			),
		);

		expect(bubble).toEqual({
			presentation: 'hitl-user',
			text: 'what is this',
			files: [
				{
					kind: 'image',
					fileId: 'img-1',
					name: 'photo.png',
					mimeType: 'image/png',
					src: '/api/session-uploads/img-1',
				},
			],
		});
		expect(bubble?.presentation).not.toBe('result');
	});

	it('leaves ask_user as text with no files', () => {
		const bubble = projectUserBubble(
			item(
				{
					presentation: 'ask-user-reply',
					askId: 'ask-1',
					authority: 'server',
				},
				'Langflower',
			),
		);

		expect(bubble).toEqual({
			presentation: 'ask-user-reply',
			text: 'Langflower',
			files: [],
		});
	});

	it('does not treat a markdown result as a person bubble', () => {
		expect(
			projectUserBubble(
				item(
					{ presentation: 'result' },
					'![photo](https://example.test/a.png)',
				),
			),
		).toBeUndefined();
	});

	it('shows files on an ask_user reply bubble', () => {
		const bubble = projectUserBubble(
			item(
				{
					presentation: 'ask-user-reply',
					askId: 'ask-1',
					authority: 'server',
					files: [
						{
							fileId: 'img-1',
							name: 'photo.png',
							mimeType: 'image/png',
						},
					],
				},
				'this one',
			),
		);

		expect(bubble?.text).toBe('this one');
		expect(bubble?.files).toEqual([
			{
				kind: 'image',
				fileId: 'img-1',
				name: 'photo.png',
				mimeType: 'image/png',
				src: '/api/session-uploads/img-1',
			},
		]);
	});
});
