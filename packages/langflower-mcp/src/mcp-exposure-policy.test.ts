import { langflowerWsConfig } from '@langflower/shared/langflower-bus-config.js';
import { describe, expect, it } from 'vitest';
import { listActionIntents } from './list-action-intents.js';
import { OBSERVE_EVENT_KEYS } from './mcp-exposure-policy.js';

describe('mcp-exposure-policy', () => {
	it('every OBSERVE_EVENT_KEYS member is a fromServerToClient key', () => {
		const keys = Object.keys(langflowerWsConfig.fromServerToClient);

		for (const event of OBSERVE_EVENT_KEYS) {
			expect(keys).toContain(event);
		}
	});

	it('listActionIntents stays in workflow.* / runner.* (no editor.*)', () => {
		const intents = listActionIntents();

		expect(intents.some((intent) => intent.startsWith('editor.'))).toBe(
			false,
		);
		expect(
			intents.every(
				(intent) =>
					intent.startsWith('workflow.') ||
					intent.startsWith('runner.'),
			),
		).toBe(true);
	});
});
