import { describe, expect, it } from 'vitest';
import { createConstantTestNode } from '../nodes/constant-node.js';
import { createDelayTestNode } from '../nodes/delay-node.js';
import { createFinishTestNode } from '../nodes/finish-node.js';
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

/**
 * Reproduces `demo-project/.../example.json`: a literal feeds a delayed node
 * whose output is delayed ~1s, then a passthrough preview, then a finish node.
 * Before the in-path `pipeValue(tap)` telemetry change, the delayed node's
 * `output-emitted` landed AFTER its downstream's because the dataflow
 * subscriber (downstream input) was notified before the source's own watcher.
 * Now the source `output-emitted` must precede the downstream `input-received`
 * and `output-emitted`.
 */
describe('delayed node ordering in the work-log timeline', () => {
	it('emits the delayed node output before its downstream consumers', async () => {
		const harness = createRuntimeHarness();
		harness.editor.addNode(
			createConstantTestNode({
				nodeId: 'str',
				value: 'Hello Langflower',
			}),
		);
		harness.editor.addNode(
			createDelayTestNode({ nodeId: 'delay', delayMs: 1000 }),
		);
		harness.editor.addNode(
			createDelayTestNode({ nodeId: 'preview', delayMs: 0 }),
		);
		harness.editor.addNode(createFinishTestNode({ nodeId: 'finish' }));

		wire(harness, 'str', 'delay', 'value');
		wire(harness, 'delay', 'preview', 'value');
		wire(harness, 'preview', 'finish', 'value');

		const { runId, events } = await runAndCollectEvents(
			harness,
			() => harness.runner.start(),
			1400,
		);

		const firstIndexOf = (portDir: 'in' | 'out', nodeId: string): number =>
			events.findIndex(
				(event) => event[0] === portDir && event[1] === nodeId,
			);

		const strOut = firstIndexOf('out', 'str');
		const delayOut = firstIndexOf('out', 'delay');
		const previewOut = firstIndexOf('out', 'preview');
		const finishOut = firstIndexOf('out', 'finish');

		expect(strOut).toBeGreaterThanOrEqual(0);
		expect(delayOut).toBeGreaterThanOrEqual(0);
		expect(previewOut).toBeGreaterThanOrEqual(0);
		expect(finishOut).toBeGreaterThanOrEqual(0);

		// The delayed node must NOT appear last — it activates before Preview
		// and Finish, so its output-emitted precedes theirs.
		expect(delayOut, 'delay before preview').toBeLessThan(previewOut);
		expect(delayOut, 'delay before finish').toBeLessThan(finishOut);
		expect(strOut, 'str before delay').toBeLessThan(delayOut);
		expect(previewOut, 'preview before finish').toBeLessThan(finishOut);
	});
});
