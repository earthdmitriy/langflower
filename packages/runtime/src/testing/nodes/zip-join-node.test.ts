import { describe, expect, it } from 'vitest';
import { firstValueFrom, take, toArray } from 'rxjs';
import { createRuntimeHarness } from '../workflows/workflow-events.js';
import { createJoinTestNode } from './join-node.js';
import { createPushableTestNode } from './pushable-node.js';

describe('multi: zip join', () => {
	it('emits only when every slot delivers a new value (flush after emit)', async () => {
		const runtime = createRuntimeHarness();
		const a = createPushableTestNode({ nodeId: 'a' });
		const b = createPushableTestNode({ nodeId: 'b' });
		runtime.editor.addNode(a.node);
		runtime.editor.addNode(b.node);
		runtime.editor.addNode(
			createJoinTestNode({
				nodeId: 'join',
				separator: '|',
				mode: 'zip',
			}),
		);
		runtime.editor.addEdge({
			fromNodeId: 'a',
			fromPort: ['value', 0],
			toNodeId: 'join',
			toPort: ['lines', 0],
		});
		runtime.editor.addEdge({
			fromNodeId: 'b',
			fromPort: ['value', 0],
			toNodeId: 'join',
			toPort: ['lines', 1],
		});

		const emitted: string[] = [];
		const sub = runtime.editor
			.getNode('join')
			.outputs.text.value$.subscribe((value) => {
				emitted.push(String(value));
			});

		runtime.runner.start();

		a.next('a1');
		await Promise.resolve();
		expect(emitted).toEqual([]);

		b.next('b1');
		await Promise.resolve();
		expect(emitted).toEqual(['a1|b1']);

		a.next('a2');
		await Promise.resolve();
		expect(emitted).toEqual(['a1|b1']);

		b.next('b2');
		await Promise.resolve();
		expect(emitted).toEqual(['a1|b1', 'a2|b2']);

		sub.unsubscribe();
	});

	it('second round waits for both slots again', async () => {
		const runtime = createRuntimeHarness();
		const a = createPushableTestNode({ nodeId: 'a' });
		const b = createPushableTestNode({ nodeId: 'b' });
		runtime.editor.addNode(a.node);
		runtime.editor.addNode(b.node);
		runtime.editor.addNode(
			createJoinTestNode({
				nodeId: 'join',
				separator: '-',
				mode: 'zip',
			}),
		);
		runtime.editor.addEdge({
			fromNodeId: 'a',
			fromPort: ['value', 0],
			toNodeId: 'join',
			toPort: ['lines', 0],
		});
		runtime.editor.addEdge({
			fromNodeId: 'b',
			fromPort: ['value', 0],
			toNodeId: 'join',
			toPort: ['lines', 1],
		});

		const second = firstValueFrom(
			runtime.editor
				.getNode('join')
				.outputs.text.value$.pipe(take(2), toArray()),
		);

		runtime.runner.start();
		a.next('1');
		b.next('2');
		a.next('3');
		b.next('4');

		await expect(second).resolves.toEqual(['1-2', '3-4']);
	});
});
