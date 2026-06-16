/** Strip block and line comments and trailing commas, then JSON.parse. */
export function parseJsonc(raw: string): unknown {
	const withoutBlock = raw.replace(/\/\*[\s\S]*?\*\//g, '');
	const withoutLine = withoutBlock.replace(/^\s*\/\/.*$/gm, '');
	const withoutTrailingCommas = withoutLine.replace(/,\s*([\]}])/g, '$1');
	return JSON.parse(withoutTrailingCommas);
}
