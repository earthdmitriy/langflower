/**
 * Shared knip runner + dead-code extraction for Langflower build scripts.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './paths.mjs';

/** Orphan exports / unused exported types (verify gate). */
export const KNIP_INCLUDE_EXPORTS = 'exports,types';

/** Unused files, exports, and types (dead-code report). */
export const KNIP_INCLUDE_DEAD_CODE = 'exports,types,files';

/**
 * Exports re-exported through non-entry barrels — knip misses the chain.
 * Key: `packages/.../file.ts::symbolName`
 */
export const KNOWN_RE_EXPORTS = new Set([
	'packages/common-nodes/src/lib/json/set-fields.ts::mergeFieldMaps',
	'packages/common-nodes/src/lib/logic/compare.ts::COMPARE_OPS',
	'packages/ui/src/app/features/sidebar/port-value-formatters/index.ts::getPortValueFormatter',
	'packages/ui/src/app/features/sidebar/port-value-formatters/index.ts::formatPortValue',
]);

export function resolveKnipBin() {
	const localBin = path.join(ROOT, 'node_modules', 'knip', 'bin', 'knip.js');
	if (fs.existsSync(localBin)) {
		return localBin;
	}

	const shim = path.join(ROOT, 'node_modules', '.bin', 'knip');
	const isWin = process.platform === 'win32';
	if (fs.existsSync(isWin ? `${shim}.cmd` : shim)) {
		return isWin ? `${shim}.cmd` : shim;
	}

	return null;
}

export function normalizeRepoPath(filePath) {
	return filePath.replace(/\\/g, '/');
}

export function isPackageFile(filePath) {
	return normalizeRepoPath(filePath).startsWith('packages/');
}

export function isKnownReExport(item) {
	const normalized = normalizeRepoPath(item.file);
	return KNOWN_RE_EXPORTS.has(`${normalized}::${item.name}`);
}

/**
 * @param {{ include?: string }} [options]
 */
export function runKnip(options = {}) {
	const { include = KNIP_INCLUDE_DEAD_CODE } = options;

	return new Promise((resolve, reject) => {
		const binPath = resolveKnipBin();
		if (!binPath) {
			reject(new Error('knip not found. Run: npm install'));
			return;
		}

		const isCmdShim = binPath.endsWith('.cmd');
		const cmd = isCmdShim ? binPath : process.execPath;
		const args = isCmdShim
			? ['--reporter', 'json', '--include', include]
			: [binPath, '--reporter', 'json', '--include', include];

		const child = spawn(cmd, args, {
			cwd: ROOT,
			shell: isCmdShim,
			stdio: ['ignore', 'pipe', 'pipe'],
			env: process.env,
		});

		let stdout = '';
		let stderr = '';

		child.stdout.on('data', (chunk) => {
			stdout += chunk.toString();
		});

		child.stderr.on('data', (chunk) => {
			stderr += chunk.toString();
		});

		child.on('error', reject);

		child.on('close', (code) => {
			resolve({ stdout, stderr, exitCode: code });
		});
	});
}

export function parseKnipReport(stdout) {
	try {
		return JSON.parse(stdout);
	} catch {
		return null;
	}
}

function relPackagePath(filePath) {
	return normalizeRepoPath(filePath).replace(/^.*?(packages\/)/, '$1');
}

/**
 * @param {unknown} report
 * @param {{
 *   scope?: 'packages' | 'repo',
 *   kinds?: Set<string>,
 *   skipKnownReExports?: boolean,
 * }} [options]
 */
export function extractDeadCodeItems(report, options = {}) {
	const {
		scope = 'packages',
		kinds = new Set(['file', 'export', 'type']),
		skipKnownReExports = true,
	} = options;

	if (!report || !report.issues) {
		return [];
	}

	const items = [];

	for (const issue of report.issues) {
		const file = normalizeRepoPath(issue.file);

		if (scope === 'packages' && !isPackageFile(file)) {
			continue;
		}

		if (kinds.has('file') && issue.files?.length) {
			for (const entry of issue.files) {
				const deadFile = normalizeRepoPath(entry.name ?? file);
				if (scope === 'packages' && !isPackageFile(deadFile)) {
					continue;
				}

				items.push({
					kind: 'file',
					file: deadFile,
					name: null,
					line: null,
					col: null,
				});
			}
		}

		if (kinds.has('export') && issue.exports?.length) {
			for (const entry of issue.exports) {
				const item = {
					kind: 'export',
					file,
					name: entry.name,
					line: entry.line ?? null,
					col: entry.col ?? null,
					symbolType: entry.type ?? 'export',
				};

				if (skipKnownReExports && isKnownReExport(item)) {
					continue;
				}

				items.push(item);
			}
		}

		if (kinds.has('type') && issue.types?.length) {
			for (const entry of issue.types) {
				items.push({
					kind: 'type',
					file,
					name: entry.name,
					line: entry.line ?? null,
					col: entry.col ?? null,
					symbolType: entry.type ?? 'type',
				});
			}
		}
	}

	items.sort((a, b) => {
		const fileCmp = relPackagePath(a.file).localeCompare(
			relPackagePath(b.file),
		);
		if (fileCmp !== 0) {
			return fileCmp;
		}

		const kindOrder = { file: 0, export: 1, type: 2 };
		const kindCmp = kindOrder[a.kind] - kindOrder[b.kind];
		if (kindCmp !== 0) {
			return kindCmp;
		}

		return (a.line ?? 0) - (b.line ?? 0);
	});

	return items;
}

export function summarizeDeadCode(items) {
	const byKind = { file: 0, export: 0, type: 0 };
	const byPackage = {};

	for (const item of items) {
		byKind[item.kind] = (byKind[item.kind] ?? 0) + 1;

		const match = normalizeRepoPath(item.file).match(/packages\/([^/]+)\//);
		const pkg = match ? match[1] : 'root';
		if (!byPackage[pkg]) {
			byPackage[pkg] = [];
		}
		byPackage[pkg].push(item);
	}

	return { total: items.length, byKind, byPackage, items };
}

export function formatDeadCodeLine(item) {
	const relPath = relPackagePath(item.file);

	if (item.kind === 'file') {
		return `[file] ${relPath}`;
	}

	const location = item.line ?? '?';
	return `[${item.kind}] ${relPath}:${location} — ${item.name}`;
}
