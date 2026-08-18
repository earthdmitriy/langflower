import { RuntimeFacade } from '@langflower/runtime';
import { filter, firstValueFrom, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { defineNode } from '../../define-node.js';
import { gateSampleNode } from './gate-node.js';

const failingSampleNode = defineNode({
	type: 'sample-fail',
	displayName: 'Fail',
	uiSchema: [] as const,
	inputs: {
		trigger: { wireType: 'boolean', required: true },
	},
	outputs: {
		result: { wireType: 'boolean' },
	},
	execute() {
		throw new Error('boom');
	},
});

describe('defineNode samples', () => {
	it('exposes catalog metadata without bind on the definition', () => {
		expect('bind' in gateSampleNode).toBe(false);
		expect(gateSampleNode.type).toBe('sample-gate');
		expect(gateSampleNode.displayName).toBe('Gate');
		expect(gateSampleNode.emitOncePerActivation).toBe(true);
	});

	it('execute maps inputs to outputs without author rxjs', async () => {
		const instance = gateSampleNode.getInstance();
		instance.ctxConnection.connect(
			of({
				projectDir: '/tmp',
				runId: 'test',
				nodeId: 'gate-1',
				params: {},
				uiSchema: gateSampleNode.uiSchema,
			}),
		);
		instance.inputs.code.connect(of(0));

		await expect(firstValueFrom(instance.outputs.ok.value$)).resolves.toBe(
			true,
		);
	});

	it('thrown execute error fails the output port', async () => {
		const runtime = new RuntimeFacade({ log: false });
		const instance = failingSampleNode.getInstance();

		instance.ctxConnection.connect(
			of({
				projectDir: '/tmp',
				runId: 'test',
				nodeId: 'fail-1',
				params: {},
				uiSchema: failingSampleNode.uiSchema,
			}),
		);
		instance.inputs.trigger.connect(of(true));

		runtime.editor.addNode({
			nodeId: 'fail-1',
			inputs: instance.inputs,
			outputs: instance.outputs,
			bypassPorts: instance.bypassPorts,
		});

		const errorPromise = firstValueFrom(
			runtime.runner.events$.pipe(
				filter(
					(event) =>
						event[0] === 'out' &&
						'error' in event[3] &&
						event[1] === 'fail-1',
				),
			),
		);

		runtime.runner.start();
		const errorEvent = await errorPromise;
		expect(String(errorEvent[3].error)).toMatch(/boom/);
	});
});
