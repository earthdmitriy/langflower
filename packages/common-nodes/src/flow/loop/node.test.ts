import { contextSymbol, defineReactiveNode } from '@langflower/node-sdk';
import { RuntimeFacade } from '@langflower/runtime';
import { describe, expect, it } from 'vitest';
import { filter, firstValueFrom, map, of, ReplaySubject } from 'rxjs';
import { testLlmCapFields } from '../../ai/features/test-llm-caps.js';
import { fakeLlmNode } from '../../ai/nodes/fake-llm/node.js';
import { previewNode } from '../../output/preview/node.js';
import { stringNode } from '../../primitives/string/node.js';
import { loopNode } from './node.js';

const countingEcho = defineReactiveNode({
	type: 'test-loop-echo',
	displayName: 'Loop echo',
	uiSchema: [] as const,
	bind(_ctx, { makeInput, configureOutput }) {
		let count = 0;
		const input = makeInput<unknown>('input', {
			name: 'input',
			dynamic: true,
			required: true,
		});
		const output$ = input.pipeValue(
			map((value) => {
				count += 1;
				return `${String(value)}#${String(count)}`;
			}),
		);

		return {
			inputs: [input],
			outputs: [
				configureOutput('output', output$, {
					wireType: 'string',
				}),
			],
		};
	},
});

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

const echoContext = (nodeId: string) => [
	{
		portId: contextSymbol,
		slotIndex: 0,
		value: {
			projectDir: '/tmp',
			runId: 'test',
			nodeId,
			params: {},
			uiSchema: countingEcho.uiSchema,
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
			...testLlmCapFields(),
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
			toPort: ['input', 0],
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
			toPort: ['input', 0],
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

	it('describes the wire, not example jobs', () => {
		expect(loopNode.description).toContain('**items**');
		expect(loopNode.description).toContain('**bodyResult**');
		expect(loopNode.description).toContain('**results**');
		expect(loopNode.description).not.toContain('Typical uses');
	});

	it('re-runs one matching axis and then replaces the list', async () => {
		const runtime = new RuntimeFacade({ log: false });
		const loop = loopNode.getInstance();
		const body = countingEcho.getInstance();
		const preview = previewNode.getInstance();
		const items = new ReplaySubject<string>(1);
		const rerun = new ReplaySubject<string>(1);

		loop.inputs.items.connect(items);
		loop.inputs.rerunItems.connect(rerun);

		for (const [nodeId, instance] of [
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
			fromNodeId: 'loop',
			fromPort: ['item', 0],
			toNodeId: 'body',
			toPort: ['input', 0],
		});
		runtime.editor.addEdge({
			fromNodeId: 'body',
			fromPort: ['output', 0],
			toNodeId: 'loop',
			toPort: ['bodyResult', 0],
		});
		runtime.editor.addEdge({
			fromNodeId: 'loop',
			fromPort: ['results', 0],
			toNodeId: 'preview',
			toPort: ['input', 0],
		});

		const itemsSeen: string[] = [];
		const previews: string[] = [];
		let resolvePreview: ((value: string[]) => void) | undefined;
		const previewDone = new Promise<string[]>((resolve) => {
			resolvePreview = resolve;
		});

		const eventSub = runtime.runner.events$.subscribe((event) => {
			if (event[0] !== 'out' || !('value' in event[3])) {
				return;
			}

			if (event[1] === 'loop' && event[2] === 'item') {
				itemsSeen.push(String(event[3].value));
			}

			if (event[1] === 'preview' && event[2] === 'text') {
				previews.push(String(event[3].value));
				if (previews.length === 3) {
					resolvePreview?.(previews);
				}
			}
		});

		items.next('docs\nrisks\nalternatives');
		const started = runtime.runner.start({
			loop: loopContext('loop'),
			body: echoContext('body'),
			preview: previewContext('preview'),
		});
		expect(started).not.toBe(false);
		await firstValueFrom(
			runtime.runner.events$.pipe(
				filter(
					(event) =>
						event[0] === 'out' &&
						'value' in event[3] &&
						event[1] === 'preview' &&
						event[2] === 'text',
				),
			),
		);

		rerun.next('');
		rerun.next('missing');
		rerun.next('risks');

		await firstValueFrom(
			runtime.runner.events$.pipe(
				filter(
					(event) =>
						event[0] === 'out' &&
						'value' in event[3] &&
						event[1] === 'preview' &&
						event[2] === 'text' &&
						String(event[3].value).includes('risks#4'),
				),
			),
		);

		items.next('alpha\nbeta');
		const allPreviews = await previewDone;
		eventSub.unsubscribe();

		expect(itemsSeen).toEqual([
			'docs',
			'risks',
			'alternatives',
			'risks',
			'alpha',
			'beta',
		]);

		const first = JSON.parse(allPreviews[0] ?? '[]') as string[];
		const spliced = JSON.parse(allPreviews[1] ?? '[]') as string[];
		const replaced = JSON.parse(allPreviews[2] ?? '[]') as string[];

		expect(first).toEqual(['docs#1', 'risks#2', 'alternatives#3']);
		expect(spliced).toEqual(['docs#1', 'risks#4', 'alternatives#3']);
		expect(replaced).toEqual(['alpha#5', 'beta#6']);

		runtime.runner.interrupt('cancel');
		runtime.runner.dispose();
		runtime.editor.dispose();
	});
});
