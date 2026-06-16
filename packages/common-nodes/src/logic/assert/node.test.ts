import { RuntimeFacade } from '@langflower/runtime';
import { filter, firstValueFrom, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { booleanNode } from '../../primitives/boolean/node.js';
import { stringNode } from '../../primitives/string/node.js';
import { assertNode } from './node.js';

describe('common-assert node', () => {
	it('passthrough value when condition is true', async () => {
		const instance = assertNode.getInstance();
		instance.inputs.condition.connect(of(true));
		instance.inputs.message.connect(of('should not fail'));
		instance.inputs.value.connect(of('ok'));

		await expect(
			firstValueFrom(instance.outputs.value.value$),
		).resolves.toBe('ok');
	});

	it('emits output error when condition is false', async () => {
		const runtime = new RuntimeFacade({ log: false });
		const cond = booleanNode.getInstance();
		const msg = stringNode.getInstance();
		const value = stringNode.getInstance();
		const assert = assertNode.getInstance();

		cond.inputs.value.connect(of(false));
		msg.inputs.value.connect(of('plan invalid'));
		value.inputs.value.connect(of('payload'));

		for (const [nodeId, node, uiSchema] of [
			['cond-1', cond, booleanNode.uiSchema],
			['msg-1', msg, stringNode.uiSchema],
			['val-1', value, stringNode.uiSchema],
			['assert-1', assert, assertNode.uiSchema],
		] as const) {
			node.ctxConnection.connect(
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
				inputs: node.inputs,
				outputs: node.outputs,
				bypassPorts: node.bypassPorts,
			});
		}

		runtime.editor.addEdge({
			fromNodeId: 'cond-1',
			fromPort: ['value', 0],
			toNodeId: 'assert-1',
			toPort: ['condition', 0],
		});
		runtime.editor.addEdge({
			fromNodeId: 'msg-1',
			fromPort: ['value', 0],
			toNodeId: 'assert-1',
			toPort: ['message', 0],
		});
		runtime.editor.addEdge({
			fromNodeId: 'val-1',
			fromPort: ['value', 0],
			toNodeId: 'assert-1',
			toPort: ['value', 0],
		});

		const errorPromise = firstValueFrom(
			runtime.runner.events$.pipe(
				filter(
					(event) =>
						event.kind === 'output-emitted' &&
						event.state === 'error' &&
						event.nodeId === 'assert-1' &&
						event.portId === 'value',
				),
			),
		);

		runtime.runner.start();
		const errorEvent = await errorPromise;
		expect(errorEvent.value).toBe('plan invalid');
	});
});
