import type { CapabilityChat, ToolHandle } from '@langflower/node-sdk';

const HOST_BOUND_CHAT = Symbol.for('langflower.hostBoundChat');

const stubChatFactory: CapabilityChat = async () =>
	(async function* () {
		yield { kind: 'done' as const, text: '' };
	})();

Object.defineProperty(stubChatFactory, HOST_BOUND_CHAT, { value: true });

export const testLlmCapFields = (options?: {
	readonly chat?: CapabilityChat;
	readonly toolHandles?: readonly ToolHandle[];
	readonly skillMarkdown?: string;
	readonly agentsMarkdown?: string;
	readonly authorize?: (call: {
		readonly toolId: string;
		readonly args: Readonly<Record<string, unknown>>;
	}) => Promise<'allow' | 'deny'>;
	readonly requestPermission?: () => Promise<'allow' | 'deny'>;
}) => ({
	chat: options?.chat ?? stubChatFactory,
	toolHandles: options?.toolHandles ?? [],
	skillMarkdown: options?.skillMarkdown ?? '',
	agentsMarkdown: options?.agentsMarkdown ?? '',
	requestPermission:
		options?.requestPermission ?? (async () => 'deny' as const),
	getLiveWiredTools: () => [] as const,
	authorize: options?.authorize ?? (async () => 'allow' as const),
	denyPaths: [] as const,
	allowedHosts: [] as const,
});
