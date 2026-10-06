import { STEER_CONTROL_PORT_ID } from '@langflower/node-sdk/llm';
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
): HitlControlProjection => ({
	nodeId: 'n1',
	portId,
	config:
		role === undefined
			? { title: portId, kind: 'textarea' }
			: { title: portId, kind: 'textarea', role },
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
			payload: 'fix this',
		});
	});

	it('Enter on an empty steer draft continues without text', () => {
		const steer = textareaEntry(STEER_CONTROL_PORT_ID);
		expect(resolveComposerEnterPayload(steer, '')).toEqual({
			ok: true,
			payload: steerResumePayload(),
		});
		expect(resolveComposerEnterPayload(steer, 'nudge')).toEqual({
			ok: true,
			payload: 'nudge',
		});
	});

	it('does not rewrite a resume payload into steer', () => {
		const resume = steerResumePayload();
		expect(wrapSteerHitlPayload(STEER_CONTROL_PORT_ID, resume)).toEqual({
			kind: 'resume',
		});
		expect(wrapSteerHitlPayload(STEER_CONTROL_PORT_ID, 'fix')).toEqual({
			kind: 'steer',
			text: 'fix',
		});
		expect(wrapSteerHitlPayload('message', 'go')).toBe('go');
	});
});
