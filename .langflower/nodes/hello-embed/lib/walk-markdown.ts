import fs from 'node:fs/promises';
import path from 'node:path';
import {
	asPosixRelative,
	isCacheRelative,
	MAX_FILE_BYTES,
	SKIP_DIR_NAMES,
} from './paths.ts';

export type MarkdownFile = {
	readonly absPath: string;
	readonly relPath: string;
	readonly text: string;
	readonly skipped?: string;
};

const isMarkdownName = (name: string): boolean =>
	name.toLowerCase().endsWith('.md');

export const walkMarkdown = async (
	rootDir: string,
): Promise<readonly MarkdownFile[]> => {
	const files: MarkdownFile[] = [];

	const visit = async (absDir: string, relPosix: string): Promise<void> => {
		const entries = await fs.readdir(absDir, { withFileTypes: true });
		for (const entry of entries) {
			const childRel =
				relPosix.length === 0
					? entry.name
					: `${relPosix}/${entry.name}`;
			const childAbs = path.join(absDir, entry.name);
			if (entry.isDirectory()) {
				if (SKIP_DIR_NAMES.has(entry.name)) {
					continue;
				}
				if (isCacheRelative(asPosixRelative(childRel))) {
					continue;
				}
				await visit(childAbs, asPosixRelative(childRel));
				continue;
			}
			if (!entry.isFile() || !isMarkdownName(entry.name)) {
				continue;
			}
			if (isCacheRelative(asPosixRelative(childRel))) {
				continue;
			}
			const stat = await fs.stat(childAbs);
			const relPath = asPosixRelative(childRel);
			if (stat.size > MAX_FILE_BYTES) {
				files.push({
					absPath: childAbs,
					relPath,
					text: '',
					skipped: `skipped ${relPath} (${String(stat.size)} bytes > ${String(MAX_FILE_BYTES)})`,
				});
				continue;
			}
			const text = await fs.readFile(childAbs, 'utf8');
			files.push({ absPath: childAbs, relPath, text });
		}
	};

	await visit(rootDir, '');
	return files;
};
