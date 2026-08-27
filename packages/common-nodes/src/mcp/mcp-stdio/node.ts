import {
	defineReactiveNode,
	withLoading,
	TOOL_HANDLE_WIRE_TYPE,
	type ToolHandle,
} from '@langflower/node-sdk';
import { buildMcpHandle } from '@langflower/tools/build-mcp-handle';
import { formatMcpConnectError } from '@langflower/tools/format-mcp-connect-error';
import { connectMcpStdioFromCli } from '@langflower/tools/mcp-stdio-client';
import { distinctUntilChanged, filter, Observable, switchMap } from 'rxjs';

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
 * Owns stdio MCP connect/close; emits live {@link ToolHandle}[] for LLM `tools`.
 * Server name and tools come from MCP initialize / tools/list. Session stays
 * in invoke closures. Connect/initialize/build failure → output port **error**
 * (not silent EMPTY).
 */
export const mcpStdioNode = defineReactiveNode({
	type: 'common-mcp-stdio',
	displayName: 'MCP stdio',
	category: 'Tools',
	description: `
Launch an MCP server from a command and give its tools to an agent.

Typical uses:
- Local stdio MCP (filesystem, browser, …)
- Extra tools without writing a custom node
`.trim(),
	uiSchema: [] as const,
	bind(ctx, { makeInput, configureOutput, combineInputs }) {
		const command = makeInput<string>('command', {
			name: 'command',
			wireType: 'string',
			inline: 'text',
			defaultValue: '',
			required: true,
		});

		const params$ = combineInputs(
			[ctx, command],
			([ec, cli]) =>
				({
					nodeId: String(ec.nodeId ?? ''),
					projectDir: String(ec.projectDir ?? ''),
					command: String(cli ?? '').trim(),
				}) satisfies StdioParams,
		).pipeValue(
			distinctUntilChanged(
				(left, right) => paramsKey(left) === paramsKey(right),
			),
		);
		const handle$ = params$
			.pipeValue(
				filter(
					(params) =>
						params.command.length > 0 &&
						params.nodeId.trim().length > 0,
				),
			)
			.pipe(withLoading())
			.pipeValue(
				switchMap(
					(params) =>
						new Observable<readonly ToolHandle[]>((subscriber) => {
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

								const tools = await buildMcpHandle({ client });

								if (closed) {
									await client.close();
									return;
								}

								subscriber.next(tools);
							};

							void run().catch(fail);

							return () => {
								closed = true;
								void closeClient?.();
							};
						}),
				),
			);

		return {
			inputs: [command],
			outputs: [
				configureOutput('tools', handle$, {
					wireType: TOOL_HANDLE_WIRE_TYPE,
				}),
			],
		};
	},
});
