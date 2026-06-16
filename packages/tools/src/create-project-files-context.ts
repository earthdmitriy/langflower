import fs from 'node:fs/promises';
import path from 'node:path';
import { formatNotFound, resolveProjectPath } from './path-sandbox.js';

/**
 * Permission-free project file I/O for palette graph nodes (Text Read/Write/Append).
 * Author placing the node is the allow decision — no HITL ask.
 * Absolute paths are rejected; only project-relative paths under the fence.
 */
export type ProjectFilesContext = {
	readonly read: (relativePath: string) => Promise<string>;
	readonly write: (relativePath: string, content: string) => Promise<void>;
	readonly append: (
		relativePath: string,
		content: string,
		delimiter: string,
	) => Promise<void>;
};

export type CreateProjectFilesContextOptions = {
	readonly projectRoot: string;
	readonly denyPaths?: readonly string[];
};

const assertProjectRelativePath = (userPath: string): string => {
	const trimmed = userPath.trim();

	if (trimmed.length === 0) {
		throw new Error('Path is required.');
	}

	if (path.isAbsolute(trimmed)) {
		throw new Error(
			`Absolute paths are not allowed: «${userPath}». Use a path relative to the project root.`,
		);
	}

	return trimmed;
};

const resolveRelativeUnderProject = (
	projectRoot: string,
	userPath: string,
	denyPaths: readonly string[] | undefined,
): string => {
	const relative = assertProjectRelativePath(userPath);

	return resolveProjectPath(projectRoot, relative, {
		...(denyPaths !== undefined ? { denyPaths } : {}),
		allowedRoots: [],
	});
};

/**
 * Project-root file helpers for graph nodes. Fence + deny list only —
 * no permission gate (unlike harness builtins).
 */
export const createProjectFilesContext = (
	options: CreateProjectFilesContextOptions,
): ProjectFilesContext => {
	const projectRoot = options.projectRoot;
	const denyPaths = options.denyPaths;

	const resolve = (userPath: string): string =>
		resolveRelativeUnderProject(projectRoot, userPath, denyPaths);

	return {
		read: async (relativePath) => {
			const absolute = resolve(relativePath);

			try {
				return await fs.readFile(absolute, 'utf8');
			} catch (error) {
				const code =
					error !== null &&
					typeof error === 'object' &&
					'code' in error
						? String((error as { code: unknown }).code)
						: '';

				if (code === 'ENOENT') {
					throw new Error(
						await formatNotFound(absolute, relativePath.trim()),
					);
				}

				throw error;
			}
		},
		write: async (relativePath, content) => {
			const absolute = resolve(relativePath);
			await fs.mkdir(path.dirname(absolute), { recursive: true });
			await fs.writeFile(absolute, content, 'utf8');
		},
		append: async (relativePath, content, delimiter) => {
			const absolute = resolve(relativePath);
			let existing = '';

			try {
				existing = await fs.readFile(absolute, 'utf8');
			} catch (error) {
				const code =
					error !== null &&
					typeof error === 'object' &&
					'code' in error
						? String((error as { code: unknown }).code)
						: '';

				if (code !== 'ENOENT') {
					throw error;
				}
			}

			const next =
				existing.length === 0
					? content
					: `${existing}${delimiter}${content}`;

			await fs.mkdir(path.dirname(absolute), { recursive: true });
			await fs.writeFile(absolute, next, 'utf8');
		},
	};
};
