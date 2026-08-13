import {
	isPortTelemetry,
	isRuntimeDone,
	type RuntimeRunnerEvent,
} from '@langflower/runtime';
import { bridgeEmit } from './bridge-outbound.js';
import type { LangflowerBridge } from './langflower-bridge.types.js';

/** Fan-out runner telemetry to every connected tab (session-shared). */
export const forwardRunnerEvent = (
	bridge: LangflowerBridge,
	event: RuntimeRunnerEvent,
): void => {
	if (isPortTelemetry(event)) {
		bridgeEmit(bridge, 'runner.port', event);
		return;
	}

	if (isRuntimeDone(event)) {
		bridgeEmit(bridge, 'runner.done', event);
	}
};
