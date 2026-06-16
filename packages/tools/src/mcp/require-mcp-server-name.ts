/**
 * Read non-empty `serverInfo.name` from an MCP `initialize` result.
 * Empty / missing → throw (no invented fallback name).
 */
export const requireMcpServerName = (initializeResult: unknown): string => {
	if (
		initializeResult === null ||
		typeof initializeResult !== 'object' ||
		!('serverInfo' in initializeResult)
	) {
		throw new Error('MCP initialize response missing serverInfo.');
	}

	const serverInfo = (initializeResult as { serverInfo: unknown }).serverInfo;

	if (
		serverInfo === null ||
		typeof serverInfo !== 'object' ||
		!('name' in serverInfo)
	) {
		throw new Error('MCP initialize response missing serverInfo.name.');
	}

	const name = String((serverInfo as { name: unknown }).name ?? '').trim();

	if (name.length === 0) {
		throw new Error('MCP serverInfo.name is empty.');
	}

	return name;
};
