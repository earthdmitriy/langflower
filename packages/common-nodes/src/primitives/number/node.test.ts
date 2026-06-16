import { firstValueFrom, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { numberNode } from './node.js';

describe('common-number node', () => {
	it('passes the connected value input straight through to the value output', async () => {
		const instance = numberNode.getInstance();

		instance.inputs.value.connect(of(1000));

		await expect(
			firstValueFrom(instance.outputs.value.value$),
		).resolves.toBe(1000);
	});
});
