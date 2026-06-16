import { DEFAULT_CONFIG } from '@langflower/shared/constants/defaults.js';
import { DEFAULT_PERMISSION_CONFIG } from '@langflower/tools/permission';
import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveSkeletonRoot } from './resolve-skeleton-root.js';
import {
	seedSkeletonContent,
	type SeedSkeletonMode,
	type SeedSkeletonResult,
} from './seed-skeleton.js';

const FIRST_RUN_WORKFLOW_ID = 'starter';

/** First-run project config — explicit permission + local JSON Schema. */
const FIRST_RUN_LANGFLOWER_JSONC = {
	$schema: './schemas/langflower-config.schema.json',
	currentWorkflowId: FIRST_RUN_WORKFLOW_ID,
	provider: {},
	permission: DEFAULT_PERMISSION_CONFIG,
} as const;

export type BootstrapProjectOptions = {
	readonly mode?: SeedSkeletonMode;
	/** When false, skip seeding skeleton `my-nodes`. Default true. */
	readonly seedCustomNodes?: boolean;
};

const pathExists = async (targetPath: string): Promise<boolean> => {
	try {
		await fs.access(targetPath);
		return true;
	} catch {
		return false;
	}
};

const ensureLangflowerDirs = async (langflowerDir: string): Promise<void> => {
	await fs.mkdir(path.join(langflowerDir, 'workflows'), { recursive: true });
	await fs.mkdir(path.join(langflowerDir, 'nodes'), { recursive: true });
	await fs.mkdir(path.join(langflowerDir, 'skills'), { recursive: true });
};

const writeConfigIfMissing = async (
	langflowerDir: string,
	projectDir: string,
): Promise<void> => {
	const configPath = path.join(langflowerDir, 'config.json');

	if (await pathExists(configPath)) {
		return;
	}

	await fs.writeFile(
		configPath,
		`${JSON.stringify({ ...DEFAULT_CONFIG, projectDir }, null, 2)}\n`,
		'utf8',
	);
};

const writeLangflowerJsoncIfMissing = async (
	langflowerDir: string,
): Promise<void> => {
	const langflowerConfigPath = path.join(langflowerDir, 'langflower.jsonc');

	if (await pathExists(langflowerConfigPath)) {
		return;
	}

	await fs.writeFile(
		langflowerConfigPath,
		`${JSON.stringify(FIRST_RUN_LANGFLOWER_JSONC, null, '\t')}\n`,
		'utf8',
	);
};

/**
 * Seed `.langflower/` from the packaged skeleton.
 *
 * - `create` (default): first-run layout — mkdir, create-if-missing configs,
 *   copy-if-missing skeleton content (all workflows).
 * - `force`: overwrite skeleton templates; never writes `langflower.jsonc`
 *   and never overwrites an existing `config.json`.
 */
export async function bootstrapProject(
	projectDir: string,
	options: BootstrapProjectOptions = {},
): Promise<SeedSkeletonResult> {
	const mode: SeedSkeletonMode = options.mode ?? 'create';
	const resolved = path.resolve(projectDir);
	const langflowerDir = path.join(resolved, '.langflower');

	await ensureLangflowerDirs(langflowerDir);

	if (mode === 'create') {
		await writeConfigIfMissing(langflowerDir, resolved);
		await writeLangflowerJsoncIfMissing(langflowerDir);
	} else if (!(await pathExists(path.join(langflowerDir, 'config.json')))) {
		// Force reseed on a broken project may still need tool config.
		await writeConfigIfMissing(langflowerDir, resolved);
	}

	const skeletonRoot = await resolveSkeletonRoot();
	return seedSkeletonContent(skeletonRoot, langflowerDir, {
		mode,
		...(options.seedCustomNodes !== undefined
			? { seedCustomNodes: options.seedCustomNodes }
			: {}),
	});
}

/** True when the project already has a `.langflower` directory. */
export const hasLangflowerProject = async (
	projectDir: string,
): Promise<boolean> => {
	const langflowerDir = path.join(path.resolve(projectDir), '.langflower');

	try {
		const stat = await fs.stat(langflowerDir);
		return stat.isDirectory();
	} catch {
		return false;
	}
};
