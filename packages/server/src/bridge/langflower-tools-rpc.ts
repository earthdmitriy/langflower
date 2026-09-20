import { waitBusEvent } from '@langflower/shared/langflower-ws-waits';
import type {
	CustomPaletteSnapshotPayload,
	CustomPaletteUpdateRequestedPayload,
} from '@langflower/shared/types/langflower-custom-palette.js';
import type { LangflowerBusRequest } from '@langflower/common-nodes/run-host-services';
import type { LangflowerBridge } from './langflower-bridge.types.js';

/**
 * In-process bus intents this pack may emit. Compile only for now.
 * Later: `editor.addNode.requested`, `editor.removeNode.requested`,
 * `editor.addEdge.requested`, `editor.removeEdge.requested`.
 */
const LANGFLOWER_TOOLS_INTENTS = ['customPalette.update.requested'] as const;

type LangflowerToolsIntent = (typeof LANGFLOWER_TOOLS_INTENTS)[number];

const isAllowedIntent = (intent: string): intent is LangflowerToolsIntent =>
	(LANGFLOWER_TOOLS_INTENTS as readonly string[]).includes(intent);

/**
 * Wait-then-emit RPC (MCP `emitAction` shape) over the **server** bridge.
 * Does not import `@langflower/mcp`.
 */
export const createLangflowerToolsRpc = (
	bridge: LangflowerBridge,
): LangflowerBusRequest => {
	return async (intent, payload) => {
		if (!isAllowedIntent(intent)) {
			throw new Error(
				`Langflower Tools does not allow intent: ${intent}`,
			);
		}

		const body: Record<string, unknown> =
			payload !== null &&
			typeof payload === 'object' &&
			!Array.isArray(payload)
				? (payload as Record<string, unknown>)
				: {};
		const existingRequestId = body['requestId'];
		const requestId =
			typeof existingRequestId === 'string' &&
			existingRequestId.length > 0
				? existingRequestId
				: crypto.randomUUID();
		const resultPromise = waitBusEvent(bridge['customPalette.snapshot'], {
			predicate: (snapshot: CustomPaletteSnapshotPayload) =>
				snapshot.requestId === requestId &&
				snapshot.status !== 'compiling',
		});
		bridge.injectInbound(
			intent,
			{ ...body, requestId } as CustomPaletteUpdateRequestedPayload,
			'langflower-tools',
		);
		return resultPromise;
	};
};
