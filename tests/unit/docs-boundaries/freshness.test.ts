import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkFreshness, freshnessMessages } from './rules/freshness.js';

const ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../..',
);

describe('docs freshness on the repo', () => {
	it('freshness', () => {
		const outcome = freshnessMessages(
			checkFreshness(ROOT),
			process.env.CI === 'true',
		);
		if (outcome.notice !== null) {
			// stderr so the non-TTY vitest reporter keeps the skip notice.
			process.stderr.write(`NOTICE ${outcome.notice}\n`);
		}
		expect(outcome.messages).toEqual([]);
	});
});
