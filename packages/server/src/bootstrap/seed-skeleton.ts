import fs from 'node:fs/promises';
import path from 'node:path';
import { copyDirIfMissing, copyFileIfMissing } from './copy-if-missing.js';
import { copyDirForce, copyFileForce } from './copy-force.js';

export type SeedSkeletonMode = 'create' | 'force';

export type SeedSkeletonResult = {
	readonly workflowIds: readonly string[];
};

const listSkeletonWorkflowFiles = async (
	skeletonRoot: string,
): Promise<readonly string[]> => {
	const workflowsDir = path.join(skeletonRoot, 'workflows');
	const entries = await fs.readdir(workflowsDir, { withFileTypes: true });

	return entries
		.filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
		.map((entry) => entry.name)
		.sort();
};

const listSkeletonSkillIds = async (
	skeletonRoot: string,
): Promise<readonly string[]> => {
	const skillsDir = path.join(skeletonRoot, 'skills');

	try {
		const entries = await fs.readdir(skillsDir, { withFileTypes: true });
		return entries
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name)
			.sort();
	} catch {
		return [];
	}
};

export type SeedSkeletonOptions = {
	readonly mode: SeedSkeletonMode;
	/** When false, leave `nodes/` empty (no skeleton packs). Default true. */
	readonly seedCustomNodes?: boolean;
};

const listSkeletonPackIds = async (
	skeletonRoot: string,
): Promise<readonly string[]> => {
	const nodesDir = path.join(skeletonRoot, 'nodes');
	try {
		const entries = await fs.readdir(nodesDir, { withFileTypes: true });
		return entries
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name)
			.sort();
	} catch {
		return [];
	}
};

/**
 * Copy skeleton workflows, skills, custom-node packs, and instructions into
 * `.langflower/`. Create mode skips existing paths; force overwrites
 * skeleton-owned files (extra project-only files stay).
 */
export const seedSkeletonContent = async (
	skeletonRoot: string,
	langflowerDir: string,
	options: SeedSkeletonOptions,
): Promise<SeedSkeletonResult> => {
	const mode = options.mode;
	const seedCustomNodes = options.seedCustomNodes !== false;
	const copyFile = mode === 'force' ? copyFileForce : copyFileIfMissing;
	const copyDir = mode === 'force' ? copyDirForce : copyDirIfMissing;

	if (seedCustomNodes) {
		for (const packId of await listSkeletonPackIds(skeletonRoot)) {
			await copyDir(
				path.join(skeletonRoot, 'nodes', packId),
				path.join(langflowerDir, 'nodes', packId),
			);
		}
	} else {
		await fs.mkdir(path.join(langflowerDir, 'nodes'), { recursive: true });
	}

	await copyFile(
		path.join(skeletonRoot, 'instructions.md'),
		path.join(langflowerDir, 'instructions.md'),
	);

	await copyDir(
		path.join(skeletonRoot, 'schemas'),
		path.join(langflowerDir, 'schemas'),
	);

	for (const skillId of await listSkeletonSkillIds(skeletonRoot)) {
		await copyDir(
			path.join(skeletonRoot, 'skills', skillId),
			path.join(langflowerDir, 'skills', skillId),
		);
	}

	const workflowFiles = await listSkeletonWorkflowFiles(skeletonRoot);
	const workflowIds: string[] = [];

	for (const fileName of workflowFiles) {
		const workflowId = fileName.replace(/\.json$/u, '');
		workflowIds.push(workflowId);
		await copyFile(
			path.join(skeletonRoot, 'workflows', fileName),
			path.join(langflowerDir, 'workflows', fileName),
		);
	}

	return { workflowIds };
};
