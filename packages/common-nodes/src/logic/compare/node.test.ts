import { firstValueFrom, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { compareNode } from './node.js';

describe('common-compare node', () => {
	it('emits boolean result for eq', async () => {
		const instance = compareNode.getInstance();
		instance.ctxConnection.connect(
			of({
				projectDir: '/tmp',
				runId: 'test',
				nodeId: 'compare-1',
				params: { op: 'eq' },
				uiSchema: compareNode.uiSchema,
			}),
		);
		instance.inputs.a.connect(of(42));
		instance.inputs.b.connect(of(42));

		await expect(
			firstValueFrom(instance.outputs.result.value$),
		).resolves.toBe(true);
	});

	it('emits false for contains miss', async () => {
		const instance = compareNode.getInstance();
		instance.ctxConnection.connect(
			of({
				projectDir: '/tmp',
				runId: 'test',
				nodeId: 'compare-2',
				params: { op: 'contains' },
				uiSchema: compareNode.uiSchema,
			}),
		);
		instance.inputs.a.connect(of('alpha'));
		instance.inputs.b.connect(of('beta'));

		await expect(
			firstValueFrom(instance.outputs.result.value$),
		).resolves.toBe(false);
	});
});
