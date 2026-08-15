import { contextSymbol } from '@langflower/node-sdk';
import { RuntimeFacade } from '@langflower/runtime';
import { describe, expect, it } from 'vitest';
import { filter, firstValueFrom, of } from 'rxjs';
import { attachRunHostServices } from '../../features/run-host-services.js';
import { stringNode } from '../../../primitives/string/node.js';
import { fakeLlmNode } from './node.js';

/**
 * Soft↔Hard smoke (fake imitates LLM — not a history oracle).
 * @see docs/ADR.md ADR-016
 */
const llmContext = (
	nodeId: string,
	params: Readonly<Record<string, unknown>>,
) => [
	{
		portId: contextSymbol,
		slotIndex: 0,
		value: attachRunHostServices(
			{
				projectDir: '/tmp',
				runId: 'test',
				nodeId,
				params,
				uiSchema: fakeLlmNode.uiSchema,
			},
			{ skillMarkdown: '' },
		),
	},
];

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

describe('common-fake-llm debate loop (soft↔hard smoke)', () => {
	it('Soft emits response while Hard→Soft.feedback is wired', async () => {
		const runtime = new RuntimeFacade({ log: false });
		const topic = stringNode.getInstance();
		const soft = fakeLlmNode.getInstance();
		const hard = fakeLlmNode.getInstance();

		topic.inputs.value.connect(of('Debate soft vs hard harness'));

		for (const [nodeId, instance] of [
			['topic', topic],
			['soft', soft],
			['hard', hard],
		] as const) {
			runtime.editor.addNode({
				nodeId,
				inputs: instance.inputs,
				outputs: instance.outputs,
				bypassPorts: instance.bypassPorts,
			});
		}

		runtime.editor.addEdge({
			fromNodeId: 'topic',
			fromPort: ['value', 0],
			toNodeId: 'soft',
			toPort: ['userPrompt', 0],
		});
		runtime.editor.addEdge({
			fromNodeId: 'soft',
			fromPort: ['response', 0],
			toNodeId: 'hard',
			toPort: ['userPrompt', 0],
		});
		runtime.editor.addEdge({
			fromNodeId: 'hard',
			fromPort: ['response', 0],
			toNodeId: 'soft',
			toPort: ['feedback', 0],
		});

		const softResponses: string[] = [];
		const hardResponses: string[] = [];

		const softDone = firstValueFrom(
			runtime.runner.events$.pipe(
				filter((event) => {
					if (
						event[0] !== 'out' ||
						event[3] !== 'value' ||
						event[2] !== 'response'
					) {
						return false;
					}

					if (event[1] === 'soft') {
						softResponses.push(String(event[4]));
						// Sync interrupt — Soft↔Hard would otherwise keep
						// turning; tokenDelayMs>0 lets teardown win a tick.
						runtime.runner.interrupt('cancel');
						return true;
					}

					if (event[1] === 'hard') {
						hardResponses.push(String(event[4]));
					}

					return false;
				}),
			),
		);

		// >0 so Soft↔Hard cannot wedge the event loop before interrupt.
		runtime.runner.start({
			topic: stringContext('topic'),
			soft: llmContext('soft', { tokenDelayMs: 1 }),
			hard: llmContext('hard', { tokenDelayMs: 1 }),
		});

		await softDone;

		expect(softResponses.length).toBeGreaterThanOrEqual(1);
		expect(softResponses[0]).toContain('Final:');

		runtime.runner.dispose();
		runtime.editor.dispose();
	}, 30_000);

	it('maxFeedbackTurns caps Soft↔Hard revise storms', async () => {
		const runtime = new RuntimeFacade({ log: false });
		const topic = stringNode.getInstance();
		const soft = fakeLlmNode.getInstance();
		const hard = fakeLlmNode.getInstance();

		topic.inputs.value.connect(of('Debate soft vs hard harness'));

		for (const [nodeId, instance] of [
			['topic', topic],
			['soft', soft],
			['hard', hard],
		] as const) {
			runtime.editor.addNode({
				nodeId,
				inputs: instance.inputs,
				outputs: instance.outputs,
				bypassPorts: instance.bypassPorts,
			});
		}

		runtime.editor.addEdge({
			fromNodeId: 'topic',
			fromPort: ['value', 0],
			toNodeId: 'soft',
			toPort: ['userPrompt', 0],
		});
		runtime.editor.addEdge({
			fromNodeId: 'soft',
			fromPort: ['response', 0],
			toNodeId: 'hard',
			toPort: ['userPrompt', 0],
		});
		runtime.editor.addEdge({
			fromNodeId: 'hard',
			fromPort: ['response', 0],
			toNodeId: 'soft',
			toPort: ['feedback', 0],
		});

		const softResponses: string[] = [];

		const softSecond = firstValueFrom(
			runtime.runner.events$.pipe(
				filter((event) => {
					if (
						event[0] !== 'out' ||
						event[3] !== 'value' ||
						event[2] !== 'response' ||
						event[1] !== 'soft'
					) {
						return false;
					}

					softResponses.push(String(event[4]));
					return softResponses.length >= 2;
				}),
			),
		);

		// tokenDelayMs: 0 is safe here because maxFeedbackTurns stops Soft.
		runtime.runner.start({
			topic: stringContext('topic'),
			soft: llmContext('soft', {
				tokenDelayMs: 0,
				maxFeedbackTurns: 1,
			}),
			hard: llmContext('hard', { tokenDelayMs: 0 }),
		});

		const softError = firstValueFrom(
			runtime.runner.events$.pipe(
				filter(
					(event) =>
						event[0] === 'out' &&
						event[3] === 'error' &&
						event[1] === 'soft' &&
						event[2] === 'response',
				),
			),
		);

		await softSecond;
		// Next Hard→Soft feedback must fail Soft visibly (not silent EMPTY).
		const errorEvent = await softError;
		runtime.runner.interrupt('cancel');

		expect(softResponses.length).toBe(2);
		expect(softResponses[1]).toContain('feedback');
		expect(errorEvent[0]).toBe('out');
		if (errorEvent[0] === 'out') {
			expect(String(errorEvent[4])).toMatch(/maxFeedbackTurns/);
		}

		runtime.runner.dispose();
		runtime.editor.dispose();
	}, 15_000);
});
