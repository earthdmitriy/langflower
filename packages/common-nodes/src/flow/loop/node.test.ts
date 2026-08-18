import { contextSymbol } from '@langflower/node-sdk';
import { RuntimeFacade } from '@langflower/runtime';
import { describe, expect, it } from 'vitest';
import { filter, firstValueFrom, map, of } from 'rxjs';
import { fakeLlmNode } from '../../ai/nodes/fake-llm/node.js';
import { previewNode } from '../../output/preview/node.js';
import { stringNode } from '../../primitives/string/node.js';
import { loopNode } from './node.js';

const stringContext = (nodeId: string) => [
	{
		portId: contextSymbol,
		slotIndex: 0,
		value: {
			projectDir: '/tmp',
			runId: 'test',
			nodeId,
			params: {},
			uiSchema: stringNode.uiSchema,
		},
	},
];

const loopContext = (nodeId: string) => [
	{
		portId: contextSymbol,
		slotIndex: 0,
		value: {
			projectDir: '/tmp',
			runId: 'test',
			nodeId,
			params: {},
			uiSchema: loopNode.uiSchema,
		},
	},
];

const llmContext = (nodeId: string) => [
	{
		portId: contextSymbol,
		slotIndex: 0,
		value: {
			projectDir: '/tmp',
			runId: 'test',
			nodeId,
			params: { tokenDelayMs: 0 },
			uiSchema: fakeLlmNode.uiSchema,
			skillMarkdown: '',
		},
	},
];

const previewContext = (nodeId: string) => [
	{
		portId: contextSymbol,
		slotIndex: 0,
		value: {
			projectDir: '/tmp',
			runId: 'test',
			nodeId,
			params: {},
			uiSchema: previewNode.uiSchema,
		},
	},
];

describe('common-loop', () => {
	it('maps N≥2 items through an external body and merges results', async () => {
		const runtime = new RuntimeFacade({ log: false });
		const axes = stringNode.getInstance();
		const loop = loopNode.getInstance();
		const body = fakeLlmNode.getInstance();
		const preview = previewNode.getInstance();

		axes.inputs.value.connect(
			of(['Axis A: vendors', 'Axis B: community'].join('\n')),
		);

		for (const [nodeId, instance] of [
			['axes', axes],
			['loop', loop],
			['body', body],
			['preview', preview],
		] as const) {
			runtime.editor.addNode({
				nodeId,
				inputs: instance.inputs,
				outputs: instance.outputs,
				bypassPorts: instance.bypassPorts,
			});
		}

		runtime.editor.addEdge({
			fromNodeId: 'axes',
			fromPort: ['value', 0],
			toNodeId: 'loop',
			toPort: ['items', 0],
		});
		runtime.editor.addEdge({
			fromNodeId: 'loop',
			fromPort: ['item', 0],
			toNodeId: 'body',
			toPort: ['userPrompt', 0],
		});
		runtime.editor.addEdge({
			fromNodeId: 'body',
			fromPort: ['response', 0],
			toNodeId: 'loop',
			toPort: ['bodyResult', 0],
		});
		runtime.editor.addEdge({
			fromNodeId: 'loop',
			fromPort: ['results', 0],
			toNodeId: 'preview',
			toPort: ['text', 0],
		});

		const itemsSeen: string[] = [];
		const itemSub = runtime.runner.events$.subscribe((event) => {
			if (
				event[0] === 'out' &&
				'value' in event[3] &&
				event[1] === 'loop' &&
				event[2] === 'item'
			) {
				itemsSeen.push(String(event[3].value));
			}
		});

		const previewPromise = firstValueFrom(
			runtime.runner.events$.pipe(
				filter(
					(event) =>
						event[0] === 'out' &&
						'value' in event[3] &&
						event[1] === 'preview' &&
						event[2] === 'text',
				),
				map((event) => String(event[3].value)),
			),
		);

		runtime.runner.start({
			axes: stringContext('axes'),
			loop: loopContext('loop'),
			body: llmContext('body'),
			preview: previewContext('preview'),
		});

		const resultsJson = await previewPromise;
		itemSub.unsubscribe();

		expect(itemsSeen).toEqual(['Axis A: vendors', 'Axis B: community']);

		const parsed: unknown = JSON.parse(resultsJson);
		expect(Array.isArray(parsed)).toBe(true);
		expect((parsed as string[]).length).toBe(2);
		expect((parsed as string[])[0]).toContain('Axis A: vendors');
		expect((parsed as string[])[1]).toContain('Axis B: community');
	});

	it('emits empty results for an empty items list', async () => {
		const runtime = new RuntimeFacade({ log: false });
		const axes = stringNode.getInstance();
		const loop = loopNode.getInstance();
		const preview = previewNode.getInstance();

		axes.inputs.value.connect(of(''));

		for (const [nodeId, instance] of [
			['axes', axes],
			['loop', loop],
			['preview', preview],
		] as const) {
			runtime.editor.addNode({
				nodeId,
				inputs: instance.inputs,
				outputs: instance.outputs,
				bypassPorts: instance.bypassPorts,
			});
		}

		runtime.editor.addEdge({
			fromNodeId: 'axes',
			fromPort: ['value', 0],
			toNodeId: 'loop',
			toPort: ['items', 0],
		});
		runtime.editor.addEdge({
			fromNodeId: 'loop',
			fromPort: ['results', 0],
			toNodeId: 'preview',
			toPort: ['text', 0],
		});

		const previewPromise = firstValueFrom(
			runtime.runner.events$.pipe(
				filter(
					(event) =>
						event[0] === 'out' &&
						'value' in event[3] &&
						event[1] === 'preview' &&
						event[2] === 'text',
				),
				map((event) => String(event[3].value)),
			),
		);

		runtime.runner.start({
			axes: stringContext('axes'),
			loop: loopContext('loop'),
			preview: previewContext('preview'),
		});

		await expect(previewPromise).resolves.toBe('[]');
	});
});
