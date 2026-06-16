import fs from 'node:fs/promises';
import path from 'node:path';

type IgnoreRule = {
	readonly negated: boolean;
	readonly directoryOnly: boolean;
	readonly pattern: string;
};

const parseIgnoreLine = (line: string): IgnoreRule | undefined => {
	const trimmed = line.trim();

	if (trimmed.length === 0 || trimmed.startsWith('#')) {
		return undefined;
	}

	const negated = trimmed.startsWith('!');
	const body = negated ? trimmed.slice(1) : trimmed;
	const directoryOnly = body.endsWith('/');
	const pattern = directoryOnly ? body.slice(0, -1) : body;

	if (pattern.length === 0) {
		return undefined;
	}

	return { negated, directoryOnly, pattern };
};

const matchSegmentGlob = (pattern: string, value: string): boolean => {
	if (pattern === '**') {
		return true;
	}

	const escaped = pattern
		.replace(/[.+^${}()|[\]\\]/g, '\\$&')
		.replace(/\*/g, '[^/]*')
		.replace(/\?/g, '[^/]');

	return new RegExp(`^${escaped}$`).test(value);
};

const matchPath = (pattern: string, relativePosix: string): boolean => {
	const normalizedPattern = pattern.replace(/\\/g, '/').replace(/^\//, '');
	const target = relativePosix.replace(/^\.\//, '');

	if (!normalizedPattern.includes('/')) {
		const parts = target.split('/');
		return parts.some((part) => matchSegmentGlob(normalizedPattern, part));
	}

	const patternParts = normalizedPattern.split('/');
	const targetParts = target.split('/');

	const matchFrom = (pi: number, ti: number): boolean => {
		if (pi >= patternParts.length) {
			return ti >= targetParts.length;
		}

		const part = patternParts[pi] ?? '';

		if (part === '**') {
			if (pi === patternParts.length - 1) {
				return true;
			}

			for (let skip = ti; skip <= targetParts.length; skip += 1) {
				if (matchFrom(pi + 1, skip)) {
					return true;
				}
			}

			return false;
		}

		if (ti >= targetParts.length) {
			return false;
		}

		if (!matchSegmentGlob(part, targetParts[ti] ?? '')) {
			return false;
		}

		return matchFrom(pi + 1, ti + 1);
	};

	return matchFrom(0, 0);
};

export type GitIgnoreMatcher = {
	readonly ignores: (relativePosix: string, isDirectory: boolean) => boolean;
};

export const loadGitIgnoreMatcher = async (
	projectRoot: string,
): Promise<GitIgnoreMatcher> => {
	const rules: IgnoreRule[] = [
		{ negated: false, directoryOnly: false, pattern: '.git' },
		{ negated: false, directoryOnly: false, pattern: 'node_modules' },
	];

	const gitignorePath = path.join(projectRoot, '.gitignore');

	try {
		const text = await fs.readFile(gitignorePath, 'utf8');
		for (const line of text.split(/\r?\n/)) {
			const rule = parseIgnoreLine(line);
			if (rule !== undefined) {
				rules.push(rule);
			}
		}
	} catch {
		// no .gitignore — keep defaults
	}

	return {
		ignores: (relativePosix, isDirectory) => {
			let ignored = false;

			for (const rule of rules) {
				if (rule.directoryOnly && !isDirectory) {
					continue;
				}

				if (matchPath(rule.pattern, relativePosix)) {
					ignored = !rule.negated;
				}
			}

			return ignored;
		},
	};
};
