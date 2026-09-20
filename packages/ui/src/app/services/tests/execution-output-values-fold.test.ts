import type { EdgeId, NodeId, RunId } from '@langflower/runtime';
import type { PortTelemetry } from '@langflower/runtime';
import { describe, expect, it } from 'vitest';
import { foldLatestOutputValues } from '../execution-output-values-fold';
import type { OutputPortTelemetry } from '../execution-chrome-fold';

const outValue = (
	nodeId: string,
	portId: string,
	value: unknown,
): OutputPortTelemetry =>
	[
		'out',
		nodeId as NodeId,
		portId,
		{ value },
		0,
		[] as readonly EdgeId[],
		null,
	] satisfies PortTelemetry as OutputPortTelemetry;

describe('foldLatestOutputValues', () => {
	it('replaces the map from a snapshot of output values', () => {
		const seeded = foldLatestOutputValues(new Map([['old:out', 1]]), {
			type: 'snapshot',
			events: [outValue('n1', 'text', 'hello')],
		});
		expect(seeded.get('n1:text')).toBe('hello');
		expect(seeded.has('old:out')).toBe(false);
	});

	it('merges live output events onto the last map', () => {
		const afterSnap = foldLatestOutputValues(new Map(), {
			type: 'snapshot',
			events: [outValue('n1', 'text', 'hello')],
		});
		const afterEvent = foldLatestOutputValues(afterSnap, {
			type: 'event',
			event: outValue('n1', 'text', 'world'),
		});
		expect(afterEvent.get('n1:text')).toBe('world');

		const added = foldLatestOutputValues(afterEvent, {
			type: 'event',
			event: outValue('n2', 'out', 7),
		});
		expect(added.get('n1:text')).toBe('world');
		expect(added.get('n2:out')).toBe(7);
	});
});
