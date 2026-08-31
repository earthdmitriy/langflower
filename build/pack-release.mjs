#!/usr/bin/env node
/**
 * Materialize publish-ready layout at the repo root:
 *   dist/, bin/, ui-dist/, vendor/{node-sdk,runtime,server/skeleton}/,
 *   package.json deps → file:./vendor/{node-sdk,runtime} plus hoisted
 *   registry deps (rxjs, openai, typescript, esbuild, …)
 *
 * Usage (repo root, after build-all):
 *   node build/pack-release.mjs
 *   node build/pack-release.mjs --skip-build
 *
 * Then: npm publish --access public
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ROOT } from './lib/paths.mjs';
import { log } from './lib/logger.mjs';
import { runMain } from './lib/run-step.mjs';
import { BuildError } from './lib/format-error.mjs';
import {
	assembleProduct,
	buildAllIfNeeded,
	buildPublishPackageJson,
	README_REFERENCED_DOCS,
} from './lib/stage-release.mjs';

const skipBuild = process.argv.includes('--skip-build');
const RELEASE_DIR = path.join(ROOT, '.release');
const ARTIFACTS_DIR = path.join(ROOT, 'artifacts');
const BACKUP_PKG = path.join(RELEASE_DIR, 'package.json.backup');

const runNpmJson = (args) =>
	new Promise((resolve, reject) => {
		const child = spawn('npm', args, {
			cwd: ROOT,
			env: process.env,
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
			process.stderr.write(chunk);
		});
		child.on('error', reject);
		child.on('close', (code) => {
			if (code !== 0) {
				reject(
					new Error(
						`npm ${args.join(' ')} failed (${code}): ${stderr || stdout}`,
					),
				);
				return;
			}
			resolve(stdout);
		});
	});

const parsePackJson = (packJson) => {
	const parsed = JSON.parse(packJson.trim());
	return Array.isArray(parsed) ? parsed[0] : parsed;
};

const assertPackedContents = (files) => {
	const normalized = files.map((p) => p.replace(/\\/g, '/'));
	const required = [
		{ re: /(^|\/)ui-dist\/index\.html$/, label: 'ui-dist/index.html' },
		{ re: /(^|\/)bin\/langflower\.js$/, label: 'bin/langflower.js' },
		{
			re: /(^|\/)vendor\/server\/skeleton\//,
			label: 'vendor/server/skeleton/',
		},
		{
			re: /(^|\/)vendor\/node-sdk\/package\.json$/,
			label: 'vendor/node-sdk/package.json',
		},
		{
			re: /(^|\/)vendor\/runtime\/package\.json$/,
			label: 'vendor/runtime/package.json',
		},
		{ re: /(^|\/)dist\/index\.js$/, label: 'dist/index.js' },
		{ re: /(^|\/)README\.md$/, label: 'README.md' },
		...README_REFERENCED_DOCS.map((docPath) => ({
			re: new RegExp(
				`(^|/)${docPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
			),
			label: docPath,
		})),
	];

	const missing = required.filter(
		({ re }) => !normalized.some((p) => re.test(p)),
	);

	if (missing.length > 0) {
		throw new BuildError(
			'pack-release',
			`Pack missing: ${missing.map((m) => m.label).join(', ')}`,
			{
				hint: `First paths:\n${normalized.slice(0, 40).join('\n')}`,
			},
		);
	}

	const sourcemaps = normalized.filter((p) => p.endsWith('.map'));
	if (sourcemaps.length > 0) {
		throw new BuildError(
			'pack-release',
			`Pack must not include sourcemaps (${sourcemaps.length} *.map)`,
			{
				hint: `First maps:\n${sourcemaps.slice(0, 20).join('\n')}`,
			},
		);
	}

	log.success(
		'Pack smoke: ui-dist, bin, dist, server skeleton, docs/public manuals present; no sourcemaps',
	);
};

await runMain(async () => {
	log.title('Langflower — pack-release');

	await buildAllIfNeeded({ build: !skipBuild });

	await fs.mkdir(RELEASE_DIR, { recursive: true });
	await fs.mkdir(ARTIFACTS_DIR, { recursive: true });

	const rootPkgPath = path.join(ROOT, 'package.json');
	await fs.copyFile(rootPkgPath, BACKUP_PKG);
	log.info(`Backed up package.json → ${path.relative(ROOT, BACKUP_PKG)}`);

	log.step('Assembling product at repo root');
	await assembleProduct(ROOT, { writePackageJson: false });

	const publishPkg = await buildPublishPackageJson();
	await fs.writeFile(
		rootPkgPath,
		`${JSON.stringify(publishPkg, null, '\t')}\n`,
		'utf8',
	);
	log.info(
		'Root package.json rewritten for publish (workspaces/scripts stripped)',
	);

	log.step('npm pack --dry-run (content check)');
	const dryJson = await runNpmJson(['pack', '--dry-run', '--json']);
	const dryRow = parsePackJson(dryJson);
	const filePaths = (dryRow.files ?? []).map((file) =>
		typeof file === 'string' ? file : file.path,
	);
	assertPackedContents(filePaths);

	log.step('npm pack');
	const packJson = await runNpmJson(['pack', '--json']);
	const packRow = parsePackJson(packJson);
	const filename = packRow?.filename ?? packRow?.name;

	if (typeof filename !== 'string' || filename.length === 0) {
		throw new Error(`Could not parse npm pack output:\n${packJson}`);
	}

	const tgzInRoot = path.join(ROOT, path.basename(filename));
	const artifactPath = path.join(ARTIFACTS_DIR, path.basename(filename));
	await fs.rename(tgzInRoot, artifactPath);

	log.blank();
	log.success(`Packed ${path.relative(ROOT, artifactPath)}`);
	log.info('Publish-ready. From repo root:');
	log.info('  npm publish --access public');
	log.warn(
		`After publishing, restore monorepo package.json from ${path.relative(ROOT, BACKUP_PKG)}`,
	);
	log.warn(
		'(or: git checkout -- package.json). Keep vendor/, dist/, ui-dist/ until publish finishes.',
	);
});
