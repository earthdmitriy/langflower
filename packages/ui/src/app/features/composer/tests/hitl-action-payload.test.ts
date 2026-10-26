import type { HitlUploadedFile } from '@langflower/node-sdk';
import { STEER_CONTROL_PORT_ID } from '@langflower/node-sdk/llm';
import { formatAskUserReplyText } from '@langflower/shared/langflower-config/format-ask-user-reply-text';
import type { RunnerAskUserReplyPayload } from '@langflower/shared/types/langflower-config';
import { describe, expect, it } from 'vitest';
import type { HitlControlProjection } from '../../../services/hitl-projection';
import {
	resolveComposerActionPayload,
	resolveComposerEnterPayload,
	steerResumePayload,
	wrapSteerHitlPayload,
} from '../hitl-action-payload';

const textareaEntry = (
	portId: string,
	role?: 'chat-start' | 'reply',
	acceptsFiles = false,
): HitlControlProjection => ({
	nodeId: 'n1',
	portId,
	config: {
		title: portId,
		kind: 'textarea',
		...(role !== undefined ? { role } : {}),
	},
	...(acceptsFiles ? { acceptsFiles } : {}),
});

const buttonEntry = (portId: string, label: string): HitlControlProjection => ({
	nodeId: 'n1',
	portId,
	config: {
		title: label,
		kind: 'button',
		label,
		payload: { decision: label },
	},
});

describe('hitl-action-payload', () => {
	it('requires non-empty draft for textarea Send/Start', () => {
		expect(
			resolveComposerActionPayload(
				textareaEntry('msg', 'chat-start'),
				'',
			),
		).toEqual({ ok: false });
		expect(
			resolveComposerActionPayload(
				textareaEntry('msg', 'chat-start'),
				'  go  ',
			),
		).toEqual({ ok: true, payload: 'go' });
	});

	it('activates button payloads without a draft', () => {
		expect(
			resolveComposerActionPayload(buttonEntry('approve', 'Approve'), ''),
		).toEqual({ ok: true, payload: { decision: 'Approve' } });
	});

	it('keeps Send inert on an empty steer draft', () => {
		const steer = textareaEntry(STEER_CONTROL_PORT_ID);
		expect(resolveComposerActionPayload(steer, '')).toEqual({ ok: false });
		expect(resolveComposerActionPayload(steer, '  ')).toEqual({
			ok: false,
		});
		expect(resolveComposerActionPayload(steer, ' fix this ')).toEqual({
			ok: true,
			payload: { kind: 'steer', text: 'fix this', files: [] },
		});
	});

	it('sends steer text with files and rejects empty text', () => {
		const steer = textareaEntry(STEER_CONTROL_PORT_ID);
		const files: readonly HitlUploadedFile[] = [
			{
				fileId: 'img-1',
				name: 'photo.png',
				mimeType: 'image/png',
				size: 4,
			},
		];
		expect(
			resolveComposerActionPayload(steer, ' what is this ', { files }),
		).toEqual({
			ok: true,
			payload: { kind: 'steer', text: 'what is this', files },
		});
		expect(resolveComposerActionPayload(steer, '  ', { files })).toEqual({
			ok: false,
		});
		expect(resolveComposerActionPayload(steer, '', { files })).toEqual({
			ok: false,
		});
	});

	it('Enter on an empty steer draft continues without text', () => {
		const steer = textareaEntry(STEER_CONTROL_PORT_ID);
		const files: readonly HitlUploadedFile[] = [
			{
				fileId: 'img-1',
				name: 'photo.png',
				mimeType: 'image/png',
				size: 4,
			},
		];
		expect(resolveComposerEnterPayload(steer, '')).toEqual({
			ok: true,
			payload: steerResumePayload(),
		});
		expect(
			resolveComposerEnterPayload(steer, '', {
				pendingAttachmentCount: 1,
			}),
		).toEqual({ ok: false });
		expect(resolveComposerEnterPayload(steer, '', { files })).toEqual({
			ok: false,
		});
		expect(resolveComposerEnterPayload(steer, 'nudge')).toEqual({
			ok: true,
			payload: { kind: 'steer', text: 'nudge', files: [] },
		});
	});

	const png: readonly HitlUploadedFile[] = [
		{ fileId: 'img-1', name: 'photo.png', mimeType: 'image/png', size: 4 },
	];

	it('sends { text, files } for any textarea that takes files', () => {
		for (const entry of [
			textareaEntry('message', 'chat-start', true),
			textareaEntry('message', 'reply', true),
			textareaEntry('requestChanges', undefined, true),
		]) {
			expect(
				resolveComposerActionPayload(entry, ' what is this ', {
					files: png,
				}),
			).toEqual({
				ok: true,
				payload: { text: 'what is this', files: png },
			});
			expect(resolveComposerActionPayload(entry, 'hello')).toEqual({
				ok: true,
				payload: { text: 'hello', files: [] },
			});
			expect(
				resolveComposerActionPayload(entry, '  ', { files: png }),
			).toEqual({ ok: false });
		}
	});

	it('keeps a textarea that does not take files a plain string', () => {
		expect(
			resolveComposerActionPayload(
				textareaEntry('requestChanges'),
				'please change',
				{ files: png },
			),
		).toEqual({ ok: true, payload: 'please change' });
	});

	it('leaves buttons alone and wraps Steer files', () => {
		expect(
			resolveComposerActionPayload(
				buttonEntry('approve', 'Approve'),
				'',
				{ files: png },
			),
		).toEqual({ ok: true, payload: { decision: 'Approve' } });
		expect(
			resolveComposerActionPayload(
				textareaEntry(STEER_CONTROL_PORT_ID, undefined, true),
				'nudge',
				{ files: png },
			),
		).toEqual({
			ok: true,
			payload: { kind: 'steer', text: 'nudge', files: png },
		});
	});

	it('ask_user resolution is one string and has no file field', () => {
		const text = formatAskUserReplyText({
			questions: [],
			selections: new Map(),
			freeform: '  because  ',
		});
		const reply: RunnerAskUserReplyPayload = {
			runId: 'run-1',
			askId: 'ask-1',
			text,
		};
		expect(reply).toEqual({
			runId: 'run-1',
			askId: 'ask-1',
			text: 'because',
		});
		expect(reply).not.toHaveProperty('files');
	});

	it('does not rewrite a resume payload into steer', () => {
		const resume = steerResumePayload();
		expect(wrapSteerHitlPayload(STEER_CONTROL_PORT_ID, resume)).toEqual({
			kind: 'resume',
		});
		expect(wrapSteerHitlPayload(STEER_CONTROL_PORT_ID, 'fix')).toEqual({
			kind: 'steer',
			text: 'fix',
			files: [],
		});
		expect(wrapSteerHitlPayload('message', 'go')).toBe('go');
	});
});
