import type {
	RuntimeOutputEmittedEvent,
	RuntimeRunnerEvent,
} from '@langflower/runtime';
import { Subject } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { forwardRunnerEvent } from './forward-runner-event.js';
import type { LangflowerBridge } from './langflower-bridge.types.js';

/**
 * Unit test: `forwardRunnerEvent` passes `pending` output-emitted events via
 * `bridgeEmit` (session-shared fan-out). See `BRIDGE.md`.
 */

type BridgeChannels = {
	readonly 'runner.output-emitted': Subject<RuntimeOutputEmittedEvent>;
	readonly 'runner.input-received': Subject<RuntimeRunnerEvent>;
	readonly 'runner.done': Subject<RuntimeRunnerEvent>;
};

const asBridge = (channels: BridgeChannels): LangflowerBridge =>
	channels as unknown as LangflowerBridge;

const createMockBridge = (): BridgeChannels => ({
	'runner.output-emitted': new Subject<RuntimeOutputEmittedEvent>(),
	'runner.input-received': new Subject<RuntimeRunnerEvent>(),
	'runner.done': new Subject<RuntimeRunnerEvent>(),
});

const createPendingEvent = (
	overrides: Partial<RuntimeOutputEmittedEvent> = {},
): RuntimeOutputEmittedEvent => ({
	kind: 'output-emitted',
	runId: 'run-1' as import('@langflower/runtime').RunId,
	nodeId: 'delay-1' as import('@langflower/runtime').NodeId,
	portId: 'value',
	portIdx: 0,
	edgeIds: [],
	state: 'pending',
	value: undefined,
	...overrides,
});

describe('forwardRunnerEvent — pending events', () => {
	it('forwards output-emitted with state=pending via bridge', () => {
		const bridge = createMockBridge();
		const received: RuntimeOutputEmittedEvent[] = [];
		const sub = bridge['runner.output-emitted'].subscribe((event) => {
			received.push(event);
		});

		const event = createPendingEvent();
		forwardRunnerEvent(asBridge(bridge), event);

		expect(received).toHaveLength(1);
		expect(received[0]!.state).toBe('pending');
		expect(received[0]!.nodeId).toBe('delay-1');
		expect(received[0]!.kind).toBe('output-emitted');

		sub.unsubscribe();
	});

	it('forwards output-emitted with state=value via bridge', () => {
		const bridge = createMockBridge();
		const received: RuntimeOutputEmittedEvent[] = [];
		const sub = bridge['runner.output-emitted'].subscribe((event) => {
			received.push(event);
		});

		const event = createPendingEvent({ state: 'value', value: 'result' });
		forwardRunnerEvent(asBridge(bridge), event);

		expect(received).toHaveLength(1);
		expect(received[0]!.state).toBe('value');
		expect(received[0]!.value).toBe('result');

		sub.unsubscribe();
	});

	it('forwards pending then value in order', () => {
		const bridge = createMockBridge();
		const received: RuntimeOutputEmittedEvent[] = [];
		const sub = bridge['runner.output-emitted'].subscribe((event) => {
			received.push(event);
		});

		forwardRunnerEvent(asBridge(bridge), createPendingEvent());
		forwardRunnerEvent(
			asBridge(bridge),
			createPendingEvent({ state: 'value', value: 'done' }),
		);

		expect(received).toHaveLength(2);
		expect(received.map((e) => e.state)).toEqual(['pending', 'value']);

		sub.unsubscribe();
	});

	it('does not forward pending events to runner.done channel', () => {
		const bridge = createMockBridge();
		const doneReceived: RuntimeRunnerEvent[] = [];
		const sub = bridge['runner.done'].subscribe((event) => {
			doneReceived.push(event);
		});

		forwardRunnerEvent(asBridge(bridge), createPendingEvent());

		expect(doneReceived).toHaveLength(0);

		sub.unsubscribe();
	});

	it('runtime events$ → forwardRunnerEvent → bridge channel wiring', () => {
		const runtimeEvents$ = new Subject<RuntimeRunnerEvent>();
		const bridge = createMockBridge();
		const received: RuntimeOutputEmittedEvent[] = [];

		const sub = runtimeEvents$.subscribe((event) => {
			forwardRunnerEvent(asBridge(bridge), event);
		});

		const bridgeSub = bridge['runner.output-emitted'].subscribe((event) => {
			received.push(event);
		});

		runtimeEvents$.next(createPendingEvent());
		runtimeEvents$.next(
			createPendingEvent({ state: 'value', value: 'through-delay' }),
		);

		expect(received).toHaveLength(2);
		expect(received[0]!.state).toBe('pending');
		expect(received[1]!.state).toBe('value');
		expect(received[1]!.value).toBe('through-delay');

		bridgeSub.unsubscribe();
		sub.unsubscribe();
	});
});
