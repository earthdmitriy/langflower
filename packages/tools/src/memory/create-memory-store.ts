import fs from 'node:fs/promises';
import path from 'node:path';
import { walkFiles } from '../builtins/walk-files.js';
import { atomicWriteFile } from './atomic-write.js';
import {
	extractSectionBody,
	findHeading,
	formatHeadingLine,
	parseHeadings,
	sectionRange,
	topLevelHeadings,
} from './markdown-sections.js';
import {
	MEMORY_ROOT_RELATIVE,
	memoryRootAbsolute,
	resolveMemoryFilePath,
	toMemoryRelativePath,
} from './memory-paths.js';

const MAX_GREP_MATCHES = 100;

export type MemoryTreeFile = {
	readonly file_path: string;
	readonly headings: readonly {
		readonly level: number;
		readonly title: string;
	}[];
};

export type MemoryStore = {
	readonly getTree: () => Promise<readonly MemoryTreeFile[]>;
	readonly readSection: (
		filePath: string,
		heading?: string,
	) => Promise<string>;
	readonly searchGrep: (query: string) => Promise<readonly string[]>;
	readonly appendLog: (filePath: string, content: string) => Promise<void>;
	readonly updateSection: (
		filePath: string,
		heading: string,
		newContent: string,
	) => Promise<void>;
	readonly createFile: (
		filePath: string,
		initialContent?: string,
	) => Promise<void>;
};

const ensureMarkdownExtension = (filePath: string): string => {
	const trimmed = filePath.trim().replace(/\\/g, '/');

	if (trimmed.length === 0) {
		throw new Error('file_path is required.');
	}

	return trimmed;
};

const readUtf8 = async (absolute: string): Promise<string> => {
	try {
		return await fs.readFile(absolute, 'utf8');
	} catch (error) {
		const code =
			error !== null && typeof error === 'object' && 'code' in error
				? String((error as { code: unknown }).code)
				: '';

		if (code === 'ENOENT') {
			throw new Error(`Memory file not found: ${absolute}`);
		}

		throw error;
	}
};

/**
 * Project-scoped markdown memory under `.langflower/memory/`.
 */
export const createMemoryStore = (projectDir: string): MemoryStore => {
	const root = memoryRootAbsolute(projectDir);

	return {
		getTree: async () => {
			await fs.mkdir(root, { recursive: true });
			const files = await walkFiles(root, root, false);
			const tree: MemoryTreeFile[] = [];

			for (const relative of files) {
				if (!relative.endsWith('.md') && !relative.endsWith('.txt')) {
					continue;
				}

				const absolute = path.join(root, relative);
				const text = await readUtf8(absolute);
				tree.push({
					file_path: relative.split(path.sep).join('/'),
					headings: topLevelHeadings(text),
				});
			}

			tree.sort((a, b) => a.file_path.localeCompare(b.file_path));
			return tree;
		},

		readSection: async (filePath, heading) => {
			const absolute = resolveMemoryFilePath(
				projectDir,
				ensureMarkdownExtension(filePath),
			);
			const text = await readUtf8(absolute);

			if (heading === undefined || heading.trim().length === 0) {
				return text;
			}

			const found = findHeading(parseHeadings(text), heading);

			if (found === undefined) {
				throw new Error(
					`Heading «${heading}» not found in ${ensureMarkdownExtension(filePath)}.`,
				);
			}

			const body = extractSectionBody(text, found);
			return `${found.raw}\n${body}`.replace(/\s+$/, '');
		},

		searchGrep: async (query) => {
			const pattern = query.trim();

			if (pattern.length === 0) {
				throw new Error('query is required.');
			}

			let regex: RegExp;

			try {
				regex = new RegExp(pattern);
			} catch (error) {
				const message =
					error instanceof Error ? error.message : String(error);
				throw new Error(
					`Invalid regex «${pattern}»: ${message}. Escape special characters or simplify the pattern.`,
				);
			}

			await fs.mkdir(root, { recursive: true });
			const files = await walkFiles(root, root, false);
			const hits: string[] = [];

			for (const relative of files) {
				if (hits.length >= MAX_GREP_MATCHES) {
					break;
				}

				const absolute = path.join(root, relative);
				let text: string;

				try {
					text = await fs.readFile(absolute, 'utf8');
				} catch {
					continue;
				}

				const display = relative.split(path.sep).join('/');
				const lines = text.split(/\r?\n/);

				for (let i = 0; i < lines.length; i += 1) {
					const line = lines[i] ?? '';

					if (regex.test(line)) {
						hits.push(`${display}:${i + 1}:${line}`);
						if (hits.length >= MAX_GREP_MATCHES) {
							break;
						}
					}
				}
			}

			return hits;
		},

		appendLog: async (filePath, content) => {
			const absolute = resolveMemoryFilePath(
				projectDir,
				ensureMarkdownExtension(filePath),
			);
			await fs.mkdir(path.dirname(absolute), { recursive: true });
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

			const chunk = content.endsWith('\n') ? content : `${content}\n`;
			const next =
				existing.length === 0
					? chunk
					: existing.endsWith('\n')
						? `${existing}${chunk}`
						: `${existing}\n${chunk}`;
			await atomicWriteFile(absolute, next);
		},

		updateSection: async (filePath, heading, newContent) => {
			if (newContent.trim().length === 0) {
				throw new Error(
					'new_content must not be empty. Refusing to delete a section — pass non-empty markdown body under the heading.',
				);
			}

			const relative = ensureMarkdownExtension(filePath);
			const absolute = resolveMemoryFilePath(projectDir, relative);
			await fs.mkdir(path.dirname(absolute), { recursive: true });
			let text = '';

			try {
				text = await fs.readFile(absolute, 'utf8');
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

			const headingLine = formatHeadingLine(heading);
			const body = newContent.replace(/^\n+/, '').replace(/\s+$/, '');
			const headings = parseHeadings(text);
			const found = findHeading(headings, heading);
			const lines = text.length === 0 ? [] : text.split(/\r?\n/);

			if (found === undefined) {
				const suffix =
					text.length === 0
						? `${headingLine}\n${body}\n`
						: `${text.endsWith('\n') ? text : `${text}\n`}\n${headingLine}\n${body}\n`;
				await atomicWriteFile(absolute, suffix);
				return;
			}

			const { startLine, endLine } = sectionRange(text, found);
			const next = [
				...lines.slice(0, found.lineIndex),
				headingLine,
				...body.split(/\r?\n/),
				...lines.slice(endLine),
			].join('\n');
			await atomicWriteFile(
				absolute,
				next.endsWith('\n') ? next : `${next}\n`,
			);
		},

		createFile: async (filePath, initialContent) => {
			const absolute = resolveMemoryFilePath(
				projectDir,
				ensureMarkdownExtension(filePath),
			);
			await fs.mkdir(path.dirname(absolute), { recursive: true });
			const content =
				initialContent === undefined || initialContent.length === 0
					? ''
					: initialContent.endsWith('\n')
						? initialContent
						: `${initialContent}\n`;

			try {
				await fs.writeFile(absolute, content, {
					encoding: 'utf8',
					flag: 'wx',
				});
			} catch (error) {
				const code =
					error !== null &&
					typeof error === 'object' &&
					'code' in error
						? String((error as { code: unknown }).code)
						: '';

				if (code === 'EEXIST') {
					throw new Error(
						`Memory file already exists: ${toMemoryRelativePath(projectDir, absolute)}`,
					);
				}

				throw error;
			}
		},
	};
};

export { MEMORY_ROOT_RELATIVE };
