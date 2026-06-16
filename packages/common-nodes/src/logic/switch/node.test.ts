import { firstValueFrom, of, timeout } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { switchNode } from './node.js';

describe('common-switch node', () => {
	it('routes matching value to the rule output port', async () => {
		const instance = switchNode.getInstance();
		instance.ctxConnection.connect(
			of({
				projectDir: '/tmp',
				runId: 'test',
				nodeId: 'switch-1',
				params: {
					rules: [
						{ match: 'pass', output: 'pass' },
						{ match: 'fail', output: 'fail' },
					],
					matchMode: 'equals',
					defaultOutput: 'default',
				},
				uiSchema: switchNode.uiSchema,
			}),
		);
		instance.inputs.value.connect(of('pass'));

		await expect(
			firstValueFrom(instance.outputs.pass.value$),
		).resolves.toBe('pass');
	});

	it('routes unmatched value to default', async () => {
		const instance = switchNode.getInstance();
		instance.ctxConnection.connect(
			of({
				projectDir: '/tmp',
				runId: 'test',
				nodeId: 'switch-2',
				params: {
					rules: [{ match: 'pass', output: 'pass' }],
					matchMode: 'equals',
					defaultOutput: 'default',
				},
				uiSchema: switchNode.uiSchema,
			}),
		);
		instance.inputs.value.connect(of('other'));

		await expect(
			firstValueFrom(instance.outputs.default.value$),
		).resolves.toBe('other');
	});

	it('does not emit on non-matching ports', async () => {
		const instance = switchNode.getInstance();
		instance.ctxConnection.connect(
			of({
				projectDir: '/tmp',
				runId: 'test',
				nodeId: 'switch-3',
				params: {
					rules: [{ match: 'pass', output: 'pass' }],
					matchMode: 'equals',
					defaultOutput: 'default',
				},
				uiSchema: switchNode.uiSchema,
			}),
		);
		instance.inputs.value.connect(of('pass'));

		await expect(
			firstValueFrom(
				instance.outputs.fail.value$.pipe(timeout({ first: 40 })),
			),
		).rejects.toThrow();
	});
});
