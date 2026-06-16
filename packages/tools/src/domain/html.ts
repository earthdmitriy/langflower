const BLOCK_TAGS = /<(script|style|noscript|svg|iframe)[^>]*>[\s\S]*?<\/\1>/gi;
const TAG_PATTERN = /<[^>]+>/g;
const WHITESPACE_PATTERN = /\s+/g;

const ENTITY_MAP: Readonly<Record<string, string>> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: ' ',
};

const decodeBasicEntities = (text: string): string =>
	text.replace(/&(#x?[0-9a-fA-F]+|\w+);/g, (match, entity: string) => {
		if (entity.startsWith('#x')) {
			const code = Number.parseInt(entity.slice(2), 16);

			return Number.isFinite(code) ? String.fromCodePoint(code) : match;
		}

		if (entity.startsWith('#')) {
			const code = Number.parseInt(entity.slice(1), 10);

			return Number.isFinite(code) ? String.fromCodePoint(code) : match;
		}

		return ENTITY_MAP[entity] ?? match;
	});

export const htmlToText = (html: string): string => {
	const withoutBlocks = html.replace(BLOCK_TAGS, ' ');
	const withoutTags = withoutBlocks.replace(TAG_PATTERN, ' ');
	const decoded = decodeBasicEntities(withoutTags);

	return decoded.replace(WHITESPACE_PATTERN, ' ').trim();
};

export const extractHtmlTitle = (html: string): string | undefined => {
	const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
	const title = match?.[1] !== undefined ? htmlToText(match[1]) : '';

	return title.length > 0 ? title : undefined;
};

const resolveLink = (baseUrl: string, href: string): string | null => {
	const trimmed = href.trim();

	if (
		trimmed.length === 0 ||
		trimmed.startsWith('#') ||
		trimmed.startsWith('mailto:') ||
		trimmed.startsWith('javascript:')
	) {
		return null;
	}

	try {
		return new URL(trimmed, baseUrl).toString();
	} catch {
		return null;
	}
};

export const extractLinks = (
	html: string,
	baseUrl: string,
): readonly string[] => {
	const links = new Set<string>();
	const pattern = /\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;

	for (const match of html.matchAll(pattern)) {
		const href = match[1] ?? match[2] ?? match[3] ?? '';
		const resolved = resolveLink(baseUrl, href);

		if (resolved !== null) {
			links.add(resolved);
		}
	}

	return [...links].sort((left, right) => left.localeCompare(right));
};

export const isSameHost = (leftUrl: string, rightUrl: string): boolean => {
	try {
		return new URL(leftUrl).hostname === new URL(rightUrl).hostname;
	} catch {
		return false;
	}
};
