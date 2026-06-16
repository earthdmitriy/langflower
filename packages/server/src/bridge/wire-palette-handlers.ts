import type { Subscription } from 'rxjs';
import type { ServerContext } from '../server-context.js';
import { bridgeEmit } from './bridge-outbound.js';
import { isInboundEvent } from './inbound-guards.js';
import type { LangflowerBridge } from './langflower-bridge.types.js';

export const wirePaletteHandlers = (
	bridge: LangflowerBridge,
	context: ServerContext,
): Subscription =>
	bridge['palette.reload.requested'].subscribe(async (raw) => {
		if (!isInboundEvent<Record<string, never>>(raw)) {
			return;
		}

		const result = await context.paletteService.reload(context.projectDir);
		bridgeEmit(bridge, 'palette.snapshot', result.payload);
	});
