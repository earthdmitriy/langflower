export const normalizeToolResult = (text: string, maxChars: number): string => {
	if (maxChars <= 0 || text.length <= maxChars) {
		return text;
	}

	const omitted = text.length - maxChars;
	return `${text.slice(0, maxChars)}\n\n[tool result truncated: ${omitted} characters omitted]`;
};
