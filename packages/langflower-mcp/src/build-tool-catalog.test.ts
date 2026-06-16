import { describe, expect, it } from 'vitest';
import {
	assertToolMetaCoverage,
	buildToolCatalog,
} from './build-tool-catalog.js';
import { listActionIntents } from './list-action-intents.js';
import { sanitizeToolName } from './sanitize-tool-name.js';

describe('buildToolCatalog', () => {
	it('covers every allowlisted action intent with codegen meta', () => {
		expect(() => assertToolMetaCoverage()).not.toThrow();
	});

	it('exposes workflow/runner tools and excludes editor', () => {
		const catalog = buildToolCatalog();
		const names = catalog.map((tool) => tool.name);

		expect(names).toContain('ensure_connected');
		expect(names).toContain('wait_event');
		expect(names).toContain(sanitizeToolName('workflow.load.requested'));
		expect(names).toContain(sanitizeToolName('runner.start.requested'));
		expect(names.some((name) => name.startsWith('editor_'))).toBe(false);

		const actions = listActionIntents();
		expect(actions.some((intent) => intent.startsWith('editor.'))).toBe(
			false,
		);
		expect(actions).toContain('workflow.load.requested');
		expect(actions).toContain('runner.permission.reply');
	});
});
