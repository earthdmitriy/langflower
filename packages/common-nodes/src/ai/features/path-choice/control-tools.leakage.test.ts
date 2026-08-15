import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	REVIEW_ACCEPT_TOOL,
	REVIEW_CHAT_TOOLS,
	REVIEW_FEEDBACK_TOOL,
} from './control-tools.js';

const pathChoiceDir = path.dirname(fileURLToPath(import.meta.url));
const aiDir = path.resolve(pathChoiceDir, '..');
const allowedDirs = [
	pathChoiceDir,
	path.join(aiDir, 'review'),
	path.join(aiDir, 'critique'),
];

const collectTsFiles = (dir: string): readonly string[] => {
	const entries = readdirSync(dir);
	const files: string[] = [];

	for (const entry of entries) {
		const full = path.join(dir, entry);
		const st = statSync(full);

		if (st.isDirectory()) {
			files.push(...collectTsFiles(full));
			continue;
		}

		if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
			files.push(full);
		}
	}

	return files;
};

const isAllowed = (file: string): boolean =>
	allowedDirs.some((dir) => file === dir || file.startsWith(dir + path.sep));

describe('path-choice control tools non-leakage', () => {
	it('defines accept and feedback as path-choice chat tools', () => {
		expect(REVIEW_ACCEPT_TOOL).toBe('accept');
		expect(REVIEW_FEEDBACK_TOOL).toBe('feedback');
		expect(
			REVIEW_CHAT_TOOLS.map((tool) => tool.function.name).sort(),
		).toEqual(['accept', 'feedback']);
	});

	it('is only imported from path-choice, review, and critique', () => {
		const markers = [
			'path-choice/control-tools',
			'REVIEW_CHAT_TOOLS',
			'findControlToolCall',
		];
		const offenders: string[] = [];

		for (const file of collectTsFiles(aiDir)) {
			if (isAllowed(file)) {
				continue;
			}

			const text = readFileSync(file, 'utf8');

			if (markers.some((marker) => text.includes(marker))) {
				offenders.push(path.relative(aiDir, file));
			}
		}

		expect(offenders).toEqual([]);
	});
});
