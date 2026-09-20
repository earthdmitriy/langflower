/**
 * Allowlist for which `langflowerWsConfig` keys become MCP tools.
 * Namespace is `workflow.*` / `runner.*` only — `editor.*` never matches.
 */

export const ACTION_NAMESPACE_GLOBS = ['workflow.*', 'runner.*'] as const;

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
	'workflow.load.failed',
	'workflow.currentStatus.snapshot',
	'langflower.config.snapshot',
	'palette.snapshot',
	'customPalette.snapshot',
	'langflower.models.catalog.snapshot',
	'runner.started',
	'runner.startNode.started',
	'runner.resume.started',
	'runner.resume.failed',
	'runner.interrupted',
	'runner.port',
	'runner.done',
	'runner.permission.ask',
	'runner.permission.accepted',
	'runner.askUser.ask',
	'runner.askUser.accepted',
	'runner.checkpoints.snapshot',
	'runner.checkpointed',
] as const;

export type ObserveEventKey = (typeof OBSERVE_EVENT_KEYS)[number];
