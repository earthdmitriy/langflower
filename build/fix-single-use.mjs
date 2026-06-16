#!/usr/bin/env node
/**
 * Find and optionally fix single-use exports.
 *
 * Single-use exports are exported via barrel but consumed by exactly 1 external package.
 * The fix is to move the definition to the consumer package.
 *
 * Usage:
 *   node build/fix-single-use.mjs           # report only
 *   node build/fix-single-use.mjs --fix     # auto-move single-use exports
 *   node build/fix-single-use.mjs --json    # machine-readable output
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMain } from './lib/run-step.mjs';
import { log } from './lib/logger.mjs';
import { BuildError } from './lib/format-error.mjs';
import { ROOT, PACKAGES } from './lib/paths.mjs';

const args = process.argv.slice(2);
const fixMode = args.includes('--fix');
const jsonMode = args.includes('--json');

function readFile(relPath) {
	const abs = path.resolve(ROOT, relPath);
	return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf-8') : null;
}

function writeFile(relPath, content) {
	const abs = path.resolve(ROOT, relPath);
	fs.writeFileSync(abs, content, 'utf-8');
}

/**
 * Find all imports of a specific export name across packages.
 * Returns array of { file, line, importStatement, sourcePackage }
 */
function findImportsOf(exportName, sourcePkg) {
	const results = [];

	for (const [key, pkg] of Object.entries(PACKAGES)) {
		if (key === sourcePkg) continue;

		const pkgDir = pkg.dir.replace(/\\/g, '/');
		const pkgRelative = path.relative(ROOT, pkg.dir).replace(/\\/g, '/');

		// Search for import of this name from source package
		const searchPattern = new RegExp(
			`import\\s+.*\\b${exportName}\\b.*from\\s+['"]@langflower/${sourcePkg
				.replace(/([A-Z])/g, '-$1')
				.toLowerCase()
				.replace(/^-/, '')}['"]`,
			'g',
		);

		// Also search for: import { exportName } from '@langflower/...'
		const searchPattern2 = new RegExp(
			`from\\s+['"]@langflower/[^'"]+['"]`,
			'g',
		);

		// Simple approach: grep through all .ts files in the package
		const srcDir = path.join(pkg.dir, 'src');
		if (!fs.existsSync(srcDir)) continue;

		const files = walkTsFiles(srcDir);
		for (const file of files) {
			const content = fs.readFileSync(file, 'utf-8');
			const lines = content.split('\n');

			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];

				// Check if this line imports the exportName from any @langflower package
				if (
					line.includes(exportName) &&
					line.includes('from') &&
					line.includes('@langflower/')
				) {
					// Extract the package being imported from
					const pkgMatch = line.match(
						/from\s+['"]@langflower\/([^'"]+)['"]/,
					);
					if (
						pkgMatch &&
						pkgMatch[1] ===
							sourcePkg
								.replace(/([A-Z])/g, '-$1')
								.toLowerCase()
								.replace(/^-/, '')
					) {
						const fileRel = path
							.relative(ROOT, file)
							.replace(/\\/g, '/');
						results.push({
							file: fileRel,
							line: i + 1,
							importStatement: line.trim(),
							packageName: key,
							packageDir: pkgRelative,
						});
					}
				}
			}
		}
	}

	return results;
}

function walkTsFiles(dir) {
	const results = [];
	const entries = fs.readdirSync(dir, { withFileTypes: true });

	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			results.push(...walkTsFiles(fullPath));
		} else if (
			entry.name.endsWith('.ts') &&
			!entry.name.endsWith('.test.ts') &&
			!entry.name.endsWith('.d.ts')
		) {
			results.push(fullPath);
		}
	}

	return results;
}

/**
 * Find the source definition of an export in a package.
 * Returns { file, line, definition, isReExport, reExportFrom }
 */
function findExportDefinition(exportName, pkgKey) {
	const pkg = PACKAGES[pkgKey];
	if (!pkg) return null;

	const barrelFile = path.join(pkg.dir, 'src', 'index.ts');
	const barrelContent = readFile(path.relative(ROOT, barrelFile));
	if (!barrelContent) return null;

	const lines = barrelContent.split('\n');

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		// Check for re-export: export { X } from './file.js'
		if (line.includes(exportName) && line.includes('from')) {
			const fromMatch = line.match(/from\s+['"]([^'"]+)['"]/);
			if (fromMatch) {
				const importPath = fromMatch[1];
				// Resolve the actual source file
				const sourceFile = path.resolve(
					path.dirname(barrelFile),
					importPath.replace(/\.js$/, '.ts'),
				);
				const sourceContent = readFile(path.relative(ROOT, sourceFile));
				if (sourceContent) {
					// Find the actual definition in the source file
					const def = findDefinitionInFile(
						exportName,
						sourceContent,
						path.relative(ROOT, sourceFile),
					);
					if (def) return def;
				}
			}
		}

		// Check for direct export: export function/const/class/type NAME
		const declMatch = line.match(
			/^export\s+(?:async\s+)?(?:function|const|let|var|class|type|interface)\s+(\w+)/,
		);
		if (declMatch && declMatch[1] === exportName) {
			return {
				file: path.relative(ROOT, barrelFile).replace(/\\/g, '/'),
				line: i + 1,
				definition: line,
				isReExport: false,
			};
		}
	}

	return null;
}

function findDefinitionInFile(exportName, content, filePath) {
	const lines = content.split('\n');

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		// Match: export function/const/class/type/interface NAME
		const declMatch = line.match(
			/^export\s+(?:async\s+)?(?:function|const|let|var|class|type|interface)\s+(\w+)/,
		);
		if (declMatch && declMatch[1] === exportName) {
			// Collect the full definition (for functions/classes, need to find the end)
			let endLine = i;
			const isBlock = line.includes('{') || line.includes('=>');
			if (isBlock) {
				let depth = 0;
				for (let j = i; j < lines.length; j++) {
					for (const ch of lines[j]) {
						if (ch === '{') depth++;
						if (ch === '}') depth--;
					}
					if (depth === 0 && j > i) {
						endLine = j;
						break;
					}
				}
			}

			return {
				file: filePath,
				line: i + 1,
				endLine: endLine + 1,
				definition: lines.slice(i, endLine + 1).join('\n'),
				isReExport: false,
			};
		}
	}

	return null;
}

function getPkgKey(filePath) {
	const normalized = filePath.replace(/\\/g, '/');
	const match = normalized.match(/packages\/([^/]+)\//);
	return match ? match[1] : null;
}

function getPkgName(pkgKey) {
	const mapping = {
		shared: 'shared',
		'node-sdk': 'node-sdk',
		'common-nodes': 'common-nodes',
		runtime: 'runtime',
		server: 'server',
		ui: 'ui',
		cli: 'cli',
	};
	return mapping[pkgKey] || pkgKey;
}

await runMain(async () => {
	log.title('Langflower — fix single-use exports');

	// Get all exports from knip
	log.step('Analyzing exports...');

	// We'll use a simpler approach: read each barrel file and check cross-package usage
	const allSingleUse = [];

	for (const [pkgKey, pkg] of Object.entries(PACKAGES)) {
		const barrelFile = path.join(pkg.dir, 'src', 'index.ts');
		const barrelContent = readFile(path.relative(ROOT, barrelFile));
		if (!barrelContent) continue;

		// Extract all exported names from barrel
		const exportNames = [];
		const lines = barrelContent.split('\n');

		for (const line of lines) {
			// export { name1, name2 } from '...'
			const blockMatch = line.match(/export\s*\{([^}]+)\}/);
			if (blockMatch) {
				const names = blockMatch[1].split(',').map((n) => {
					const parts = n.trim().split(/\s+as\s+/);
					return { name: parts[0].trim(), alias: parts[1]?.trim() };
				});
				exportNames.push(...names);
			}

			// export function/const/class/type/interface NAME
			const declMatch = line.match(
				/^export\s+(?:async\s+)?(?:function|const|let|var|class|type|interface)\s+(\w+)/,
			);
			if (declMatch) {
				exportNames.push({ name: declMatch[1], alias: null });
			}
		}

		// For each export, count external consumers
		for (const { name } of exportNames) {
			if (!name) continue;

			const imports = findImportsOf(name, pkgKey);
			if (imports.length === 1) {
				allSingleUse.push({
					exportName: name,
					sourcePkg: pkgKey,
					consumer: imports[0],
				});
			}
		}
	}

	if (allSingleUse.length === 0) {
		log.success('No single-use exports found');
		return;
	}

	if (jsonMode) {
		process.stdout.write(JSON.stringify(allSingleUse, null, 2) + '\n');
		return;
	}

	// Display report
	log.blank();
	log.info(`Found ${allSingleUse.length} single-use export(s):`);
	log.blank();

	for (const item of allSingleUse) {
		console.log(
			`  @langflower/${getPkgName(item.sourcePkg)}::${item.exportName}`,
		);
		console.log(
			`    → consumed by: ${item.consumer.file}:${item.consumer.line}`,
		);
	}

	log.blank();

	if (fixMode) {
		log.info('Auto-fix not yet implemented for single-use exports.');
		log.info('Manual steps:');
		console.log('  1. Copy the definition from source to consumer package');
		console.log('  2. Update the import in consumer to use local path');
		console.log('  3. Remove the export from source barrel');
	} else {
		log.info('Single-use exports should be moved to the consumer package.');
		log.info('Run with --fix for guided refactoring.');
	}
});
