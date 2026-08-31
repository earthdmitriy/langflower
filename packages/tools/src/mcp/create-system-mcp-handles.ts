import type { ToolHandle } from '@langflower/node-sdk';
import { connectMcpHttpWithOptionalLaunch } from './mcp-http-client.js';
import { resolveMcpHttpHeaders } from './resolve-mcp-http-headers.js';
import { connectMcpStdioFromCli } from './mcp-stdio-client.js';
import { isValidMcpServerId } from './mcp-tool-id.js';
import { buildMcpHandle } from './build-mcp-handle.js';
import { formatMcpConnectError } from './format-mcp-connect-error.js';

/**
 * Structural twin of shared `LangflowerMcp*ServerConfig` (tools cannot import
 * `@langflower/shared`). Keep fields in sync with CONFIG / MCP nodes.
 * Server display name comes from MCP initialize, not author config.
 */
export type SystemMcpStdioEntry = {
	readonly kind: 'stdio';
	readonly command: string;
	readonly toolNames?: string;
};

/** @see SystemMcpStdioEntry */
export type SystemMcpHttpEntry = {
	readonly kind: 'http';
	readonly url: string;
	readonly command?: string;
	readonly toolNames?: string;
	readonly headers?: Readonly<Record<string, string>>;
};

export type SystemMcpServerEntry = SystemMcpStdioEntry | SystemMcpHttpEntry;

export type SystemMcpConnectFailure = {
	readonly serverId: string;
	readonly message: string;
};

/** Jsonc server key plus bound tools — not an author SDK type. */
export type SystemMcpServerTools = {
	readonly serverId: string;
	readonly tools: readonly ToolHandle[];
};

export type SystemMcpHandles = {
	readonly handles: readonly SystemMcpServerTools[];
	readonly failures: readonly SystemMcpConnectFailure[];
	readonly close: () => Promise<void>;
};

/**
 * Connect system MCP servers (same connect/build path as MCP stdio/http nodes).
 * Only `serverIds` that exist in `servers` are opened.
 * Per-server connect/build failures are recorded; successful servers stay open.
 */
export const createSystemMcpHandles = async (options: {
	readonly projectRoot: string;
	readonly serverIds: readonly string[];
	readonly servers: Readonly<Record<string, SystemMcpServerEntry>>;
	readonly secrets?: Readonly<Record<string, string>>;
}): Promise<SystemMcpHandles> => {
	const closers: Array<() => Promise<void>> = [];
	const handles: SystemMcpServerTools[] = [];
	const failures: SystemMcpConnectFailure[] = [];

	const closeAll = async (): Promise<void> => {
		for (const closer of [...closers].reverse()) {
			await closer();
		}
	};

	for (const rawId of options.serverIds) {
		const id = rawId.trim();

		if (!isValidMcpServerId(id)) {
			continue;
		}

		const entry = options.servers[id];

		if (entry === undefined) {
			continue;
		}

		try {
			if (entry.kind === 'stdio') {
				const command = entry.command.trim();

				if (command.length === 0) {
					continue;
				}

				const client = await connectMcpStdioFromCli({
					commandLine: command,
					cwd: options.projectRoot,
				});
				closers.push(() => client.close());

				handles.push({
					serverId: id,
					tools: await buildMcpHandle({
						...(entry.toolNames !== undefined
							? { toolNamesRaw: entry.toolNames }
							: {}),
						client,
					}),
				});
				continue;
			}

			const url = entry.url.trim();

			if (url.length === 0) {
				continue;
			}

			const resolvedHeaders = resolveMcpHttpHeaders(entry.headers, {
				secrets: options.secrets ?? {},
			});
			if (!resolvedHeaders.ok) {
				throw new Error(resolvedHeaders.message);
			}

			const session = await connectMcpHttpWithOptionalLaunch({
				url,
				cwd: options.projectRoot,
				...(entry.command !== undefined &&
				entry.command.trim().length > 0
					? { command: entry.command.trim() }
					: {}),
				...(Object.keys(resolvedHeaders.headers).length > 0
					? { headers: resolvedHeaders.headers }
					: {}),
			});
			closers.push(() => session.close());

			handles.push({
				serverId: id,
				tools: await buildMcpHandle({
					...(entry.toolNames !== undefined
						? { toolNamesRaw: entry.toolNames }
						: {}),
					client: session.client,
				}),
			});
		} catch (cause) {
			failures.push({
				serverId: id,
				message: formatMcpConnectError(cause, {
					nodeId: id,
					kind: 'system',
					target:
						entry.kind === 'stdio'
							? entry.command.trim()
							: entry.url.trim(),
				}).message,
			});
		}
	}

	return {
		handles,
		failures,
		close: closeAll,
	};
};

export const parseEnabledMcpIds = (value: unknown): readonly string[] => {
	if (!Array.isArray(value)) {
		return [];
	}

	return value
		.map(String)
		.map((id) => id.trim())
		.filter((id) => isValidMcpServerId(id));
};

/** Union of `enabledMcpIds` across workflow nodes (Inspector system MCP). */
export const collectEnabledMcpIdsFromNodes = (
	nodes: ReadonlyArray<{
		readonly params: Readonly<Record<string, unknown>>;
	}>,
): readonly string[] => {
	const ids = new Set<string>();

	for (const node of nodes) {
		for (const id of parseEnabledMcpIds(node.params.enabledMcpIds)) {
			ids.add(id);
		}
	}

	return [...ids];
};

/** Ready server bags whose jsonc ids are enabled on this agent instance. */
export const filterSystemMcpToolsByServerIds = (
	handles: readonly SystemMcpServerTools[],
	enabledMcpIds: readonly string[],
): readonly SystemMcpServerTools[] => {
	if (enabledMcpIds.length === 0) {
		return [];
	}

	const allowed = new Set(enabledMcpIds);

	return handles.filter((handle) => allowed.has(handle.serverId));
};

/** Failures that intersect this node's Inspector `enabledMcpIds`. */
export const filterMcpFailuresForNode = (
	failures: readonly SystemMcpConnectFailure[],
	enabledMcpIds: readonly string[],
): readonly SystemMcpConnectFailure[] => {
	if (failures.length === 0 || enabledMcpIds.length === 0) {
		return [];
	}

	const allowed = new Set(enabledMcpIds);

	return failures.filter((failure) => allowed.has(failure.serverId));
};
