import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formatReminder } from './reminder.js';
import {
	checkCodeRefs,
	checkLinkDirection,
	checkLinks,
} from './rules/links.js';

const ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../..',
);

describe('docs links on the repo', () => {
	it('links', () => {
		expect(checkLinks(ROOT).map(formatReminder)).toEqual([]);
	});

	it('code-refs', () => {
		expect(checkCodeRefs(ROOT).map(formatReminder)).toEqual([]);
	});

	it('link-direction', () => {
		expect(checkLinkDirection(ROOT).map(formatReminder)).toEqual([]);
	});
});
