import type { RunId } from '@langflower/runtime';
import { describe, expect, it } from 'vitest';
import { replayPortStream } from '../../feed-folding/operators/fold-port-stream';
import type {
	PortEventFromServer,
	PortFrameMeta,
} from '../../feed-folding/types';
import { isToolCallFoldValue } from '../../feed-folding/operators/tool-log-line';
import { projectToolRowFiles, projectUserBubble } from '../user-bubble';

const run = 'run-1' as RunId;

const frame = (
	seq: number,
	value: unknown,
	meta: PortFrameMeta,
): PortEventFromServer & { readonly seq: number } => ({
	source: 'port',
	kind: 'output-emitted',
	runId: run,
	nodeId: 'agent',
	portId: 'tool',
	state: 'value',
	value,
	meta,
	seq,
});

describe('tool row media hoist', () => {
	it('shows the image url or name and does not add a human bubble', () => {
		const items = replayPortStream([
			frame(0, '→ read({"path":"1.png"})', { presentation: 'tool' }),
			frame(
				1,
				{
					text: '← read: 1.png (image/png, 4 bytes)',
					files: [
						{
							fileId: 'img-1',
							name: '1.png',
							mimeType: 'image/png',
							size: 4,
						},
					],
				},
				{ presentation: 'tool' },
			),
			frame(2, '→ read({"path":"page.pdf"})', { presentation: 'tool' }),
			frame(
				3,
				{
					text: '← read: page.pdf (application/pdf, 5 bytes)',
					files: [
						{
							fileId: 'pdf-1',
							name: 'page.pdf',
							mimeType: 'application/pdf',
							size: 5,
						},
					],
				},
				{ presentation: 'tool' },
			),
			frame(4, '→ read({"path":"clip.wav"})', { presentation: 'tool' }),
			frame(
				5,
				{
					text: '← read: clip.wav (audio/wav, 6 bytes)',
					files: [
						{
							fileId: 'wav-1',
							name: 'clip.wav',
							mimeType: 'audio/wav',
							size: 6,
						},
					],
				},
				{ presentation: 'tool' },
			),
		]);

		expect(items).toHaveLength(3);
		expect(items.every((item) => item.meta.presentation === 'tool')).toBe(
			true,
		);
		expect(items.map((item) => projectUserBubble(item))).toEqual([
			undefined,
			undefined,
			undefined,
		]);

		const views = items.map((item) =>
			isToolCallFoldValue(item.value)
				? projectToolRowFiles(item.value.files)[0]
				: undefined,
		);
		expect(views).toEqual([
			{
				kind: 'image',
				fileId: 'img-1',
				name: '1.png',
				mimeType: 'image/png',
				src: '/api/session-uploads/img-1',
			},
			{
				kind: 'file',
				fileId: 'pdf-1',
				name: 'page.pdf',
				mimeType: 'application/pdf',
			},
			{
				kind: 'file',
				fileId: 'wav-1',
				name: 'clip.wav',
				mimeType: 'audio/wav',
			},
		]);
		expect(JSON.stringify(items)).not.toContain('base64');
		expect(JSON.stringify(items)).not.toContain('hitl-user');
	});
});
