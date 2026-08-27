import { firstValueFrom, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { delayNode } from './node.js';
import { repeatNode } from '../repeat/node.js';

describe('common-delay', () => {
	it('emits pending before the delayed value', async () => {
		const instance = delayNode.getInstance();
		const pendingSeen: boolean[] = [];
		const values: unknown[] = [];
		const sub = instance.outputs.value.subscribe({
			pending: (pending) => {
				pendingSeen.push(pending);
			},
			next: (value) => {
				values.push(value);
			},
		});

		instance.inputs.delay.connect(of(25));
		instance.inputs.value.connect(of('later'));

		await expect(
			firstValueFrom(instance.outputs.value.value$),
		).resolves.toBe('later');
		sub.unsubscribe();

		expect(pendingSeen).toContain(true);
		expect(values).toEqual(['later']);
	});

	it('emits pending on each Repeat tick', async () => {
		const delayInst = delayNode.getInstance();
		const repeatInst = repeatNode.getInstance();
		const pendingTrueCount = { n: 0 };
		const sub = delayInst.outputs.value.subscribe({
			pending: (pending) => {
				if (pending) {
					pendingTrueCount.n += 1;
				}
			},
		});

		delayInst.inputs.delay.connect(of(20));
		delayInst.inputs.value.connect(repeatInst.outputs.value.value$);
		repeatInst.inputs.trigger.connect(delayInst.outputs.value.value$);
		repeatInst.inputs.count.connect(of(2));
		repeatInst.inputs.value.connect(of('tick'));

		await firstValueFrom(repeatInst.outputs.done.value$);
		sub.unsubscribe();

		expect(pendingTrueCount.n).toBeGreaterThanOrEqual(2);
	});
});
