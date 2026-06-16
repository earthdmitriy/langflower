export type MarkdownHeading = {
	readonly level: number;
	readonly title: string;
	readonly lineIndex: number;
	readonly raw: string;
};

const ATX_HEADING = /^(#{1,6})\s+(.+?)\s*$/;

export const parseHeadings = (text: string): readonly MarkdownHeading[] => {
	const lines = text.split(/\r?\n/);
	const headings: MarkdownHeading[] = [];

	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i] ?? '';
		const match = ATX_HEADING.exec(line);

		if (match === null) {
			continue;
		}

		headings.push({
			level: (match[1] ?? '#').length,
			title: (match[2] ?? '').trim(),
			lineIndex: i,
			raw: line,
		});
	}

	return headings;
};

/** Strip leading `#` marks and whitespace for fuzzy heading match. */
const normalizeHeadingQuery = (heading: string): string => {
	const trimmed = heading.trim();
	const match = ATX_HEADING.exec(trimmed);

	if (match !== null) {
		return (match[2] ?? '').trim().toLowerCase();
	}

	return trimmed
		.replace(/^#{1,6}\s*/, '')
		.trim()
		.toLowerCase();
};

export const findHeading = (
	headings: readonly MarkdownHeading[],
	query: string,
): MarkdownHeading | undefined => {
	const normalized = normalizeHeadingQuery(query);

	if (normalized.length === 0) {
		return undefined;
	}

	return headings.find(
		(heading) => heading.title.trim().toLowerCase() === normalized,
	);
};

/**
 * Section body is lines after the heading until the next heading of the same
 * or higher level (lower or equal `#` count).
 */
export const sectionRange = (
	text: string,
	heading: MarkdownHeading,
): { readonly startLine: number; readonly endLine: number } => {
	const lines = text.split(/\r?\n/);
	const headings = parseHeadings(text);
	const next = headings.find(
		(candidate) =>
			candidate.lineIndex > heading.lineIndex &&
			candidate.level <= heading.level,
	);
	const endLine = next === undefined ? lines.length : next.lineIndex;

	return { startLine: heading.lineIndex + 1, endLine };
};

export const extractSectionBody = (
	text: string,
	heading: MarkdownHeading,
): string => {
	const lines = text.split(/\r?\n/);
	const { startLine, endLine } = sectionRange(text, heading);
	return lines.slice(startLine, endLine).join('\n').replace(/\s+$/, '');
};

export const formatHeadingLine = (heading: string): string => {
	const trimmed = heading.trim();
	const match = ATX_HEADING.exec(trimmed);

	if (match !== null) {
		return `${match[1]} ${(match[2] ?? '').trim()}`;
	}

	return `## ${trimmed}`;
};

export const topLevelHeadings = (
	text: string,
): readonly { readonly level: number; readonly title: string }[] =>
	parseHeadings(text)
		.filter((heading) => heading.level <= 2)
		.map((heading) => ({
			level: heading.level,
			title: heading.title,
		}));
