/**
 * Canonical package DAG from docs/PRINCIPLES.md / docs/NAVIGATION.md.
 * Keys are packages/<dir> folder names. Values are allowed @langflower/*
 * dependency package names (npm name without scope for cli is not used).
 */
export type PackageDir =
	| 'runtime'
	| 'websocket-bridge'
	| 'node-sdk'
	| 'compiler'
	| 'tools'
	| 'shared'
	| 'common-nodes'
	| 'server'
	| 'ui'
	| 'eval'
	| 'langflower-mcp'
	| 'cli';

export type WorkspacePackageName =
	| '@langflower/runtime'
	| '@langflower/websocket-bridge'
	| '@langflower/node-sdk'
	| '@langflower/compiler'
	| '@langflower/tools'
	| '@langflower/shared'
	| '@langflower/common-nodes'
	| '@langflower/server'
	| '@langflower/ui'
	| '@langflower/eval'
	| '@langflower/mcp'
	| '@langflower/cli';

export const PACKAGE_DIRS: readonly PackageDir[] = [
	'runtime',
	'websocket-bridge',
	'node-sdk',
	'compiler',
	'tools',
	'shared',
	'common-nodes',
	'server',
	'ui',
	'eval',
	'langflower-mcp',
	'cli',
] as const;

/** npm package name for each packages/<dir>. */
export const PACKAGE_NPM_NAME: Readonly<Record<PackageDir, string>> = {
	runtime: '@langflower/runtime',
	'websocket-bridge': '@langflower/websocket-bridge',
	'node-sdk': '@langflower/node-sdk',
	compiler: '@langflower/compiler',
	tools: '@langflower/tools',
	shared: '@langflower/shared',
	'common-nodes': '@langflower/common-nodes',
	server: '@langflower/server',
	ui: '@langflower/ui',
	eval: '@langflower/eval',
	'langflower-mcp': '@langflower/mcp',
	cli: '@langflower/cli',
};

/**
 * Allowed workspace dependencies per consumer package dir.
 * Encodes: dependency → consumer from PRINCIPLES / NAVIGATION.
 */
export const ALLOWED_WORKSPACE_DEPS: Readonly<
	Record<PackageDir, readonly WorkspacePackageName[]>
> = {
	runtime: [],
	'websocket-bridge': [],
	'node-sdk': ['@langflower/runtime'],
	compiler: ['@langflower/node-sdk'],
	tools: ['@langflower/node-sdk'],
	shared: [
		'@langflower/runtime',
		'@langflower/node-sdk',
		'@langflower/websocket-bridge',
	],
	'common-nodes': [
		'@langflower/node-sdk',
		'@langflower/runtime',
		'@langflower/tools',
	],
	server: [
		'@langflower/runtime',
		'@langflower/node-sdk',
		'@langflower/compiler',
		'@langflower/tools',
		'@langflower/common-nodes',
		'@langflower/shared',
		'@langflower/websocket-bridge',
	],
	ui: [
		'@langflower/common-nodes',
		'@langflower/node-sdk',
		'@langflower/runtime',
		'@langflower/shared',
		'@langflower/websocket-bridge',
	],
	eval: ['@langflower/tools'],
	'langflower-mcp': ['@langflower/shared', '@langflower/websocket-bridge'],
	cli: ['@langflower/server', '@langflower/shared', '@langflower/eval'],
};

export const toWorkspacePackageName = (
	specifier: string,
): WorkspacePackageName | null => {
	if (!specifier.startsWith('@langflower/')) {
		return null;
	}
	const rest = specifier.slice('@langflower/'.length);
	const root = rest.split('/')[0] ?? '';
	const name = `@langflower/${root}` as WorkspacePackageName;
	const known = new Set<string>(Object.values(PACKAGE_NPM_NAME));
	return known.has(name) ? name : null;
};
