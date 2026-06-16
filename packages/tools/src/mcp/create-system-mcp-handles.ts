import { connectMcpHttpWithOptionalLaunch } from './mcp-http-client.js';
import { connectMcpStdioFromCli } from './mcp-stdio-client.js';
import { isValidMcpServerId } from './mcp-tool-id.js';
import { buildMcpHandle, type BuiltMcpHandle } from './build-mcp-handle.js';
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
};

export type SystemMcpServerEntry = SystemMcpStdioEntry | SystemMcpHttpEntry;

export type SystemMcpConnectFailure = {
	readonly serverId: string;
	readonly message: string;
};

export type SystemMcpHandles = {
	readonly handles: readonly BuiltMcpHandle[];
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
}): Promise<SystemMcpHandles> => {
	const closers: Array<() => Promise<void>> = [];
	const handles: BuiltMcpHandle[] = [];
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

				handles.push(
					await buildMcpHandle({
						id,
						...(entry.toolNames !== undefined
							? { toolNamesRaw: entry.toolNames }
							: {}),
						client,
					}),
				);
				continue;
			}

			const url = entry.url.trim();

			if (url.length === 0) {
				continue;
			}

			const session = await connectMcpHttpWithOptionalLaunch({
				url,
				cwd: options.projectRoot,
				...(entry.command !== undefined &&
				entry.command.trim().length > 0
					? { command: entry.command.trim() }
					: {}),
			});
			closers.push(() => session.close());

			handles.push(
				await buildMcpHandle({
					id,
					...(entry.toolNames !== undefined
						? { toolNamesRaw: entry.toolNames }
						: {}),
					client: session.client,
				}),
			);
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

/** Ready handles whose ids are enabled on this agent instance. */
export const filterMcpHandlesByIds = <T extends { readonly id: string }>(
	handles: readonly T[],
	enabledMcpIds: readonly string[],
): readonly T[] => {
	if (enabledMcpIds.length === 0) {
		return [];
	}

	const allowed = new Set(enabledMcpIds);

	return handles.filter((handle) => allowed.has(handle.id));
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
