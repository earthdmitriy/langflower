import { describe, expect, it } from 'vitest';
import {
	createExecutionFeedHarness,
	inputEvent,
	outputEvent,
	paletteDefinition,
	readItems,
} from './execution-feed.service.fixture';

const chat = paletteDefinition('chat', [
	{ portId: 'message', direction: 'in', hitl: true },
	{ portId: 'result', direction: 'out', role: 'result' },
]);

describe('user-turn feed projection', () => {
	it('keeps file refs on the user row and markdown on result', async () => {
		const harness = createExecutionFeedHarness();
		harness.seedCatalog({ chat: 'chat' }, [chat]);
		const payload = {
			text: 'what is this',
			files: [
				{
					fileId: 'img-1',
					name: 'photo.png',
					mimeType: 'image/png',
					size: 4,
					data: 'base64-pixels',
				},
				{
					fileId: 'wav-1',
					name: 'voice.wav',
					mimeType: 'audio/wav',
					size: 8,
				},
				{
					fileId: 'pdf-1',
					name: 'page.pdf',
					mimeType: 'application/pdf',
					size: 12,
				},
			],
		};

		harness.raw.runnerPort$.next(
			outputEvent(
				'chat',
				'result',
				'![photo](https://example.test/a.png)',
			),
		);
		harness.raw.runnerPort$.next(inputEvent('chat', 'message', payload));

		const visit = harness.latestNodes()[0];
		expect(visit).toBeDefined();
		if (visit === undefined) {
			return;
		}

		const [reply] = await readItems(visit, 'message');
		const [result] = await readItems(visit, 'result');
		expect(reply?.value).toBe('what is this');
		expect(reply?.meta).toMatchObject({
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
		});
		expect(JSON.stringify(reply)).not.toContain('base64');
		expect(result?.meta).toMatchObject({ presentation: 'result' });
		expect(result?.value).toBe('![photo](https://example.test/a.png)');
		expect(reply?.meta.presentation).toBe('hitl-user');
		expect(reply?.meta.presentation).not.toBe('result');
	});
});
