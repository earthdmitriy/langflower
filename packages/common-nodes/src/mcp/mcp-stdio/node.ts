import { defineReactiveNode } from '@langflower/node-sdk';
import { MCP_HANDLE_WIRE_TYPE, type McpHandle } from '@langflower/node-sdk/mcp';
import { buildMcpHandle } from '@langflower/tools/build-mcp-handle';
import { formatMcpConnectError } from '@langflower/tools/format-mcp-connect-error';
import { connectMcpStdioFromCli } from '@langflower/tools/mcp-stdio-client';
import { distinctUntilChanged, EMPTY, Observable, pipe, switchMap } from 'rxjs';

type StdioParams = {
	readonly nodeId: string;
	readonly projectDir: string;
	readonly command: string;
};

const paramsKey = (params: StdioParams): string =>
	JSON.stringify({
		nodeId: params.nodeId,
		projectDir: params.projectDir,
		command: params.command,
	});

/**
 * Owns stdio MCP connect/close; emits live {@link McpHandle} for LLM `mcp`.
 * Handle id = graph nodeId; server name and tools come from MCP initialize /
 * tools/list. Connect/initialize/build failure → output port **error** (not
 * silent EMPTY).
 */
export const mcpStdioNode = defineReactiveNode({
	type: 'common-mcp-stdio',
	displayName: 'MCP stdio',
	category: 'Tools',
	description:
		'Launches an MCP server over stdio from a shell command line and emits a live handle for LLM `mcp` ports.',
	uiSchema: [] as const,
	bind(ctx, { makeInput, configureOutput, combineInputs }) {
		const command = makeInput<string>('command', {
			name: 'command',
			wireType: 'string',
			inline: 'text',
			defaultValue: '',
			required: true,
		});

		const handle$ = combineInputs(
			[ctx, command],
			([ec, cli]) =>
				({
					nodeId: String(ec.nodeId ?? ''),
					projectDir: String(ec.projectDir ?? ''),
					command: String(cli ?? '').trim(),
				}) satisfies StdioParams,
		).pipeValue(
			pipe(
				distinctUntilChanged(
					(left, right) => paramsKey(left) === paramsKey(right),
				),
				switchMap((params) => {
					if (
						params.command.length === 0 ||
						params.nodeId.trim().length === 0
					) {
						return EMPTY;
					}

					return new Observable<McpHandle>((subscriber) => {
						let closed = false;
						let closeClient: (() => Promise<void>) | undefined;

						const fail = (cause: unknown): void => {
							if (closed || subscriber.closed) {
								return;
							}

							subscriber.error(
								formatMcpConnectError(cause, {
									nodeId: params.nodeId,
									kind: 'stdio',
									target: params.command,
								}),
							);
						};

						const run = async (): Promise<void> => {
							const client = await connectMcpStdioFromCli({
								commandLine: params.command,
								...(params.projectDir.length > 0
									? { cwd: params.projectDir }
									: {}),
							});
							closeClient = () => client.close();

							if (closed) {
								await client.close();
								return;
							}

							const handle = await buildMcpHandle({
								id: params.nodeId,
								client,
							});

							if (closed) {
								await client.close();
								return;
							}

							subscriber.next(handle);
						};

						void run().catch(fail);

						return () => {
							closed = true;
							void closeClient?.();
						};
					});
				}),
			),
		);

		return {
			inputs: [command],
			outputs: [
				configureOutput('mcpTransport', handle$, {
					wireType: MCP_HANDLE_WIRE_TYPE,
				}),
			],
		};
	},
});
