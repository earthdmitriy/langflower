import DOMPurify from 'dompurify';
import { marked } from 'marked';

const commonLeadingWhitespace = (left: string, right: string): string => {
	let index = 0;
	while (
		index < left.length &&
		index < right.length &&
		left[index] === right[index]
	) {
		index += 1;
	}
	return left.slice(0, index);
};

/**
 * Drop the shared leading tab/space prefix on every line so indented
 * template-literal node descriptions do not become markdown code.
 * Does not run on feed/preview markdown.
 */
const stripCommonIndent = (text: string): string => {
	const lines = text.split('\n');
	const indents = lines
		.filter((line) => line.trim().length > 0)
		.map((line) => /^[ \t]*/.exec(line)?.[0] ?? '');

	if (indents.length === 0) {
		return text;
	}

	const prefix = indents.reduce(commonLeadingWhitespace);
	if (prefix.length === 0) {
		return text;
	}

	return lines
		.map((line) =>
			line.startsWith(prefix) ? line.slice(prefix.length) : line,
		)
		.join('\n');
};

/**
 * Shared markdown → safe HTML for inspector preview and feed agent bubbles
 * (live draft and settled result).
 */
export const renderMarkdown = (markdown: string): string => {
	if (markdown.trim().length === 0) {
		return '';
	}

	const html = marked.parse(markdown, { async: false });

	return typeof html === 'string' ? DOMPurify.sanitize(html) : '';
};

/**
 * Markdown for palette popover and inspector node descriptions.
 * Strips a common indent prefix, then {@link renderMarkdown}.
 */
export const renderNodeDescriptionMarkdown = (
	markdown: string | undefined,
): string | null => {
	if (markdown === undefined || markdown.trim().length === 0) {
		return null;
	}

	const html = renderMarkdown(stripCommonIndent(markdown).trim());
	return html.length > 0 ? html : null;
};
