import { RuntimeFacade } from '@langflower/runtime';
import { describe, expect, it } from 'vitest';
import { filter, firstValueFrom, of } from 'rxjs';
import { previewNode } from '../../output/preview/node.js';
import { chatInputNode } from './node.js';

describe('common-chat-input', () => {
	it('exposes chatEntry and message HITL port', () => {
		expect(chatInputNode.type).toBe('common-chat-input');
		expect(chatInputNode.chatEntry).toBe(true);

		const messageMeta = chatInputNode.inputsConfigs.find(
			(entry) => entry.portId === 'message',
		);

		expect(messageMeta?.hidden).toBe(true);
		expect(messageMeta?.hitl?.kind).toBe('textarea');
		expect(
			messageMeta?.hitl?.kind === 'textarea'
				? messageMeta.hitl.submitLabel
				: undefined,
		).toBe('Start');
		expect(
			messageMeta?.hitl?.kind === 'textarea'
				? messageMeta.hitl.role
				: undefined,
		).toBe('chat-start');
	});

	it('cold-starts via pushIntoInput and emits message', async () => {
		const runtime = new RuntimeFacade({ log: false });
		const chat = chatInputNode.getInstance();
		const preview = previewNode.getInstance();

		chat.ctxConnection.connect(
			of({
				projectDir: '/tmp',
				runId: 'test',
				nodeId: 'chat-1',
				params: {},
				uiSchema: chatInputNode.uiSchema,
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
			nodeId: 'chat-1',
			inputs: chat.inputs,
			outputs: chat.outputs,
			bypassPorts: chat.bypassPorts,
			chatEntry: true,
		});
		runtime.editor.addNode({
			nodeId: 'preview-1',
			inputs: preview.inputs,
			outputs: preview.outputs,
			bypassPorts: preview.bypassPorts,
		});
		runtime.editor.addEdge({
			fromNodeId: 'chat-1',
			fromPort: ['message', 0],
			toNodeId: 'preview-1',
			toPort: ['text', 0],
		});

		const previewPromise = firstValueFrom(
			runtime.runner.events$.pipe(
				filter(
					(event) =>
						event.kind === 'output-emitted' &&
						event.nodeId === 'preview-1' &&
						event.portId === 'text' &&
						event.state === 'value',
				),
			),
		);

		const runId = runtime.runner.pushIntoInput({
			nodeId: 'chat-1',
			portId: 'message',
			payload: 'Hello from chat',
		});

		expect(runId).not.toBe(false);

		const previewEvent = await previewPromise;
		expect(previewEvent.value).toBe('Hello from chat');
	});

	it('plain start skips chat-entry clusters', () => {
		const runtime = new RuntimeFacade({ log: false });
		const chat = chatInputNode.getInstance();
		const preview = previewNode.getInstance();

		runtime.editor.addNode({
			nodeId: 'chat-1',
			inputs: chat.inputs,
			outputs: chat.outputs,
			bypassPorts: chat.bypassPorts,
			chatEntry: true,
		});
		runtime.editor.addNode({
			nodeId: 'preview-1',
			inputs: preview.inputs,
			outputs: preview.outputs,
			bypassPorts: preview.bypassPorts,
		});
		runtime.editor.addEdge({
			fromNodeId: 'chat-1',
			fromPort: ['message', 0],
			toNodeId: 'preview-1',
			toPort: ['text', 0],
		});

		expect(runtime.runner.start()).toBe(false);
	});
});
