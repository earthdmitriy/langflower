import DOMPurify from 'dompurify';
import { marked } from 'marked';

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
