/**
 * Allowlist for which `langflowerWsConfig` keys become MCP tools.
 * Editor canvas mutations stay excluded until this policy expands.
 */

export const ACTION_NAMESPACE_GLOBS = ['workflow.*', 'runner.*'] as const;

/** Client→server keys matching these globs are never exposed. */
export const ACTION_EXCLUDE_GLOBS = ['editor.*'] as const;

/**
 * Server→client events agents may wait on / read via observe tools.
 * Curated: bootstrap + workflow + runner telemetry needed for observe/run.
 */
export const OBSERVE_EVENT_KEYS = [
	'session.ready',
	'session.state.snapshot',
	'runner.snapshot',
	'executionFeed.snapshot',
	'toolConfig.snapshot',
	'workflow.list.snapshot',
	'workflow.current.snapshot',
	'workflow.currentStatus.snapshot',
	'langflower.config.snapshot',
	'palette.snapshot',
	'runner.started',
	'runner.startNode.started',
	'runner.resume.started',
	'runner.resume.failed',
	'runner.interrupted',
	'runner.port',
	'runner.done',
	'runner.permission.ask',
	'runner.checkpoints.snapshot',
	'runner.checkpointed',
] as const;

export type ObserveEventKey = (typeof OBSERVE_EVENT_KEYS)[number];
