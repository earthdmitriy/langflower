import type { RuntimeRunnerEvent } from '@langflower/runtime';
import { bridgeEmit } from './bridge-outbound.js';
import type { LangflowerBridge } from './langflower-bridge.types.js';

/** Fan-out runner telemetry to every connected tab (session-shared). */
export const forwardRunnerEvent = (
	bridge: LangflowerBridge,
	event: RuntimeRunnerEvent,
): void => {
	switch (event.kind) {
		case 'output-emitted':
			bridgeEmit(bridge, 'runner.output-emitted', event);
			break;
		case 'input-received':
			bridgeEmit(bridge, 'runner.input-received', event);
			break;
		case 'done':
			bridgeEmit(bridge, 'runner.done', event);
			break;
		default:
			break;
	}
};
