import { describe, expect, it } from 'vitest';
import { applySettingsRequested } from './wire-editor-handlers.js';

describe('applySettingsRequested', () => {
	it('opens with required scope', () => {
		expect(
			applySettingsRequested(
				{ open: false, scope: 'project' },
				{ open: true, scope: 'global' },
			),
		).toEqual({ open: true, scope: 'global' });
	});

	it('rejects open without scope', () => {
		expect(
			applySettingsRequested(
				{ open: false, scope: 'project' },
				{ open: true },
			),
		).toBeNull();
	});

	it('closes while keeping prior scope', () => {
		expect(
			applySettingsRequested(
				{ open: true, scope: 'global' },
				{ open: false },
			),
		).toEqual({ open: false, scope: 'global' });
	});
});
