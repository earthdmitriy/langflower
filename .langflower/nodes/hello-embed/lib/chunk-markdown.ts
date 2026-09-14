import { MAX_CHUNKS_PER_FILE } from './paths.ts';

export type MarkdownChunk = {
	readonly id: string;
	readonly path: string;
	readonly heading: string;
	readonly text: string;
	readonly embedText: string;
	readonly truncated?: string;
};

const HEADING_RE = /^(#{1,6})\s+(.*)$/;

const slugHeading = (heading: string): string => {
	const slug = heading
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return slug.length > 0 ? slug : 'intro';
};

const displayHeading = (heading: string): string =>
	heading.length > 0 ? heading : '(intro)';

type OpenSection = {
	readonly depth: number;
	readonly title: string;
};

const breadcrumbOf = (stack: readonly OpenSection[]): string =>
	stack.map((section) => section.title).join(' > ');

const flushBody = (
	relPath: string,
	heading: string,
	body: string,
	ordinal: number,
	out: MarkdownChunk[],
): number => {
	const text = body.trim();
	if (text.length === 0) {
		return ordinal;
	}
	const id = `${relPath}#${slugHeading(heading)}#${String(ordinal)}`;
	out.push({
		id,
		path: relPath,
		heading,
		text,
		embedText: `${relPath}\n${displayHeading(heading)}\n\n${text}`,
	});
	return ordinal + 1;
};

/**
 * Split markdown into heading chunks. Preamble before the first heading
 * uses heading `""`. Heading-less files become one chunk.
 */
export const chunkMarkdown = (
	relPath: string,
	source: string,
): readonly MarkdownChunk[] => {
	const lines = source.replaceAll('\r\n', '\n').split('\n');
	const out: MarkdownChunk[] = [];
	const stack: OpenSection[] = [];
	let currentHeading = '';
	let body: string[] = [];
	let ordinal = 0;
	let truncated: string | undefined;

	const flush = (): void => {
		if (out.length >= MAX_CHUNKS_PER_FILE) {
			if (truncated === undefined) {
				truncated = `capped ${relPath} at ${String(MAX_CHUNKS_PER_FILE)} chunks`;
			}
			body = [];
			return;
		}
		ordinal = flushBody(
			relPath,
			currentHeading,
			body.join('\n'),
			ordinal,
			out,
		);
		body = [];
	};

	for (const line of lines) {
		const match = HEADING_RE.exec(line);
		if (match === null) {
			body.push(line);
			continue;
		}
		flush();
		if (out.length >= MAX_CHUNKS_PER_FILE) {
			break;
		}
		const marks = match[1] ?? '#';
		const title = (match[2] ?? '').trim();
		const depth = marks.length;
		while (
			stack.length > 0 &&
			(stack[stack.length - 1]?.depth ?? 0) >= depth
		) {
			stack.pop();
		}
		stack.push({ depth, title });
		currentHeading = breadcrumbOf(stack);
	}
	if (out.length < MAX_CHUNKS_PER_FILE) {
		flush();
	}

	if (truncated !== undefined && out[0] !== undefined) {
		const last = out[out.length - 1];
		if (last !== undefined) {
			out[out.length - 1] = { ...last, truncated };
		}
	}
	return out;
};
