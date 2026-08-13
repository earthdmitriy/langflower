import {
	contextSymbol,
	defineReactiveNode,
	type CtxError,
} from '@langflower/node-sdk';
import { RuntimeFacade } from '@langflower/runtime';
import { describe, expect, it } from 'vitest';
import { filter, firstValueFrom, map, pipe, throwError } from 'rxjs';

const probeNode = defineReactiveNode({
	type: 'test-ctx-probe',
	displayName: 'Ctx probe',
	category: 'Test',
	uiSchema: [] as const,
	bind(ctx, { makeInput, configureOutput, combineInputs }) {
		const input = makeInput<string>('input', {
			name: 'input',
			wireType: 'string',
			defaultValue: '',
		});
		const out = combineInputs([ctx, input], ([, text]) =>
			String(text ?? ''),
		).pipeValue(pipe(map((text) => text)));

		return {
			inputs: [input],
			outputs: [
				configureOutput('out', out, {
					wireType: 'string',
				}),
			],
		};
	},
});

describe('ctx CtxError → output port error (S6)', () => {
	it('propagates context error$ through combineInputs to outputs', async () => {
		const runtime = new RuntimeFacade({ log: false });
		const node = probeNode.getInstance();

		runtime.editor.addNode({
			nodeId: 'p1',
			inputs: node.inputs,
			outputs: node.outputs,
			bypassPorts: node.bypassPorts,
		});

		const errorPromise = firstValueFrom(
			runtime.runner.events$.pipe(
				filter(
					(event) =>
						event[0] === 'out' &&
						event[3] === 'error' &&
						event[1] === 'p1' &&
						event[2] === 'out',
				),
			),
		);

		const ctxError: CtxError = {
			message: 'MCP system connect failed (bad): boom',
		};
		// Server peels Observable context seeds and connect()s throwError
		// onto ctx before runner.start (value seeds stay plain EC).
		node.ctxConnection.connect(throwError(() => ctxError));

		runtime.runner.start({
			p1: [{ portId: 'input', slotIndex: 0, value: 'hello' }],
		});

		const failed = await errorPromise;
		expect(String(failed[4])).toContain('MCP system connect failed');
		expect(contextSymbol).toBeDefined();

		runtime.runner.interrupt('cancel');
		runtime.runner.dispose();
		runtime.editor.dispose();
	});
});
