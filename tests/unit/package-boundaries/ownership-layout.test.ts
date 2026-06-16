import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { collectTsFiles, readJson } from './scan.js';

const ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../..',
);

const FORBIDDEN_SERVER_DOMAIN_DIRS = ['kb', 'crawl', 'mcp', 'llm'] as const;

const FORBIDDEN_COMMON_NODES_MCP_UTIL_PATTERNS = [
	/create-system-mcp/,
	/build-mcp-handle/,
	/format-mcp-connect-error/,
	/create-system-mcp-transports/,
] as const;

const REQUIRED_TOOLS_MCP_FILES = [
	'build-mcp-handle.ts',
	'format-mcp-connect-error.ts',
	'create-system-mcp-handles.ts',
] as const;

const REQUIRED_TOOLS_MCP_EXPORTS = [
	'./build-mcp-handle',
	'./format-mcp-connect-error',
	'./create-system-mcp-handles',
] as const;

const BARREL_ALLOWLIST = new Set([
	// CLI process entry (not a re-export aggregator barrel).
	'packages/cli/src/index.ts',
]);

type PackageJsonExports = {
	readonly exports?: Readonly<Record<string, unknown>>;
};

const relPath = (file: string): string =>
	path.relative(ROOT, file).replace(/\\/g, '/');

describe('ownership layout boundaries', () => {
	it('server has no domain ownership trees under src/{kb,crawl,mcp,llm}', () => {
		const offenders: string[] = [];
		for (const name of FORBIDDEN_SERVER_DOMAIN_DIRS) {
			const dir = path.join(ROOT, 'packages/server/src', name);
			if (existsSync(dir)) {
				offenders.push(`packages/server/src/${name}/`);
			}
		}
		expect(offenders).toEqual([]);
	});

	it('common-nodes does not own MCP util modules or export ./mcp/*', () => {
		const offenders: string[] = [];
		const srcRoot = path.join(ROOT, 'packages/common-nodes/src');
		for (const file of collectTsFiles(srcRoot)) {
			const base = path.basename(file);
			if (
				FORBIDDEN_COMMON_NODES_MCP_UTIL_PATTERNS.some((re) =>
					re.test(base),
				)
			) {
				offenders.push(`forbidden file: ${relPath(file)}`);
			}
		}

		const pkg = readJson<PackageJsonExports>(
			path.join(ROOT, 'packages/common-nodes/package.json'),
		);
		for (const key of Object.keys(pkg.exports ?? {})) {
			if (key.includes('/mcp/') || key.startsWith('./mcp')) {
				offenders.push(
					`common-nodes package.json exports ${key} (MCP utils must not be package exports)`,
				);
			}
		}

		expect(offenders).toEqual([]);
	});

	it('tools owns MCP handle / connect-error / system-pool modules and exports', () => {
		const offenders: string[] = [];
		const mcpDir = path.join(ROOT, 'packages/tools/src/mcp');
		for (const name of REQUIRED_TOOLS_MCP_FILES) {
			const full = path.join(mcpDir, name);
			if (!existsSync(full)) {
				offenders.push(`missing tools file: src/mcp/${name}`);
			}
		}

		const pkg = readJson<PackageJsonExports>(
			path.join(ROOT, 'packages/tools/package.json'),
		);
		const exports = pkg.exports ?? {};
		for (const key of REQUIRED_TOOLS_MCP_EXPORTS) {
			if (!(key in exports)) {
				offenders.push(`missing tools package.json export: ${key}`);
			}
		}

		expect(offenders).toEqual([]);
	});

	it('server seeds system MCP from tools, not common-nodes', () => {
		const file = path.join(
			ROOT,
			'packages/server/src/bridge/build-execution-context.ts',
		);
		const text = readFileSync(file, 'utf8');
		const offenders: string[] = [];

		if (
			!text.includes("from '@langflower/tools/create-system-mcp-handles'")
		) {
			offenders.push(
				'build-execution-context.ts must import create-system-mcp-handles from @langflower/tools',
			);
		}
		if (
			/from\s+['"]@langflower\/common-nodes[^'"]*(?:mcp|create-system|build-mcp|format-mcp)[^'"]*['"]/.test(
				text,
			)
		) {
			offenders.push(
				'build-execution-context.ts must not import MCP utils from @langflower/common-nodes',
			);
		}

		expect(offenders).toEqual([]);
	});

	it('packages/*/src has no index.ts barrels (except CLI entry allowlist)', () => {
		const offenders: string[] = [];
		const packagesRoot = path.join(ROOT, 'packages');
		// Walk each package src for index.ts
		const packageDirs = [
			'runtime',
			'websocket-bridge',
			'node-sdk',
			'tools',
			'shared',
			'common-nodes',
			'server',
			'ui',
			'eval',
			'langflower-mcp',
			'cli',
		] as const;

		for (const dir of packageDirs) {
			const srcRoot = path.join(packagesRoot, dir, 'src');
			for (const file of collectTsFiles(srcRoot)) {
				if (path.basename(file) !== 'index.ts') {
					continue;
				}
				const rel = relPath(file);
				if (!BARREL_ALLOWLIST.has(rel)) {
					offenders.push(rel);
				}
			}
		}

		expect(offenders).toEqual([]);
	});

	it('vitest aliases must not point at deleted common-nodes MCP util paths', () => {
		const configPath = path.join(ROOT, 'vitest.config.mjs');
		const text = readFileSync(configPath, 'utf8');
		const offenders: string[] = [];
		const staleMarkers = [
			'common-nodes/mcp/create-system-mcp-transports',
			'common-nodes/src/mcp/create-system-mcp-transports',
			'common-nodes/mcp/build-mcp-handle',
			'common-nodes/mcp/format-mcp-connect-error',
			'common-nodes/mcp/create-system-mcp-handles',
		];

		for (const marker of staleMarkers) {
			if (text.includes(marker)) {
				offenders.push(`vitest.config.mjs still references ${marker}`);
			}
		}

		expect(offenders).toEqual([]);
	});
});
