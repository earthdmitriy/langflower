#!/usr/bin/env node
/**
 * Detect orphan exports using knip.
 *
 * Usage:
 *   node build/check-exports.mjs           # report only (exit 1 if orphans found)
 *   node build/check-exports.mjs --fix     # auto-remove orphan exports
 *   node build/check-exports.mjs --json    # machine-readable JSON output
 *   node build/check-exports.mjs --barrel  # only check barrel (index.ts) exports
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMain } from './lib/run-step.mjs';
import { log } from './lib/logger.mjs';
import { BuildError } from './lib/format-error.mjs';
import { ROOT } from './lib/paths.mjs';

const args = process.argv.slice(2);
const fixMode = args.includes('--fix');
const jsonMode = args.includes('--json');
const barrelOnly = args.includes('--barrel');

function resolveKnipBin() {
	const localBin = path.join(ROOT, 'node_modules', '.bin', 'knip');
	const isWin = process.platform === 'win32';

	// Try local first
	if (fs.existsSync(isWin ? `${localBin}.cmd` : localBin)) {
		return isWin ? `${localBin}.cmd` : localBin;
	}

	// Fallback to global install
	const globalPath = path.join(
		process.env.APPDATA ||
			path.join(require('os').homedir(), 'AppData', 'Roaming'),
		'npm',
		'node_modules',
		'knip',
		'bin',
		'knip.js',
	);
	if (fs.existsSync(globalPath)) {
		return `node ${globalPath}`;
	}

	return null;
}

function runKnip() {
	return new Promise((resolve, reject) => {
		const binPath = resolveKnipBin();
		if (!binPath) {
			reject(new Error('knip not found. Run: npm install -g knip'));
			return;
		}

		const isNode = binPath.startsWith('node ');
		const cmd = isNode ? 'node' : binPath;
		const args = isNode
			? [
					binPath.replace('node ', ''),
					'--reporter',
					'json',
					'--include',
					'exports,types',
				]
			: ['--reporter', 'json', '--include', 'exports,types'];

		const child = spawn(cmd, args, {
			cwd: ROOT,
			shell: true,
			stdio: ['ignore', 'pipe', 'pipe'],
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

function parseKnipOutput(stdout) {
	try {
		return JSON.parse(stdout);
	} catch {
		return null;
	}
}

function extractUnusedExports(report) {
	if (!report || !report.issues) return [];

	const results = [];

	for (const issue of report.issues) {
		if (issue.exports && issue.exports.length > 0) {
			for (const item of issue.exports) {
				results.push({
					file: issue.file,
					name: item.name,
					line: item.line,
					col: item.col,
					type: item.type || 'export',
				});
			}
		}
	}

	return results;
}

function extractUnusedTypes(report) {
	if (!report || !report.issues) return [];

	const results = [];

	for (const issue of report.issues) {
		if (issue.types && issue.types.length > 0) {
			for (const item of issue.types) {
				results.push({
					file: issue.file,
					name: item.name,
					line: item.line,
					col: item.col,
					type: 'type',
				});
			}
		}
	}

	return results;
}

function isPackageFile(filePath) {
	const normalized = filePath.replace(/\\/g, '/');
	return normalized.startsWith('packages/');
}

function isBarrelFile(filePath) {
	const normalized = filePath.replace(/\\/g, '/');
	return normalized.endsWith('/src/index.ts');
}

/**
 * Known false positives: exports that are re-exported through intermediate barrels.
 * knip doesn't track re-exports through non-entry barrels.
 */
const KNOWN_RE_EXPORTS = new Set([
	'packages/common-nodes/src/lib/json/set-fields.ts::mergeFieldMaps',
	'packages/common-nodes/src/lib/logic/compare.ts::COMPARE_OPS',
	'packages/ui/src/app/features/sidebar/port-value-formatters/index.ts::getPortValueFormatter',
	'packages/ui/src/app/features/sidebar/port-value-formatters/index.ts::formatPortValue',
]);

function isKnownReExport(item) {
	const normalized = item.file.replace(/\\/g, '/');
	return KNOWN_RE_EXPORTS.has(`${normalized}::${item.name}`);
}

function getPkg(filePath) {
	const normalized = filePath.replace(/\\/g, '/');
	const match = normalized.match(/packages\/([^/]+)\//);
	return match ? match[1] : 'root';
}

function groupByPackage(items) {
	const groups = {};

	for (const item of items) {
		const pkg = getPkg(item.file);
		if (!groups[pkg]) groups[pkg] = [];
		groups[pkg].push(item);
	}

	return groups;
}

function removeExportFromFile(filePath, exportName) {
	const absolutePath = path.resolve(ROOT, filePath);

	if (!fs.existsSync(absolutePath)) {
		log.warn(`File not found: ${filePath}`);
		return false;
	}

	const content = fs.readFileSync(absolutePath, 'utf-8');
	const lines = content.split('\n');

	let removed = false;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		// Match: export { ... } from '...'  (re-export)
		const reExportMatch = line.match(
			/^(\s*export\s*\{[^}]*\})\s*from\s*['"][^'"]+['"]\s*;?\s*$/,
		);
		if (reExportMatch) {
			const inner = line.match(/\{([^}]+)\}/)?.[1];
			if (inner) {
				const names = inner.split(',').map((n) =>
					n
						.trim()
						.split(/\s+as\s+/)[0]
						.trim(),
				);
				const idx = names.indexOf(exportName);
				if (idx !== -1) {
					names.splice(idx, 1);
					if (names.length === 0) {
						lines.splice(i, 1);
						removed = true;
						break;
					} else {
						const before = line.substring(0, line.indexOf('{'));
						const after = line.substring(line.indexOf('}') + 1);
						lines[i] = `${before}{ ${names.join(', ')} }${after}`;
						removed = true;
						break;
					}
				}
			}
		}

		// Match: export { ... } (single line, no from)
		const blockExportMatch = line.match(
			/^(\s*export\s*\{[^}]+)\}\s*;?\s*$/,
		);
		if (blockExportMatch) {
			const inner = line.match(/\{([^}]+)\}/)?.[1];
			if (inner) {
				const names = inner.split(',').map((n) =>
					n
						.trim()
						.split(/\s+as\s+/)[0]
						.trim(),
				);
				const idx = names.indexOf(exportName);
				if (idx !== -1) {
					names.splice(idx, 1);
					if (names.length === 0) {
						lines.splice(i, 1);
						removed = true;
						break;
					} else {
						const before = line.substring(0, line.indexOf('{'));
						const after = line.substring(line.indexOf('}') + 1);
						lines[i] = `${before}{ ${names.join(', ')} }${after}`;
						removed = true;
						break;
					}
				}
			}
		}

		// Match: export function/const/class/type/interface NAME
		const declMatch = line.match(
			/^(\s*export\s+(?:async\s+)?(?:function|const|let|var|class|type|interface)\s+)(\w+)/,
		);
		if (declMatch && declMatch[2] === exportName) {
			lines[i] = line.replace(/^(\s*)export\s+/, '$1');
			removed = true;
			break;
		}
	}

	if (removed) {
		fs.writeFileSync(absolutePath, lines.join('\n'), 'utf-8');
		return true;
	}

	log.warn(`Could not find export "${exportName}" in ${filePath}`);
	return false;
}

await runMain(async () => {
	log.title('Langflower — check exports (knip)');

	log.step('Running knip...');
	const { stdout, stderr, exitCode } = await runKnip();

	if (exitCode !== 0 && exitCode !== 1) {
		log.error('knip failed to run');
		if (stderr) log.info(stderr);
		throw new BuildError('check-exports', 'knip execution failed', {
			exitCode,
		});
	}

	const report = parseKnipOutput(stdout);

	if (!report) {
		log.error('Failed to parse knip output');
		if (stdout) log.info(stdout.substring(0, 500));
		throw new BuildError('check-exports', 'knip output parse failed', {});
	}

	let unusedExports = extractUnusedExports(report);
	let unusedTypes = extractUnusedTypes(report);

	// Filter to package files only
	unusedExports = unusedExports.filter((e) => isPackageFile(e.file));
	unusedTypes = unusedTypes.filter((t) => isPackageFile(t.file));

	// Filter known false positives (re-exports through intermediate barrels)
	unusedExports = unusedExports.filter((e) => !isKnownReExport(e));

	// Optionally filter to barrel files only
	if (barrelOnly) {
		unusedExports = unusedExports.filter((e) => isBarrelFile(e.file));
		unusedTypes = unusedTypes.filter((t) => isBarrelFile(t.file));
	}

	const all = [...unusedExports, ...unusedTypes];
	const formatted = {
		total: all.length,
		byPackage: groupByPackage(all),
		all,
	};

	if (jsonMode) {
		process.stdout.write(JSON.stringify(formatted, null, 2) + '\n');
		return;
	}

	if (formatted.total === 0) {
		log.success('No orphan exports found');
		return;
	}

	// Display report
	log.blank();
	log.error(`Found ${formatted.total} orphan export(s):`);
	log.blank();

	for (const [pkg, items] of Object.entries(formatted.byPackage)) {
		log.info(`packages/${pkg}/ (${items.length} orphans)`);
		for (const item of items) {
			const relPath = item.file
				.replace(/\\/g, '/')
				.replace(/.*packages\//, 'packages/');
			console.log(
				`  ${relPath}:${item.line || '?'} — ${item.type} "${item.name}"`,
			);
		}
	}

	log.blank();

	if (fixMode) {
		log.step('Removing orphan exports...');
		let removed = 0;
		let failed = 0;

		for (const item of formatted.all) {
			const success = removeExportFromFile(item.file, item.name);
			if (success) {
				removed++;
			} else {
				failed++;
			}
		}

		log.success(`Removed ${removed} orphan export(s)`);
		if (failed > 0) {
			log.warn(`${failed} export(s) could not be removed automatically`);
		}
	} else {
		log.info('Run with --fix to auto-remove orphan exports');
		throw new BuildError(
			'check-exports',
			`${formatted.total} orphan export(s) found`,
			{ exitCode: 1 },
		);
	}
});
