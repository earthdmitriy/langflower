/**
 * Readable connect/initialize failure for wire / system MCP (S5 / S6).
 * Keeps message free of secrets; truncates long command/url.
 */
export const formatMcpConnectError = (
	cause: unknown,
	detail: {
		readonly nodeId: string;
		readonly kind: 'stdio' | 'http' | 'system';
		readonly target: string;
	},
): Error => {
	const base = cause instanceof Error ? cause.message : String(cause);
	const raw = detail.target.trim();
	const target =
		raw.length === 0 ? '' : raw.length > 80 ? `${raw.slice(0, 77)}…` : raw;
	const where =
		target.length > 0
			? `node ${detail.nodeId}, ${target}`
			: `node ${detail.nodeId}`;

	return new Error(`MCP ${detail.kind} connect failed (${where}): ${base}`);
};
