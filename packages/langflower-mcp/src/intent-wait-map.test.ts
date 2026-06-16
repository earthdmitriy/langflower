import { describe, expect, it } from 'vitest';
import {
	listIntentWaitOverrideKeys,
	resolveWaitEvent,
} from './intent-wait-map.js';
import { listActionIntents } from './list-action-intents.js';

describe('resolveWaitEvent', () => {
	it('requires an explicit override for every allowlisted action intent', () => {
		const intents = listActionIntents();
		const overrideKeys = new Set(listIntentWaitOverrideKeys());

		expect([...intents].sort()).toEqual([...overrideKeys].sort());

		for (const intent of intents) {
			expect(() => resolveWaitEvent(intent)).not.toThrow();
		}
	});

	it('maps known overrides', () => {
		expect(resolveWaitEvent('workflow.load.requested')).toBe(
			'workflow.current.snapshot',
		);
		expect(resolveWaitEvent('runner.start.requested')).toBe(
			'runner.started',
		);
		expect(resolveWaitEvent('runner.permission.reply')).toBeNull();
	});

	it('throws when an intent has no override', () => {
		expect(() => resolveWaitEvent('editor.addNode.requested')).toThrow(
			/Missing INTENT_WAIT_OVERRIDES/,
		);
	});
});
