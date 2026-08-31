import type { CustomPaletteUpdateRequestedPayload } from '@langflower/shared/langflower.js';
import type { Subscription } from 'rxjs';
import { compileAndHotSwapCustomNodes } from '../palette/compile-and-hot-swap-custom-nodes.js';
import type { ServerContext } from '../server-context.js';
import type { LangflowerSession } from '../session/langflower-session.js';
import { isInboundEvent } from './inbound-guards.js';
import type { LangflowerBridge } from './langflower-bridge.types.js';

export const wireCustomPaletteHandlers = (
	bridge: LangflowerBridge,
	context: ServerContext,
	session: LangflowerSession,
): Subscription =>
	bridge['customPalette.update.requested'].subscribe(async (raw) => {
		if (!isInboundEvent<CustomPaletteUpdateRequestedPayload>(raw)) {
			return;
		}

		await compileAndHotSwapCustomNodes(session, context, bridge, {
			force: raw.payload.force === true,
		});
	});
