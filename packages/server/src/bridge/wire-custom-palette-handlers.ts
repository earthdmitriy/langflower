import type { Subscription } from 'rxjs';
import type { ServerContext } from '../server-context.js';
import { bridgeEmit } from './bridge-outbound.js';
import { isInboundEvent } from './inbound-guards.js';
import type { LangflowerBridge } from './langflower-bridge.types.js';

export const wireCustomPaletteHandlers = (
	bridge: LangflowerBridge,
	context: ServerContext,
): Subscription =>
	bridge['customPalette.update.requested'].subscribe(async (raw) => {
		if (!isInboundEvent<Record<string, never>>(raw)) {
			return;
		}

		bridgeEmit(
			bridge,
			'customPalette.snapshot',
			context.customPaletteService.compilingSnapshot(),
		);

		const snapshot = await context.customPaletteService.update(
			context.projectDir,
		);
		bridgeEmit(bridge, 'customPalette.snapshot', snapshot);
	});
