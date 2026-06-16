import { firstValueFrom, of, timeout } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { ifNode } from './node.js';

describe('common-if node', () => {
	it('routes value to true when condition is true', async () => {
		const instance = ifNode.getInstance();
		instance.inputs.condition.connect(of(true));
		instance.inputs.value.connect(of('branch-a'));

		await expect(
			firstValueFrom(instance.outputs.true.value$),
		).resolves.toBe('branch-a');
	});

	it('routes value to false when condition is false', async () => {
		const instance = ifNode.getInstance();
		instance.inputs.condition.connect(of(false));
		instance.inputs.value.connect(of('branch-b'));

		await expect(
			firstValueFrom(instance.outputs.false.value$),
		).resolves.toBe('branch-b');
	});

	it('does not emit on the inactive branch', async () => {
		const instance = ifNode.getInstance();
		instance.inputs.condition.connect(of(true));
		instance.inputs.value.connect(of('only-true'));

		await expect(
			firstValueFrom(
				instance.outputs.false.value$.pipe(timeout({ first: 40 })),
			),
		).rejects.toThrow();
	});
});
