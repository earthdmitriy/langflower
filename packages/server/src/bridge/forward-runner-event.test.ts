import type { PortTelemetry, RuntimeRunnerEvent } from '@langflower/runtime';
import { Subject } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { forwardRunnerEvent } from './forward-runner-event.js';
import type { LangflowerBridge } from './langflower-bridge.types.js';

/**
 * Unit test: `forwardRunnerEvent` passes port tuples via
 * `bridgeEmit` (session-shared fan-out). See `BRIDGE.md`.
 */

type BridgeChannels = {
	readonly 'runner.port': Subject<PortTelemetry>;
	readonly 'runner.done': Subject<RuntimeRunnerEvent>;
};

const asBridge = (channels: BridgeChannels): LangflowerBridge =>
	channels as unknown as LangflowerBridge;

const createMockBridge = (): BridgeChannels => ({
	'runner.port': new Subject<PortTelemetry>(),
	'runner.done': new Subject<RuntimeRunnerEvent>(),
});

const createPendingEvent = (
	overrides: Partial<{
		response: PortTelemetry[3];
	}> = {},
): PortTelemetry => [
	'out',
	'delay-1' as import('@langflower/runtime').NodeId,
	'value',
	overrides.response ?? { pending: true },
	0,
	[],
	null,
];

describe('forwardRunnerEvent — pending events', () => {
	it('forwards output port tuple with state=pending via bridge', () => {
		const bridge = createMockBridge();
		const received: PortTelemetry[] = [];
		const sub = bridge['runner.port'].subscribe((event) => {
			received.push(event);
		});

		const event = createPendingEvent();
		forwardRunnerEvent(asBridge(bridge), event);

		expect(received).toHaveLength(1);
		expect(received[0]![3]).toEqual({ pending: true });
		expect(received[0]![1]).toBe('delay-1');
		expect(received[0]![0]).toBe('out');

		sub.unsubscribe();
	});

	it('forwards output port tuple with state=value via bridge', () => {
		const bridge = createMockBridge();
		const received: PortTelemetry[] = [];
		const sub = bridge['runner.port'].subscribe((event) => {
			received.push(event);
		});

		const event = createPendingEvent({ response: { value: 'result' } });
		forwardRunnerEvent(asBridge(bridge), event);

		expect(received).toHaveLength(1);
		expect(received[0]![3]).toEqual({ value: 'result' });
		expect(received[0]![3].value).toBe('result');

		sub.unsubscribe();
	});

	it('forwards pending then value in order', () => {
		const bridge = createMockBridge();
		const received: PortTelemetry[] = [];
		const sub = bridge['runner.port'].subscribe((event) => {
			received.push(event);
		});

		forwardRunnerEvent(asBridge(bridge), createPendingEvent());
		forwardRunnerEvent(
			asBridge(bridge),
			createPendingEvent({ response: { value: 'done' } }),
		);

		expect(received).toHaveLength(2);
		expect(received.map((e) => e[3])).toEqual([
			{ pending: true },
			{ value: 'done' },
		]);

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
		const received: PortTelemetry[] = [];

		const sub = runtimeEvents$.subscribe((event) => {
			forwardRunnerEvent(asBridge(bridge), event);
		});

		const bridgeSub = bridge['runner.port'].subscribe((event) => {
			received.push(event);
		});

		runtimeEvents$.next(createPendingEvent());
		runtimeEvents$.next(
			createPendingEvent({ response: { value: 'through-delay' } }),
		);

		expect(received).toHaveLength(2);
		expect(received[0]![3]).toEqual({ pending: true });
		expect(received[1]![3]).toEqual({ value: 'through-delay' });
		expect(received[1]![3].value).toBe('through-delay');

		bridgeSub.unsubscribe();
		sub.unsubscribe();
	});
});
