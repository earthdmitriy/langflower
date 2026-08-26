/**
 * Pure footer-band mode for the composer shell (palette §8 / epic 35).
 * Keeps Stop-left / Run-right invariants testable without mounting Angular.
 * Pause may also appear in HITL footer when another feed-last agent is
 * pausable (per-node Pause — button owns its own visibility).
 */

export type ComposerFooterMode = 'permission' | 'working' | 'hitl' | 'idleRun';

export const resolveComposerFooterMode = (args: {
	readonly hasPermissionAsk: boolean;
	readonly isRunning: boolean;
	readonly hitlTabCount: number;
}): ComposerFooterMode => {
	if (args.hasPermissionAsk) {
		return 'permission';
	}
	if (args.isRunning && args.hitlTabCount === 0) {
		return 'working';
	}
	if (args.hitlTabCount > 0 || args.isRunning) {
		return 'hitl';
	}
	return 'idleRun';
};
