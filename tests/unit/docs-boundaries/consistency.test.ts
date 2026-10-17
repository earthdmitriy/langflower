import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formatReminder } from './reminder.js';
import { CONSISTENCY_RULES } from './rules/consistency.js';

const ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../..',
);

describe('docs consistency on the repo', () => {
	for (const [ruleId, rule] of Object.entries(CONSISTENCY_RULES)) {
		it(ruleId, () => {
			expect(rule(ROOT).map(formatReminder)).toEqual([]);
		});
	}
});
