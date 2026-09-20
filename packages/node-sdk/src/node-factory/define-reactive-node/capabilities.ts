import type { ToolHandle } from '../define-tool-registrations/tool-handle.js';

export const NODE_CAPABILITY_IDS = [
	'chat',
	'embed',
	'tools',
	'paths',
	'hosts',
	'secrets',
	'promptContext',
	'permissionAsk',
	'liveTools',
	'editorBus',
	'authorize',
] as const;

export type NodeCapabilityId = (typeof NODE_CAPABILITY_IDS)[number];

export const LLM_REQUIRED_CAPABILITIES = [
	'chat',
	'tools',
	'promptContext',
	'permissionAsk',
	'liveTools',
	'paths',
	'hosts',
	'authorize',
] as const;

export type LlmRequiredCapabilityId =
	(typeof LLM_REQUIRED_CAPABILITIES)[number];

type UnionToIntersection<U> = (
	U extends unknown ? (k: U) => void : never
) extends (k: infer I) => void
	? I
	: never;

/**
 * Capability-field contracts for {@link CapsFor}. Structural so host
 * factories (common-nodes chat / embed) assign without relocating those
 * implementations into this package.
 */
export type CapabilityFields = {
	readonly chat: {
		readonly chat: CapabilityChat;
	};
	readonly embed: {
		readonly embed: CapabilityEmbed;
		readonly defaultEmbedding?: {
			readonly providerId: string;
			readonly model: string;
		};
	};
	readonly tools: {
		readonly toolHandles: readonly ToolHandle[];
	};
	readonly paths: {
		readonly denyPaths: readonly string[];
	};
	readonly hosts: {
		readonly allowedHosts: readonly string[];
	};
	readonly secrets: {
		readonly secrets: Readonly<Record<string, string>>;
	};
	readonly promptContext: {
		readonly skillMarkdown: string;
		readonly agentsMarkdown: string;
		readonly defaultChat?: {
			readonly providerId: string;
			readonly model: string;
		};
	};
	readonly permissionAsk: {
		readonly requestPermission: CapabilityPermissionAsk;
	};
	readonly liveTools: {
		readonly getLiveWiredTools: (
			agentNodeId: string,
		) => readonly ToolHandle[];
	};
	readonly editorBus: {
		readonly requestLangflowerBus: CapabilityEditorBus;
	};
	readonly authorize: {
		readonly authorize: CapabilityAuthorize;
	};
};

export type CapabilityChat = (
	args: CapabilityChatArgs,
) => Promise<AsyncIterable<CapabilityChatChunk>>;

type CapabilityChatArgs = {
	readonly providerId: string;
	readonly model: string;
	readonly messages: readonly CapabilityChatMessage[];
	readonly tools?: readonly CapabilityChatToolDefinition[];
	readonly signal?: { readonly aborted: boolean };
	readonly frequency_penalty?: number;
	readonly presence_penalty?: number;
};

type CapabilityChatMessage =
	| {
			readonly role: 'system' | 'user';
			readonly content: string;
	  }
	| {
			readonly role: 'assistant';
			readonly content: string;
			readonly tool_calls?: readonly CapabilityChatToolCall[];
	  }
	| {
			readonly role: 'tool';
			readonly content: string;
			readonly tool_call_id: string;
	  };

type CapabilityChatToolCall = {
	readonly id: string;
	readonly name: string;
	readonly arguments: string;
};

type CapabilityChatToolDefinition = {
	readonly type: 'function';
	readonly function: {
		readonly name: string;
		readonly description?: string;
		readonly parameters?: object;
	};
};

type CapabilityChatChunk =
	| { readonly kind: 'reasoning'; readonly text: string }
	| { readonly kind: 'draft'; readonly text: string }
	| {
			readonly kind: 'done';
			readonly text: string;
			readonly tool_calls?: readonly CapabilityChatToolCall[];
			readonly finishReason?:
				'stop' | 'length' | 'tool_calls' | 'content_filter' | 'unknown';
	  };

export type CapabilityEmbed = (args: {
	readonly providerId: string;
	readonly model: string;
	readonly texts: readonly string[];
	readonly signal?: AbortSignal;
}) => Promise<{
	readonly dim: number;
	readonly vectors: readonly Float32Array[];
}>;

export type CapabilityPermissionAsk = (request: {
	readonly toolId: string;
	readonly detail: string;
	readonly summary: string;
}) => Promise<'allow' | 'deny'>;

export type CapabilityEditorBus = (
	intent: string,
	payload: unknown,
) => Promise<unknown>;

export type CapabilityAuthorize = (call: {
	readonly toolId: string;
	readonly args: Readonly<Record<string, unknown>>;
	readonly signal?: AbortSignal;
}) => Promise<'allow' | 'deny'>;

export type CapsFor<Ids extends readonly NodeCapabilityId[]> = object &
	([Ids[number]] extends [never]
		? Record<string, never>
		: UnionToIntersection<CapabilityFields[Ids[number]]>);

export const isNodeCapabilityId = (value: string): value is NodeCapabilityId =>
	(NODE_CAPABILITY_IDS as readonly string[]).includes(value);

export const uniqueCapabilityIds = (
	ids: readonly NodeCapabilityId[],
): readonly NodeCapabilityId[] => [...new Set(ids)];
