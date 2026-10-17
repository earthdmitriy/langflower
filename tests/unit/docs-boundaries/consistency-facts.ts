/**
 * Consistency fact pairs (epic 50 §3.D).
 * Extractors live in rules/consistency.ts. Each reminder names reminderDoc,
 * which is a path that exists today.
 */

export type ConsistencyFactId =
	| 'consistency:package-dag'
	| 'consistency:package-list'
	| 'consistency:package-agents'
	| 'consistency:node-docs'
	| 'consistency:agent-run-commands'
	| 'consistency:adr-refs'
	| 'consistency:skeleton-skills'
	| 'consistency:epic-index';

export type ConsistencyFact = {
	readonly id: ConsistencyFactId;
	readonly codeHint: string;
	readonly docHint: string;
	readonly reminderDoc: string;
};

export const CONSISTENCY_FACTS: readonly ConsistencyFact[] = [
	{
		id: 'consistency:package-dag',
		codeHint:
			'ALLOWED_WORKSPACE_DEPS in tests/unit/package-boundaries/allowed-edges.ts',
		docHint:
			'When the package DAG changes, update the dependency sketch in docs/architecture/NAVIGATION.md.',
		reminderDoc: 'docs/architecture/NAVIGATION.md',
	},
	{
		id: 'consistency:package-list',
		codeHint:
			'PACKAGE_DIRS in tests/unit/package-boundaries/allowed-edges.ts',
		docHint:
			'When a workspace package is added or removed, update the package table in docs/architecture/NAVIGATION.md and the router docs/README.md.',
		reminderDoc: 'docs/architecture/NAVIGATION.md',
	},
	{
		id: 'consistency:package-agents',
		codeHint: 'each packages/<dir>/ workspace package directory',
		docHint:
			'Each workspace package needs packages/<dir>/AGENTS.md, and that file must be registered in docs/README.md.',
		reminderDoc: 'docs/README.md',
	},
	{
		id: 'consistency:node-docs',
		codeHint:
			'each node directory under packages/common-nodes/src/**/nodes',
		docHint:
			'Each node directory needs a NODE.md. The folder convention is docs/reference/NODES.md (will be docs/reference/NODES.md).',
		reminderDoc: 'docs/reference/NODES.md',
	},
	{
		id: 'consistency:agent-run-commands',
		codeHint: 'keys of COMMANDS in build/tools/agent-run.mjs',
		docHint:
			'When an agent-run command key is added, mention it in .cursor/skills/langflower-build/commands.md.',
		reminderDoc: '.cursor/skills/langflower-build/commands.md',
	},
	{
		id: 'consistency:adr-refs',
		codeHint: 'adr/NNN-*.md ids',
		docHint:
			'Every ADR-NNN mention must resolve to an ADR file. Until the split, that record is docs/adr/README.md (will be one file per ADR under docs/adr/).',
		reminderDoc: 'docs/adr/README.md',
	},
	{
		id: 'consistency:skeleton-skills',
		codeHint: 'directories in packages/server/skeleton/skills/',
		docHint:
			'When a skeleton skill directory is added, list it in packages/server/skeleton/skills/langflower-helper/layout.md and in the router docs/README.md.',
		reminderDoc:
			'packages/server/skeleton/skills/langflower-helper/layout.md',
	},
	{
		id: 'consistency:epic-index',
		codeHint: 'files in _work/TODO/EPICS and _archive/DONE/EPICS',
		docHint:
			'Each epic file must be listed in its README index. Those indexes are docs/_work/TODO/EPICS/README.md and docs/_archive/DONE/EPICS/README.md.',
		reminderDoc: 'docs/_work/TODO/EPICS/README.md',
	},
];
