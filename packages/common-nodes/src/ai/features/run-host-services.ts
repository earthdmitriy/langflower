/**
 * Server/runtime-only bag attached via {@link runHostServicesSymbol}.
 * Not part of public ExecutionContext — specialized LLM wiring closes over
 * this, not author Caps.
 */
import type { ToolInvokeCall } from '@langflower/tools/create-project-harness';
import type { PermissionAskRequest } from '@langflower/tools/permission';
import type { CreateChatCompletionStream } from './chat-completion-stream.js';

export const runHostServicesSymbol = Symbol('langflower.runHostServices');

export type RunHostServices = {
	readonly createChatCompletionStream?: CreateChatCompletionStream;
	readonly skillMarkdown?: string;
	readonly agentsMarkdown?: string;
	/**
	 * Parsed effective `LangflowerConfig.model` (`providerId/modelId`).
	 * Empty node `providerId` / `model` params fall back to these at run time.
	 */
	readonly defaultChat?: {
		readonly providerId: string;
		readonly model: string;
	};
	readonly authorize?: (call: ToolInvokeCall) => Promise<'allow' | 'deny'>;
	/**
	 * Direct HITL ask (tool gates + agent limit continue). Bypasses permission
	 * config / grant cache — always surfaces `runner.permission.ask`.
	 */
	readonly requestPermission?: (
		request: PermissionAskRequest,
	) => Promise<'allow' | 'deny'>;
	readonly denyPaths?: readonly string[];
	readonly allowedHosts?: readonly string[];
};

export const attachRunHostServices = <T extends object>(
	ctx: T,
	services: RunHostServices,
): T =>
	Object.assign(ctx, {
		[runHostServicesSymbol]: services,
	}) as T;

export const getRunHostServices = (
	ctx: object,
): RunHostServices | undefined => {
	const bag = (ctx as Record<symbol, unknown>)[runHostServicesSymbol];
	if (bag === undefined || typeof bag !== 'object' || bag === null) {
		return undefined;
	}
	return bag as RunHostServices;
};
