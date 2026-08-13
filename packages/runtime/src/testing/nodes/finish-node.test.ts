import type { RunId } from '../../types.js';
import { filter, firstValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { createConstantTestNode } from './constant-node.js';
import { createFinishTestNode } from './finish-node.js';
import {
	type RuntimeHarness,
	createRuntimeHarness,
	wireEdge,
} from '../workflows/workflow-events.js';

describe('finish test node', () => {
	it('ends the run with done when value reaches finish node', async () => {
		const runtime = createRuntimeHarness();

		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'A', value: 'hello' }),
		);
		runtime.editor.addNode(createFinishTestNode({ nodeId: 'finish' }));

		wireEdge(runtime.editor, {
			fromNodeId: 'A',
			fromPort: ['value', 0],
			toNodeId: 'finish',
			toPort: ['value', 0],
		});

		const donePromise = firstValueFrom(
			runtime.runner.events$.pipe(
				filter(
					(event): event is ['done', RunId] =>
						event[0] === 'done',
				),
			),
		);

		const runId = runtime.runner.start();
		const done = await donePromise;

		expect(done[1]).toBe(runId);
		expect(await firstValueFrom(runtime.runner.status$)).toBe('idle');
	});
});
