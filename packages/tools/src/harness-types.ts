/**
 * Shared harness / MCP invoke shapes — one owner inside `@langflower/tools`.
 */

import type { WebFetchRequest, WebFetchResult } from './create-web-fetch.js';

export type ToolInvokeResult =
	| { readonly ok: true; readonly text: string }
	| { readonly ok: false; readonly text: string };

export type ToolInvokeCall = {
	readonly toolId: string;
	readonly args: Readonly<Record<string, unknown>>;
};

export type BuiltinToolRegistration = {
	readonly toolId: string;
	readonly name: string;
	readonly description: string;
	readonly inputSchema: object;
};

/**
 * Project harness surface (builtins + optional webFetch).
 * MCP tools are not on the harness — agents consume wired `McpHandle` values.
 */
export type Harness = {
	readonly invoke: (call: ToolInvokeCall) => Promise<ToolInvokeResult>;
	readonly listBuiltinRegistrations: () => readonly BuiltinToolRegistration[];
	readonly authorize?: (call: ToolInvokeCall) => Promise<'allow' | 'deny'>;
	readonly webFetch?: (request: WebFetchRequest) => Promise<WebFetchResult>;
};
