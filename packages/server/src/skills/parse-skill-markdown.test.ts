import { describe, expect, it } from 'vitest';
import {
	MAX_SKILL_DESCRIPTION_LENGTH,
	parseSkillMarkdown,
} from './parse-skill-markdown.js';

describe('parseSkillMarkdown', () => {
	it('prefers frontmatter name and description', () => {
		const parsed = parseSkillMarkdown(`---
name: Plan role
description: Break work into steps
---
# Plan

Use this skill when planning.
`);

		expect(parsed.name).toBe('Plan role');
		expect(parsed.description).toBe('Break work into steps');
		expect(parsed.body).toContain('# Plan');
	});

	it('truncates fallback description to 280 chars', () => {
		const longLine = 'x'.repeat(400);
		const parsed = parseSkillMarkdown(`# Heading\n\n${longLine}`);

		expect(parsed.description?.length).toBeLessThanOrEqual(
			MAX_SKILL_DESCRIPTION_LENGTH,
		);
		expect(parsed.description?.length).toBeLessThan(longLine.length);
	});

	it('uses first prose line when frontmatter omits description', () => {
		const parsed = parseSkillMarkdown(`---
name: Coder
---
First prose line for the catalog.
`);

		expect(parsed.name).toBe('Coder');
		expect(parsed.description).toBe('First prose line for the catalog.');
	});
});
