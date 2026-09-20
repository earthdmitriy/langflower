import { filter, firstValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { createConstantTestNode } from './testing/nodes/constant-node.js';
import { createFinishTestNode } from './testing/nodes/finish-node.js';
import { createRuntimeHarness } from './testing/workflows/workflow-events.js';
import { isRuntimeDone } from './types.js';

describe('stopsRun completion order', () => {
	it('emits finish output-emitted before done', async () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'A', value: 'hello' }),
		);
		runtime.editor.addNode(createFinishTestNode({ nodeId: 'finish' }));
		runtime.editor.addEdge({
			fromNodeId: 'A',
			fromPort: ['value', 0],
			toNodeId: 'finish',
			toPort: ['value', 0],
		});

		const sequence: string[] = [];
		runtime.runner.events$.subscribe((event) => {
			if (event[0] === 'out' && event[1] === 'finish') {
				sequence.push('output-emitted');
			}
			if (event[0] === 'done') {
				sequence.push('done');
			}
		});

		const donePromise = firstValueFrom(
			runtime.runner.events$.pipe(
				filter(
					(event): event is readonly ['done', string] =>
						isRuntimeDone(event) && event.length === 2,
				),
			),
		);

		runtime.runner.start();
		await donePromise;

		expect(sequence).toEqual(['output-emitted', 'done']);
	});
});
