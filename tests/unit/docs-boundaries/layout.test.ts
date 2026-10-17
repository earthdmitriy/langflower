import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formatReminder } from './reminder.js';
import {
	checkFrontmatter,
	checkPlacement,
	checkReachable,
	checkSize,
} from './rules/layout.js';

const ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../..',
);

describe('docs layout on the repo', () => {
	it('placement', () => {
		expect(checkPlacement(ROOT).map(formatReminder)).toEqual([]);
	});

	it('frontmatter', () => {
		expect(checkFrontmatter(ROOT).map(formatReminder)).toEqual([]);
	});

	it('reachable', () => {
		expect(checkReachable(ROOT).map(formatReminder)).toEqual([]);
	});

	it('size', () => {
		expect(checkSize(ROOT).map(formatReminder)).toEqual([]);
	});
});
