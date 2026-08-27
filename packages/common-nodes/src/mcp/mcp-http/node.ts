import {
	defineReactiveNode,
	withLoading,
	TOOL_HANDLE_WIRE_TYPE,
	type ToolHandle,
} from '@langflower/node-sdk';
import { buildMcpHandle } from '@langflower/tools/build-mcp-handle';
import { formatMcpConnectError } from '@langflower/tools/format-mcp-connect-error';
import { connectMcpHttpWithOptionalLaunch } from '@langflower/tools/mcp-http-client';
import { distinctUntilChanged, filter, Observable, switchMap } from 'rxjs';

type HttpParams = {
	readonly nodeId: string;
	readonly projectDir: string;
	readonly url: string;
	readonly command: string;
};

const paramsKey = (params: HttpParams): string =>
	JSON.stringify({
		nodeId: params.nodeId,
		projectDir: params.projectDir,
		url: params.url,
		command: params.command,
	});

/**
 * Owns HTTP MCP connect/close (optional local launch); emits live
 * {@link ToolHandle}[] for LLM `tools`. Server name and tools come from MCP
 * initialize / tools/list. Session stays in invoke closures.
 * Connect/initialize/build failure → output port **error** (not silent EMPTY).
 */
export const mcpHttpNode = defineReactiveNode({
	type: 'common-mcp-http',
	displayName: 'MCP http',
	category: 'Tools',
	description: `
Connect to an MCP server over HTTP and give its tools to an agent.

Paste a URL for a server that is already running, or set a launch command to start one first.
`.trim(),
	uiSchema: [] as const,
	bind(ctx, { makeInput, configureOutput, combineInputs }) {
		const url = makeInput<string>('url', {
			name: 'url',
			wireType: 'string',
			inline: 'text',
			defaultValue: '',
			required: true,
		});
		const command = makeInput<string>('command', {
			name: 'command',
			wireType: 'string',
			inline: 'text',
			defaultValue: '',
		});

		const params$ = combineInputs(
			[ctx, url, command],
			([ec, serverUrl, cli]) =>
				({
					nodeId: String(ec.nodeId ?? ''),
					projectDir: String(ec.projectDir ?? ''),
					url: String(serverUrl ?? '').trim(),
					command: String(cli ?? '').trim(),
				}) satisfies HttpParams,
		).pipeValue(
			distinctUntilChanged(
				(left, right) => paramsKey(left) === paramsKey(right),
			),
		);
		const handle$ = params$
			.pipeValue(
				filter(
					(params) =>
						params.url.length > 0 &&
						params.nodeId.trim().length > 0,
				),
			)
			.pipe(withLoading())
			.pipeValue(
				switchMap(
					(params) =>
						new Observable<readonly ToolHandle[]>((subscriber) => {
							let closed = false;
							let closeSession: (() => Promise<void>) | undefined;

							const fail = (cause: unknown): void => {
								if (closed || subscriber.closed) {
									return;
								}

								subscriber.error(
									formatMcpConnectError(cause, {
										nodeId: params.nodeId,
										kind: 'http',
										target: params.url,
									}),
								);
							};

							const run = async (): Promise<void> => {
								const session =
									await connectMcpHttpWithOptionalLaunch({
										url: params.url,
										...(params.command.length > 0
											? { command: params.command }
											: {}),
										...(params.projectDir.length > 0
											? { cwd: params.projectDir }
											: {}),
									});
								closeSession = () => session.close();

								if (closed) {
									await session.close();
									return;
								}

								const tools = await buildMcpHandle({
									client: session.client,
								});

								if (closed) {
									await session.close();
									return;
								}

								subscriber.next(tools);
							};

							void run().catch(fail);

							return () => {
								closed = true;
								void closeSession?.();
							};
						}),
				),
			);

		return {
			inputs: [url, command],
			outputs: [
				configureOutput('tools', handle$, {
					wireType: TOOL_HANDLE_WIRE_TYPE,
				}),
			],
		};
	},
});
