const PREVIEW_CAP = 200;

const capPreview = (text: string): string =>
	text.length <= PREVIEW_CAP ? text : `${text.slice(0, PREVIEW_CAP)}…`;

const firstNonEmptyLine = (text: string): string => {
	for (const line of text.split('\n')) {
		const trimmed = line.trim();
		if (trimmed.length > 0) {
			return trimmed;
		}
	}

	return '';
};

const lastNonEmptyLine = (text: string): string => {
	const lines = text.split('\n');
	for (let index = lines.length - 1; index >= 0; index -= 1) {
		const line = lines[index]?.trim() ?? '';
		if (line.length > 0) {
			return line;
		}
	}

	return '';
};

/**
 * Closed feed-row summary text. Never pretty-prints JSON or interpolates a
 * full dump — objects/arrays are the placeholder `JSON`.
 */
export const formatFeedCollapsedPreview = (value: unknown): string => {
	if (value === null || value === undefined) {
		return '(empty)';
	}

	if (typeof value === 'string') {
		const line = lastNonEmptyLine(value);
		if (line.length === 0) {
			return '(empty)';
		}

		return capPreview(line);
	}

	if (value instanceof Error) {
		const message =
			value.message.length > 0 ? value.message : String(value);
		const firstLine = firstNonEmptyLine(message);
		return capPreview(firstLine.length > 0 ? firstLine : message);
	}

	if (typeof value === 'object') {
		return 'JSON';
	}

	return capPreview(String(value));
};
