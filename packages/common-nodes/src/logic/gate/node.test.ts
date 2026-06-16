import { firstValueFrom, of, timeout } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { gateNode } from './node.js';

describe('common-gate node', () => {
	it('forwards value when pass is true', async () => {
		const instance = gateNode.getInstance();
		instance.inputs.pass.connect(of(true));
		instance.inputs.value.connect(of('allowed'));

		await expect(
			firstValueFrom(instance.outputs.value.value$),
		).resolves.toBe('allowed');
	});

	it('emits nothing when pass is false', async () => {
		const instance = gateNode.getInstance();
		instance.inputs.pass.connect(of(false));
		instance.inputs.value.connect(of('blocked'));

		await expect(
			firstValueFrom(
				instance.outputs.value.value$.pipe(timeout({ first: 40 })),
			),
		).rejects.toThrow();
	});
});
