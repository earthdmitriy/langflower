#!/usr/bin/env node
/**
 * Remove orphan exports reported by knip, scoped to package names.
 *
 * Usage: node build/fix-package-orphans.mjs node-sdk shared common-nodes
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targetPackages = new Set(process.argv.slice(2));

if (targetPackages.size === 0) {
	console.error('Usage: node build/fix-package-orphans.mjs <package>...');
	process.exit(1);
}

function runKnipJson() {
	return new Promise((resolve, reject) => {
		const child = spawn(
			process.platform === 'win32' ? 'npx.cmd' : 'npx',
			['knip', '--reporter', 'json', '--include', 'exports,types'],
			{
				cwd: ROOT,
				shell: true,
				stdio: ['ignore', 'pipe', 'pipe'],
			},
		);

		let stdout = '';
		child.stdout.on('data', (chunk) => {
			stdout += chunk.toString();
		});
		child.on('error', reject);
		child.on('close', () => resolve(stdout));
	});
}

function getPkg(filePath) {
	const match = filePath.replace(/\\/g, '/').match(/packages\/([^/]+)\//);
	return match?.[1];
}

function removeExportFromFile(filePath, exportName) {
	const absolutePath = path.resolve(ROOT, filePath);
	if (!fs.existsSync(absolutePath)) {
		return false;
	}

	const content = fs.readFileSync(absolutePath, 'utf-8');
	const lines = content.split('\n');
	let removed = false;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

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
					} else {
						const before = line.substring(0, line.indexOf('{'));
						const after = line.substring(line.indexOf('}') + 1);
						lines[i] = `${before}{ ${names.join(', ')} }${after}`;
					}
					removed = true;
					break;
				}
			}
		}

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
	}

	return removed;
}

const stdout = await runKnipJson();
const report = JSON.parse(stdout);
const items = [];

for (const issue of report.issues ?? []) {
	for (const item of issue.exports ?? []) {
		items.push({ file: issue.file, name: item.name });
	}
	for (const item of issue.types ?? []) {
		items.push({ file: issue.file, name: item.name });
	}
}

const scoped = items.filter((item) => {
	const pkg = getPkg(item.file);
	return pkg !== undefined && targetPackages.has(pkg);
});

let removed = 0;
for (const item of scoped) {
	if (removeExportFromFile(item.file, item.name)) {
		removed += 1;
	}
}

console.log(
	`Removed ${removed}/${scoped.length} orphan export(s) in ${[...targetPackages].join(', ')}`,
);
