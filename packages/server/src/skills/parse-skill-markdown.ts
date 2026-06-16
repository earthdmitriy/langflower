export const MAX_SKILL_DESCRIPTION_LENGTH = 280;

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

const parseFrontmatterField = (
	frontmatter: string,
	key: string,
): string | undefined => {
	const match = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));

	if (match === null) {
		return undefined;
	}

	let value = match[1]?.trim() ?? '';

	if (
		(value.startsWith('"') && value.endsWith('"')) ||
		(value.startsWith("'") && value.endsWith("'"))
	) {
		value = value.slice(1, -1);
	}

	return value.length > 0 ? value : undefined;
};

const truncateDescription = (text: string): string =>
	text.length <= MAX_SKILL_DESCRIPTION_LENGTH
		? text
		: `${text.slice(0, MAX_SKILL_DESCRIPTION_LENGTH - 1)}…`;

const stripInlineMarkdown = (line: string): string =>
	line
		.replace(/^#{1,6}\s+/, '')
		.replace(/^[-*+>\s]+/, '')
		.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
		.replace(/[*_`]/g, '')
		.trim();

const firstProseLine = (body: string): string => {
	for (const line of body.split(/\r?\n/)) {
		const text = stripInlineMarkdown(line.trim());

		if (text.length > 0) {
			return truncateDescription(text);
		}
	}

	return '';
};

export type ParsedSkillMarkdown = {
	readonly name?: string;
	readonly description?: string;
	readonly body: string;
};

export const parseSkillMarkdown = (content: string): ParsedSkillMarkdown => {
	const match = content.match(FRONTMATTER_PATTERN);

	if (match === null) {
		return {
			body: content,
			description: firstProseLine(content),
		};
	}

	const [, frontmatter = '', body = ''] = match;
	const name = parseFrontmatterField(frontmatter, 'name');
	const description =
		parseFrontmatterField(frontmatter, 'description') ??
		firstProseLine(body);

	return {
		...(name !== undefined ? { name } : {}),
		...(description.length > 0 ? { description } : {}),
		body,
	};
};
