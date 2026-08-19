/**
 * Repository paths and monorepo package metadata.
 * Single source of truth for build order and workspace names.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path to the repository root. */
export const ROOT = path.resolve(__dirname, '../..');

/** Workspace packages keyed by short name. */
export const PACKAGES = {
	runtime: {
		name: '@langflower/runtime',
		dir: path.join(ROOT, 'packages/runtime'),
	},
	tools: {
		name: '@langflower/tools',
		dir: path.join(ROOT, 'packages/tools'),
	},
	eval: {
		name: '@langflower/eval',
		dir: path.join(ROOT, 'packages/eval'),
	},
	nodeSdk: {
		name: '@langflower/node-sdk',
		dir: path.join(ROOT, 'packages/node-sdk'),
	},
	compiler: {
		name: '@langflower/compiler',
		dir: path.join(ROOT, 'packages/compiler'),
	},
	commonNodes: {
		name: '@langflower/common-nodes',
		dir: path.join(ROOT, 'packages/common-nodes'),
	},
	websocketBridge: {
		name: '@langflower/websocket-bridge',
		dir: path.join(ROOT, 'packages/websocket-bridge'),
	},
	shared: {
		name: '@langflower/shared',
		dir: path.join(ROOT, 'packages/shared'),
	},
	mcp: {
		name: '@langflower/mcp',
		dir: path.join(ROOT, 'packages/langflower-mcp'),
	},
	server: {
		name: '@langflower/server',
		dir: path.join(ROOT, 'packages/server'),
	},
	ui: {
		name: '@langflower/ui',
		dir: path.join(ROOT, 'packages/ui'),
	},
	cli: {
		name: '@langflower/cli',
		dir: path.join(ROOT, 'packages/cli'),
	},
};

/** Dependency-safe build order for the full pipeline. */
export const BUILD_ORDER = [
	PACKAGES.runtime,
	PACKAGES.nodeSdk,
	PACKAGES.tools,
	PACKAGES.eval,
	PACKAGES.compiler,
	PACKAGES.commonNodes,
	PACKAGES.websocketBridge,
	PACKAGES.shared,
	PACKAGES.mcp,
	PACKAGES.server,
	PACKAGES.ui,
	PACKAGES.cli,
];
