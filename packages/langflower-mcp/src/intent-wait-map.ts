/**
 * After an action intent, wait for this server→client event (broadcast bus).
 * Every allowlisted intent must have an explicit override (no name heuristic).
 */

const INTENT_WAIT_OVERRIDES: Readonly<Record<string, string | null>> = {
	'workflow.list.requested': 'workflow.list.snapshot',
	'workflow.load.requested': 'workflow.current.snapshot',
	'workflow.saveCurrent.requested': 'workflow.current.snapshot',
	'workflow.renameCurrent.requested': 'workflow.current.snapshot',
	'workflow.create.requested': 'workflow.current.snapshot',
	'workflow.copy.requested': 'workflow.current.snapshot',
	'workflow.delete.requested': 'workflow.list.snapshot',
	'runner.start.requested': 'runner.started',
	'runner.startNode.requested': 'runner.startNode.started',
	'runner.interrupt.requested': 'runner.interrupted',
	'runner.hitl.event': 'runner.port',
	'runner.permission.reply': null,
	'runner.executionFeed.clear.requested': 'executionFeed.snapshot',
	'runner.resume.requested': 'runner.resume.started',
	'runner.checkpoint.discard.requested': 'runner.checkpoints.snapshot',
};

export const resolveWaitEvent = (intent: string): string | null => {
	if (!Object.prototype.hasOwnProperty.call(INTENT_WAIT_OVERRIDES, intent)) {
		throw new Error(
			`Missing INTENT_WAIT_OVERRIDES entry for allowlisted intent: ${intent}`,
		);
	}

	return INTENT_WAIT_OVERRIDES[intent] ?? null;
};

/** Intents that have an explicit wait override (including fire-and-forget null). */
export const listIntentWaitOverrideKeys = (): readonly string[] =>
	Object.keys(INTENT_WAIT_OVERRIDES);
