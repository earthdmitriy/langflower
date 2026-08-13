import { describe, expect, it } from 'vitest';
import { createConstantTestNode } from '../nodes/constant-node.js';
import { createDelayTestNode } from '../nodes/delay-node.js';
import {
	type RuntimeHarness,
	createRuntimeHarness,
	runAndCollectEvents,
	wireEdge,
} from './workflow-events.js';

function wire(
	harness: RuntimeHarness,
	fromNodeId: string,
	toNodeId: string,
	toPort: string,
): void {
	wireEdge(harness.editor, {
		fromNodeId,
		fromPort: ['value', 0],
		toNodeId,
		toPort: [toPort, 0],
	});
}

describe('port event order (input-received precedes output-emitted)', () => {
	it('emits input-received before the node output for a linear chain', async () => {
		const harness = createRuntimeHarness();
		harness.editor.addNode(
			createConstantTestNode({ nodeId: 'src', value: 'hi' }),
		);
		harness.editor.addNode(
			createDelayTestNode({ nodeId: 'd1', delayMs: 5 }),
		);
		harness.editor.addNode(
			createDelayTestNode({ nodeId: 'd2', delayMs: 5 }),
		);
		harness.editor.addNode(
			createDelayTestNode({ nodeId: 'd3', delayMs: 5 }),
		);

		wire(harness, 'src', 'd1', 'value');
		wire(harness, 'd1', 'd2', 'value');
		wire(harness, 'd2', 'd3', 'value');

		const { runId, events } = await runAndCollectEvents(
			harness,
			() => harness.runner.start(),
			60,
		);

		const nodeIds = ['d1', 'd2', 'd3'];
		for (const nodeId of nodeIds) {
			const firstInputIdx = events.findIndex(
				(event) =>
					event[0] === 'in' &&
					event[1] === nodeId,
			);
			const outputIdx = events.findIndex(
				(event) =>
					event[0] === 'out' &&
					event[1] === nodeId,
			);

			expect(
				firstInputIdx,
				`${nodeId} input-received`,
			).toBeGreaterThanOrEqual(0);
			expect(
				outputIdx,
				`${nodeId} output-emitted`,
			).toBeGreaterThanOrEqual(0);
			expect(
				firstInputIdx,
				`${nodeId} input-received should precede output-emitted`,
			).toBeLessThan(outputIdx);
		}
	});
});
