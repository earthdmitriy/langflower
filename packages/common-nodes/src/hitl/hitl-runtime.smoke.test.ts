import { RuntimeFacade } from '@langflower/runtime';
import { describe, expect, it } from 'vitest';
import { filter, firstValueFrom, of } from 'rxjs';
import { hitlReviewGateNode } from './review-gate/node.js';
import { stringNode } from '../primitives/string/node.js';
import { previewNode } from '../output/preview/node.js';

describe('HITL common nodes (runtime smoke)', () => {
	it('review-gate feedback passthrough', async () => {
		const runtime = new RuntimeFacade({ log: false });
		const gate = hitlReviewGateNode.getInstance();
		const str = stringNode.getInstance();
		const preview = previewNode.getInstance();

		str.inputs.value.connect(of('What is your goal?'));
		str.ctxConnection.connect(
			of({
				projectDir: '/tmp',
				runId: 'test',
				nodeId: 'prompt-1',
				params: {},
				uiSchema: stringNode.uiSchema,
			}),
		);
		gate.ctxConnection.connect(
			of({
				projectDir: '/tmp',
				runId: 'test',
				nodeId: 'gate-1',
				params: {},
				uiSchema: hitlReviewGateNode.uiSchema,
			}),
		);
		preview.ctxConnection.connect(
			of({
				projectDir: '/tmp',
				runId: 'test',
				nodeId: 'preview-1',
				params: {},
				uiSchema: previewNode.uiSchema,
			}),
		);

		runtime.editor.addNode({
			nodeId: 'prompt-1',
			inputs: str.inputs,
			outputs: str.outputs,
			bypassPorts: str.bypassPorts,
		});
		runtime.editor.addNode({
			nodeId: 'gate-1',
			inputs: gate.inputs,
			outputs: gate.outputs,
			bypassPorts: gate.bypassPorts,
		});
		runtime.editor.addNode({
			nodeId: 'preview-1',
			inputs: preview.inputs,
			outputs: preview.outputs,
			bypassPorts: preview.bypassPorts,
		});

		runtime.editor.addEdge({
			fromNodeId: 'prompt-1',
			fromPort: ['value', 0],
			toNodeId: 'gate-1',
			toPort: ['result', 0],
		});
		runtime.editor.addEdge({
			fromNodeId: 'gate-1',
			fromPort: ['feedback', 0],
			toNodeId: 'preview-1',
			toPort: ['text', 0],
		});

		const previewPromise = firstValueFrom(
			runtime.runner.events$.pipe(
				filter(
					(event) =>
						event.kind === 'output-emitted' &&
						event.state === 'value' &&
						event.nodeId === 'preview-1' &&
						event.portId === 'text' &&
						event.value === 'Build a demo',
				),
			),
		);

		const runId = runtime.runner.start();

		const pushEvents: {
			kind: string;
			nodeId: string;
			portId: string;
		}[] = [];
		const pushSub = runtime.runner.events$.subscribe((event) => {
			if (
				(event.kind === 'input-received' ||
					event.kind === 'output-emitted') &&
				event.state === 'value'
			) {
				pushEvents.push({
					kind: event.kind,
					nodeId: event.nodeId,
					portId: String(event.portId),
				});
			}
		});

		const pushed = runtime.runner.pushIntoInput({
			nodeId: 'gate-1',
			portId: 'requestChanges',
			payload: 'Build a demo',
		});

		expect(pushed).toBe(runId);

		const previewEvent = await previewPromise;
		expect(
			previewEvent.kind === 'output-emitted' && previewEvent.value,
		).toBe('Build a demo');

		const replyIdx = pushEvents.findIndex(
			(event) =>
				event.kind === 'input-received' &&
				event.nodeId === 'gate-1' &&
				event.portId === 'requestChanges',
		);
		const feedbackIdx = pushEvents.findIndex(
			(event) =>
				event.kind === 'output-emitted' &&
				event.nodeId === 'gate-1' &&
				event.portId === 'feedback',
		);
		const previewInIdx = pushEvents.findIndex(
			(event) =>
				event.kind === 'input-received' &&
				event.nodeId === 'preview-1' &&
				event.portId === 'text',
		);
		expect(replyIdx).toBeGreaterThanOrEqual(0);
		expect(feedbackIdx).toBeGreaterThanOrEqual(0);
		expect(previewInIdx).toBeGreaterThanOrEqual(0);
		expect(replyIdx).toBeLessThan(feedbackIdx);
		expect(feedbackIdx).toBeLessThan(previewInIdx);

		pushSub.unsubscribe();
		runtime.runner.interrupt('cancel');
		runtime.runner.dispose();
		runtime.editor.dispose();
	});

	it('review-gate approve emits result on response', async () => {
		const runtime = new RuntimeFacade({ log: false });
		const gate = hitlReviewGateNode.getInstance();
		const str = stringNode.getInstance();
		const preview = previewNode.getInstance();

		str.inputs.value.connect(of('approved draft'));

		for (const [nodeId, instance, uiSchema] of [
			['prompt-1', str, stringNode.uiSchema],
			['gate-1', gate, hitlReviewGateNode.uiSchema],
			['preview-1', preview, previewNode.uiSchema],
		] as const) {
			instance.ctxConnection.connect(
				of({
					projectDir: '/tmp',
					runId: 'test',
					nodeId,
					params: {},
					uiSchema,
				}),
			);
			runtime.editor.addNode({
				nodeId,
				inputs: instance.inputs,
				outputs: instance.outputs,
				bypassPorts: instance.bypassPorts,
			});
		}

		runtime.editor.addEdge({
			fromNodeId: 'prompt-1',
			fromPort: ['value', 0],
			toNodeId: 'gate-1',
			toPort: ['result', 0],
		});
		runtime.editor.addEdge({
			fromNodeId: 'gate-1',
			fromPort: ['response', 0],
			toNodeId: 'preview-1',
			toPort: ['text', 0],
		});

		const previewPromise = firstValueFrom(
			runtime.runner.events$.pipe(
				filter(
					(event) =>
						event.kind === 'output-emitted' &&
						event.state === 'value' &&
						event.nodeId === 'preview-1' &&
						event.portId === 'text' &&
						event.value === 'approved draft',
				),
			),
		);

		const runId = runtime.runner.start();
		expect(
			runtime.runner.pushIntoInput({
				nodeId: 'gate-1',
				portId: 'approve',
				payload: true,
			}),
		).toBe(runId);

		await expect(previewPromise).resolves.toMatchObject({
			kind: 'output-emitted',
			value: 'approved draft',
		});

		runtime.runner.interrupt('cancel');
		runtime.runner.dispose();
		runtime.editor.dispose();
	});
});
