import { describe, expect, it } from 'vitest';
import { resolveComposerFooterMode } from '../composer-footer-mode';

describe('composer-footer-mode (epic 35)', () => {
	it('working mode when running with no HITL — Pause chrome in working footer', () => {
		expect(
			resolveComposerFooterMode({
				hasPermissionAsk: false,
				isRunning: true,
				hitlTabCount: 0,
			}),
		).toBe('working');
	});

	it('hitl mode while running with awaiting gates — Pause may still show via button', () => {
		expect(
			resolveComposerFooterMode({
				hasPermissionAsk: false,
				isRunning: true,
				hitlTabCount: 1,
			}),
		).toBe('hitl');
	});

	it('permission ask wins over hitl/working', () => {
		expect(
			resolveComposerFooterMode({
				hasPermissionAsk: true,
				isRunning: true,
				hitlTabCount: 2,
			}),
		).toBe('permission');
	});

	it('idleRun when not running and no HITL', () => {
		expect(
			resolveComposerFooterMode({
				hasPermissionAsk: false,
				isRunning: false,
				hitlTabCount: 0,
			}),
		).toBe('idleRun');
	});
});
