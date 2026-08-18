import { contextSymbol } from '@langflower/node-sdk';
import { RuntimeFacade } from '@langflower/runtime';
import { statefulObservable } from '@rx-evo/stateful-observable';
import { describe, expect, it } from 'vitest';
import { Subject } from 'rxjs';
import { concatNode } from './node.js';

const concatContext = (nodeId: string) => [
	{
		portId: contextSymbol,
		slotIndex: 0,
		value: {
			projectDir: '/tmp',
			runId: 'test',
			nodeId,
			params: {},
			uiSchema: concatNode.uiSchema,
		},
	},
];

const pushableSource = (nodeId: string, subject$: Subject<string>) => ({
	nodeId,
	inputs: {},
	outputs: {
		value: statefulObservable({
			loader: () => subject$,
			meta: {
				dir: 'out' as const,
				portId: 'value',
				wireType: 'string',
			},
		}),
	},
	bypassPorts: {},
});

describe('common-concat zip flush (RuntimeFacade)', () => {
	it('does not re-emit when only one value slot fires again', async () => {
		const runtime = new RuntimeFacade({ log: false });
		const concat = concatNode.getInstance();
		const a$ = new Subject<string>();
		const b$ = new Subject<string>();

		runtime.editor.addNode(pushableSource('a', a$));
		runtime.editor.addNode(pushableSource('b', b$));
		runtime.editor.addNode({
			nodeId: 'concat',
			inputs: concat.inputs,
			outputs: concat.outputs,
			bypassPorts: concat.bypassPorts,
		});

		runtime.editor.addEdge({
			fromNodeId: 'a',
			fromPort: ['value', 0],
			toNodeId: 'concat',
			toPort: ['value', 0],
		});
		runtime.editor.addEdge({
			fromNodeId: 'b',
			fromPort: ['value', 0],
			toNodeId: 'concat',
			toPort: ['value', 1],
		});

		const emitted: string[] = [];
		const sub = runtime.editor
			.getNode('concat')
			.outputs.value.value$.subscribe((value) => {
				emitted.push(String(value));
			});

		runtime.runner.start({
			concat: concatContext('concat'),
		});
		await Promise.resolve();

		a$.next('A1');
		await Promise.resolve();
		expect(emitted).toEqual([]);

		b$.next('B1');
		await Promise.resolve();
		expect(emitted).toEqual(['A1\nB1']);

		a$.next('A2');
		await Promise.resolve();
		expect(emitted).toEqual(['A1\nB1']);

		b$.next('B2');
		await Promise.resolve();
		expect(emitted).toEqual(['A1\nB1', 'A2\nB2']);

		sub.unsubscribe();
	});
});
