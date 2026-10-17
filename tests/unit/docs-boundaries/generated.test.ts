import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formatReminder } from './reminder.js';
import { checkGenerated, checkSync } from './rules/generated.js';

const ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../..',
);

describe('generated docs on the repo', () => {
	it('generated', () => {
		expect(checkGenerated(ROOT).map(formatReminder)).toEqual([]);
	});

	it('sync', () => {
		expect(checkSync(ROOT).map(formatReminder)).toEqual([]);
	});
});
