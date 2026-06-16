import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

export const collectTsFiles = (dir: string): readonly string[] => {
	let entries: string[];
	try {
		entries = readdirSync(dir);
	} catch {
		return [];
	}
	const files: string[] = [];

	for (const entry of entries) {
		const full = path.join(dir, entry);
		const st = statSync(full);

		if (st.isDirectory()) {
			files.push(...collectTsFiles(full));
			continue;
		}

		if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
			files.push(full);
		}
	}

	return files;
};

export const isProductionSource = (file: string): boolean => {
	const base = path.basename(file);
	return (
		!base.endsWith('.test.ts') &&
		!base.endsWith('.parity.test.ts') &&
		!base.includes('.parity.')
	);
};

/** Strip line and block comments so JSDoc examples are not treated as imports. */
export const stripTsComments = (source: string): string =>
	source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** Extract @langflower/... module specifiers from TS source text. */
export const listLangflowerImports = (source: string): readonly string[] => {
	const code = stripTsComments(source);
	const found = new Set<string>();
	const patterns = [
		/\bfrom\s+['"](@langflower\/[^'"]+)['"]/g,
		/\bimport\s*\(\s*['"](@langflower\/[^'"]+)['"]\s*\)/g,
		/\bimport\s+['"](@langflower\/[^'"]+)['"]/g,
	];

	for (const pattern of patterns) {
		for (const match of code.matchAll(pattern)) {
			const spec = match[1];
			if (spec !== undefined) {
				found.add(spec);
			}
		}
	}

	return [...found].sort();
};

export const readJson = <T>(filePath: string): T =>
	JSON.parse(readFileSync(filePath, 'utf8')) as T;
