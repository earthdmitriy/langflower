import { describe, expect, it } from 'vitest';
import { settingsAsideForEffectiveConfig } from './build-session-bootstrap.js';

describe('settingsAsideForEffectiveConfig', () => {
	it('opens Global Settings when effective provider map is empty', () => {
		expect(
			settingsAsideForEffectiveConfig(
				{},
				{
					open: false,
					scope: 'project',
				},
			),
		).toEqual({ open: true, scope: 'global' });
	});

	it('opens Global Settings when provider is undefined', () => {
		expect(
			settingsAsideForEffectiveConfig(undefined, {
				open: false,
				scope: 'project',
			}),
		).toEqual({ open: true, scope: 'global' });
	});

	it('keeps current settings when at least one provider exists', () => {
		expect(
			settingsAsideForEffectiveConfig(
				{ lmstudio: { name: 'LM Studio' } },
				{ open: false, scope: 'project' },
			),
		).toEqual({ open: false, scope: 'project' });
	});
});
