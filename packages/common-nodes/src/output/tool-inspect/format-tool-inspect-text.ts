import type { ToolHandle } from '@langflower/node-sdk';
import { flattenToolHandles } from '../../tools/collect-agent-tool-handles.js';

export const EMPTY_TOOL_INSPECT_TEXT = 'No tools on this wire.';

export const unmatchedToolInspectText = (toolId: string): string =>
	`No tools matching «${toolId}».`;

const matchesToolIdFilter = (
	handle: ToolHandle,
	needle: string,
): boolean => {
	const id = handle.toolId.toLowerCase();
	const name = handle.name.toLowerCase();
	const filter = needle.toLowerCase();

	return id === filter || name === filter || id.includes(filter);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const exampleFromSchema = (schema: unknown): unknown => {
	if (!isRecord(schema)) {
		return null;
	}

	if ('default' in schema) {
		return schema.default;
	}

	if (Array.isArray(schema.enum) && schema.enum.length > 0) {
		return schema.enum[0];
	}

	const rawType = schema.type;
	const type = Array.isArray(rawType) ? rawType[0] : rawType;

	if (
		type === 'object' ||
		(type === undefined && isRecord(schema.properties))
	) {
		const properties = isRecord(schema.properties) ? schema.properties : {};
		const result: Record<string, unknown> = {};
		for (const [key, propSchema] of Object.entries(properties)) {
			result[key] = exampleFromSchema(propSchema);
		}

		return result;
	}

	if (type === 'array') {
		return [];
	}

	if (type === 'string') {
		return '';
	}

	if (type === 'number' || type === 'integer') {
		return 0;
	}

	if (type === 'boolean') {
		return false;
	}

	if (type === 'null') {
		return null;
	}

	return null;
};

const lastWinsHandles = (wired: unknown): readonly ToolHandle[] => {
	const flattened = Array.isArray(wired)
		? flattenToolHandles(wired)
		: flattenToolHandles(
				wired === undefined || wired === null ? [] : [wired],
			);
	const byId = new Map<string, ToolHandle>();
	for (const handle of flattened) {
		byId.set(handle.toolId, handle);
	}

	return [...byId.values()];
};

const formatOneTool = (handle: ToolHandle): string => {
	const lines = [handle.toolId];
	const description = handle.description.trim();
	if (description.length > 0) {
		lines.push(description);
	}

	lines.push('');
	lines.push(JSON.stringify(exampleFromSchema(handle.inputSchema), null, 2));
	// MCP `buildMcpHandle` copies `tools/list` `inputSchema` as-is (enum,
	// property descriptions, required). Placeholders above drop that; dump
	// the schema so inspect is usable without reading the MCP server.
	lines.push('');
	lines.push(JSON.stringify(handle.inputSchema, null, 2));

	return lines.join('\n');
};

/**
 * Human-readable dump of wired tool handles: id, description, example args
 * JSON, then the full `inputSchema`. Drops `invoke`. Duplicate `toolId`
 * last-wins. Junk values skipped. Empty `toolIdFilter` keeps every handle;
 * a non-empty filter keeps ids/names that equal or contain it
 * (case-insensitive), so the dump can stay one tool instead of the pack.
 */
export const formatToolInspectText = (
	wired: unknown,
	toolIdFilter?: unknown,
): string => {
	const handles = lastWinsHandles(wired);
	const needle = String(toolIdFilter ?? '').trim();
	const filtered =
		needle.length === 0
			? handles
			: handles.filter((handle) => matchesToolIdFilter(handle, needle));
	if (filtered.length === 0) {
		return needle.length === 0
			? EMPTY_TOOL_INSPECT_TEXT
			: unmatchedToolInspectText(needle);
	}

	return filtered.map(formatOneTool).join('\n\n---\n\n');
};
