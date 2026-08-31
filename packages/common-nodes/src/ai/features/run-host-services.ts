/**
 * Server/runtime-only bag attached via {@link runHostServicesSymbol}.
 * Not part of public ExecutionContext — specialized LLM wiring closes over
 * this, not author Caps.
 */
import type { ToolHandle } from '@langflower/node-sdk';
import type { ToolInvokeCall } from '@langflower/tools/create-project-harness';
import type { ToolHandlerContext } from '@langflower/tools/domain-tool-configs';
import type { PermissionAskRequest } from '@langflower/tools/permission';
import type { CreateChatCompletionStream } from './chat-completion-stream.js';
import type { CreateEmbedding } from '../../embeddings/create-embedding.js';

export const runHostServicesSymbol = Symbol('langflower.runHostServices');

export type LangflowerBusRequest = (
	intent: string,
	payload: unknown,
) => Promise<unknown>;

export type RunHostServices = {
	readonly createChatCompletionStream?: CreateChatCompletionStream;
	readonly createEmbedding?: CreateEmbedding;
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
	/**
	 * Parsed effective `LangflowerConfig.embedding` (`providerId/modelId`).
	 * Empty embed-node `providerId` / `model` params fall back to these.
	 */
	readonly defaultEmbedding?: {
		readonly providerId: string;
		readonly model: string;
	};
	/** User-global KV secrets for `{lf_secrets:ID}` (MCP HTTP headers). */
	readonly secrets?: Readonly<Record<string, string>>;
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
	/**
	 * In-process bus RPC for Langflower Tools only (compile / later editor
	 * intents). Missing on LLM and other catalog nodes.
	 */
	readonly requestLangflowerBus?: LangflowerBusRequest;
	/**
	 * Read current editor source `tools` outputs for this agent (post-swap).
	 * Missing outside a Langflower server run.
	 */
	readonly getLiveWiredTools?: (agentNodeId: string) => readonly ToolHandle[];
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

/**
 * LLM `toolCtx`: identity + permission/path fields only.
 * Does **not** attach {@link RunHostServices} — bus RPC and live inventory
 * stay on the tools / LLM node ExecutionContext, not on agent invoke ctx.
 */
export const buildAgentToolCtx = (
	identity: {
		readonly projectDir: string;
		readonly runId: string;
	},
	hostServices: RunHostServices | undefined,
): ToolHandlerContext => ({
	projectDir: identity.projectDir,
	runId: identity.runId,
	...(hostServices?.authorize !== undefined
		? { authorize: hostServices.authorize }
		: {}),
	...(hostServices?.denyPaths !== undefined
		? { denyPaths: hostServices.denyPaths }
		: {}),
	...(hostServices?.allowedHosts !== undefined
		? { allowedHosts: hostServices.allowedHosts }
		: {}),
});
