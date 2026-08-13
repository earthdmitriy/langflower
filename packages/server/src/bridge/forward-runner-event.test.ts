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
		state: PortTelemetry[3];
		value: unknown;
	}> = {},
): PortTelemetry => {
	const state = overrides.state ?? 'pending';
	return [
		'out',
		'delay-1' as import('@langflower/runtime').NodeId,
		'value',
		state,
		overrides.value ?? (state === 'value' ? 'result' : undefined),
		0,
		[],
		null,
	];
};

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
		expect(received[0]![3]).toBe('pending');
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

		const event = createPendingEvent({ state: 'value', value: 'result' });
		forwardRunnerEvent(asBridge(bridge), event);

		expect(received).toHaveLength(1);
		expect(received[0]![3]).toBe('value');
		expect(received[0]![4]).toBe('result');

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
			createPendingEvent({ state: 'value', value: 'done' }),
		);

		expect(received).toHaveLength(2);
		expect(received.map((e) => e[3])).toEqual(['pending', 'value']);

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
			createPendingEvent({ state: 'value', value: 'through-delay' }),
		);

		expect(received).toHaveLength(2);
		expect(received[0]![3]).toBe('pending');
		expect(received[1]![3]).toBe('value');
		expect(received[1]![4]).toBe('through-delay');

		bridgeSub.unsubscribe();
		sub.unsubscribe();
	});
});
