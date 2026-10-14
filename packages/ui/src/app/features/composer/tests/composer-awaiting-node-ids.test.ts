import { describe, expect, it } from 'vitest';
import {
	composerAwaitingNodeIds,
	showSessionConversationReset,
} from '../composer-awaiting-node-ids';

describe('composerAwaitingNodeIds', () => {
	it('shows only the idle chat prompt when nothing is awaiting', () => {
		expect(composerAwaitingNodeIds(new Set(), ['chat'])).toEqual(['chat']);
	});

	it('hides the idle chat prompt while a gate is awaiting', () => {
		expect(composerAwaitingNodeIds(new Set(['review']), ['chat'])).toEqual([
			'review',
		]);
	});

	it('keeps every awaiting gate and still hides chat entry', () => {
		expect(
			composerAwaitingNodeIds(new Set(['review', 'steer']), ['chat']),
		).toEqual(['review', 'steer']);
	});
});

describe('showSessionConversationReset', () => {
	it('shows reset for an idle restored gate', () => {
		expect(showSessionConversationReset(false, 1)).toBe(true);
	});

	it('hides reset while the run is live and when nothing is awaiting', () => {
		expect(showSessionConversationReset(true, 1)).toBe(false);
		expect(showSessionConversationReset(false, 0)).toBe(false);
	});
});
