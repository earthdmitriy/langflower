import fs from 'node:fs/promises';
import path from 'node:path';
import type { DiscoveredPack } from './compile-types.js';

const EXPORT_DEFAULT_RE = /(^|\n)\s*export\s+default\b/;

const isSkippedDir = (name: string): boolean =>
	name === 'node_modules' || name === 'dist' || name.startsWith('.');

const isEntryCandidate = (name: string): boolean => {
	if (name.endsWith('.d.ts') || name.endsWith('.test.ts')) {
		return false;
	}

	return name.endsWith('.ts') || name.endsWith('.tsx');
};

const walkTsFiles = async (dir: string): Promise<readonly string[]> => {
	const entries = await fs.readdir(dir, { withFileTypes: true });
	const files: string[] = [];

	for (const entry of entries) {
		const full = path.join(dir, entry.name);

		if (entry.isDirectory()) {
			if (isSkippedDir(entry.name)) {
				continue;
			}

			files.push(...(await walkTsFiles(full)));
			continue;
		}

		if (entry.isFile() && isEntryCandidate(entry.name)) {
			files.push(full);
		}
	}

	return files;
};

/** All pack `.ts` / `.tsx` except tests and `.d.ts` (helpers + entries). */
export const listPackTsFiles = walkTsFiles;

const hasExportDefault = async (filePath: string): Promise<boolean> => {
	const source = await fs.readFile(filePath, 'utf8');

	return EXPORT_DEFAULT_RE.test(source);
};

const readPackageName = async (
	packDir: string,
	folderName: string,
): Promise<string> => {
	const packageJsonPath = path.join(packDir, 'package.json');

	try {
		const raw = await fs.readFile(packageJsonPath, 'utf8');
		const parsed: unknown = JSON.parse(raw);

		if (
			typeof parsed === 'object' &&
			parsed !== null &&
			'name' in parsed &&
			typeof parsed.name === 'string' &&
			parsed.name.length > 0
		) {
			return parsed.name;
		}
	} catch {
		// optional package.json
	}

	return folderName;
};

/**
 * Each subdirectory of `.langflower/nodes/` is a pack (ignore `node_modules`,
 * cache, and dotfiles at the nodes root).
 */
export const discoverPacks = async (
	projectDir: string,
): Promise<readonly DiscoveredPack[]> => {
	const nodesDir = path.join(projectDir, '.langflower', 'nodes');

	let rootEntries;

	try {
		rootEntries = await fs.readdir(nodesDir, { withFileTypes: true });
	} catch (error) {
		if (
			typeof error === 'object' &&
			error !== null &&
			'code' in error &&
			error.code === 'ENOENT'
		) {
			return [];
		}

		throw error;
	}

	const packs: DiscoveredPack[] = [];

	for (const entry of rootEntries) {
		if (!entry.isDirectory()) {
			continue;
		}

		if (isSkippedDir(entry.name) || entry.name === 'node_modules') {
			continue;
		}

		const packDir = path.join(nodesDir, entry.name);
		const candidates = await walkTsFiles(packDir);
		const entries: string[] = [];

		for (const filePath of candidates) {
			if (await hasExportDefault(filePath)) {
				entries.push(filePath);
			}
		}

		packs.push({
			packageName: await readPackageName(packDir, entry.name),
			packDir,
			entries: entries.sort(),
		});
	}

	return packs.sort((left, right) =>
		left.packageName.localeCompare(right.packageName),
	);
};

/**
 * True when `.langflower/nodes/` has at least one pack directory.
 * Light module — no TypeScript / esbuild (those load with compile).
 */
export const hasCustomNodePacks = async (
	projectDir: string,
): Promise<boolean> => {
	const packs = await discoverPacks(projectDir);
	return packs.length > 0;
};
