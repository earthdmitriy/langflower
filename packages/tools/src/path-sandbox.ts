import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_DENY = [
	'.git/',
	'node_modules/',
	'.langflower/secrets/',
] as const;

export type PathFenceOptions = {
	readonly denyPaths?: readonly string[];
	/**
	 * Absolute directories trusted for harness I/O outside the project root
	 * (e.g. an Obsidian vault). Relative entries are resolved against
	 * `projectRoot`. Empty/missing → project-root only (ADR-014 default).
	 */
	readonly allowedRoots?: readonly string[];
};

const isUnderRoot = (absolute: string, root: string): boolean => {
	const relative = path.relative(path.resolve(root), absolute);
	return (
		relative === '' ||
		(!relative.startsWith('..') && !path.isAbsolute(relative))
	);
};

const matchesDeny = (
	posixRelative: string,
	denyPaths: readonly string[],
): string | undefined =>
	[...denyPaths, ...DEFAULT_DENY].find((pattern) => {
		const normalized = pattern.replace(/\\/g, '/').replace(/^\//, '');
		return (
			posixRelative === normalized.replace(/\/$/, '') ||
			posixRelative.startsWith(
				normalized.endsWith('/') ? normalized : `${normalized}/`,
			) ||
			(normalized.endsWith('/') && posixRelative.startsWith(normalized))
		);
	});

/**
 * Resolve which fence root contains `absolute` — project root first, then
 * allowlisted roots. Returns `null` when the path is outside every fence.
 */
export const resolveFenceRoot = (
	projectRoot: string,
	absolute: string,
	allowedRoots: readonly string[] = [],
): string | null => {
	const project = path.resolve(projectRoot);

	if (isUnderRoot(absolute, project)) {
		return project;
	}

	for (const entry of allowedRoots) {
		const root = path.resolve(projectRoot, entry);
		if (isUnderRoot(absolute, root)) {
			return root;
		}
	}

	return null;
};

/**
 * Path string suitable for later harness tool calls.
 * Project-scoped → relative; allowlisted outside → absolute (posix `/`).
 */
export const toHarnessDisplayPath = (
	projectRoot: string,
	absolute: string,
	allowedRoots: readonly string[] = [],
): string => {
	const fence = resolveFenceRoot(projectRoot, absolute, allowedRoots);
	const project = path.resolve(projectRoot);

	if (fence === project) {
		return path.relative(project, absolute).split(path.sep).join('/');
	}

	return absolute.split(path.sep).join('/');
};

/**
 * Resolve `userPath` under the project root, or under an allowlisted extra
 * root when the path escapes the project (absolute vault paths, …).
 */
const isPathFenceOptions = (
	value: readonly string[] | PathFenceOptions,
): value is PathFenceOptions => !Array.isArray(value);

const asPathFenceOptions = (
	denyOrOptions: readonly string[] | PathFenceOptions,
): PathFenceOptions =>
	isPathFenceOptions(denyOrOptions)
		? denyOrOptions
		: { denyPaths: denyOrOptions };

export const resolveProjectPath = (
	projectRoot: string,
	userPath: string,
	denyOrOptions: readonly string[] | PathFenceOptions = {},
): string => {
	const options = asPathFenceOptions(denyOrOptions);
	const denyPaths = options.denyPaths ?? DEFAULT_DENY;
	const allowedRoots = options.allowedRoots ?? [];
	const trimmed = userPath.trim();

	if (trimmed.length === 0) {
		throw new Error('Path is required.');
	}

	const project = path.resolve(projectRoot);
	const candidate = path.isAbsolute(trimmed)
		? path.resolve(trimmed)
		: path.resolve(project, trimmed);

	const fence = resolveFenceRoot(project, candidate, allowedRoots);

	if (fence === null) {
		throw new Error(
			`Path escapes project root: «${userPath}». Stay under the project directory, or add the vault to harness.allowedRoots.`,
		);
	}

	const posixRelative = path
		.relative(fence, candidate)
		.split(path.sep)
		.join('/');
	const denied = matchesDeny(posixRelative, denyPaths);

	if (denied !== undefined) {
		throw new Error(
			`Path is denied by sandbox policy: «${userPath}» (matched «${denied}»).`,
		);
	}

	return candidate;
};

const listSiblingHints = async (
	absolutePath: string,
	limit = 8,
): Promise<readonly string[]> => {
	const parent = path.dirname(absolutePath);

	try {
		const entries = await fs.readdir(parent);
		return entries.slice(0, limit);
	} catch {
		return [];
	}
};

export const formatNotFound = async (
	absolutePath: string,
	userPath: string,
): Promise<string> => {
	const siblings = await listSiblingHints(absolutePath);
	const hint =
		siblings.length > 0 ? ` Nearby names: ${siblings.join(', ')}.` : '';

	return `File not found: «${userPath}».${hint}`;
};
