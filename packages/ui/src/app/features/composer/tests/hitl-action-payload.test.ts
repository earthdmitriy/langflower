import { describe, expect, it } from 'vitest';
import { resolveComposerActionPayload } from '../hitl-action-payload';
import type { HitlControlProjection } from '../../../services/hitl-projection';

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
});
