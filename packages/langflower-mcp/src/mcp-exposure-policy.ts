/**
 * Allowlist for which `langflowerWsConfig` keys become MCP tools.
 * Namespace is `workflow.*` / `workflowSession.*` / `runner.*` —
 * `editor.*` never matches. `workflow.*` does not match `workflowSession.*`
 * (`*` still requires the dot after `workflow`).
 */

export const ACTION_NAMESPACE_GLOBS = [
	'workflow.*',
	'workflowSession.*',
	'runner.*',
] as const;

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
	'workflowSession.list.snapshot',
	'workflowSession.current.snapshot',
	'workflowSession.action.failed',
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
] as const;

export type ObserveEventKey = (typeof OBSERVE_EVENT_KEYS)[number];
