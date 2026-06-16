import {
	BehaviorSubject,
	firstValueFrom,
	of,
	Subject,
	type Observable,
} from 'rxjs';
import { describe, expect, it } from 'vitest';
import { repeatNode } from './node.js';

const collect = <T>(source: { readonly value$: Observable<T> }) => {
	const items: T[] = [];
	const sub = source.value$.subscribe((item) => {
		items.push(item);
	});
	return {
		items,
		unsubscribe: () => {
			sub.unsubscribe();
		},
	};
};

describe('common-repeat node', () => {
	it('emits value count times then done on the next trigger (count=2)', async () => {
		const instance = repeatNode.getInstance();
		const trigger$ = new Subject<unknown>();
		const values = collect(instance.outputs.value);
		const dones = collect(instance.outputs.done);

		instance.inputs.trigger.connect(trigger$);
		instance.inputs.count.connect(of(2));
		instance.inputs.value.connect(of('x'));

		await Promise.resolve();
		expect(values.items).toEqual(['x']);
		expect(dones.items).toEqual([]);

		trigger$.next(1);
		await Promise.resolve();
		expect(values.items).toEqual(['x', 'x']);
		expect(dones.items).toEqual([]);

		trigger$.next(2);
		await Promise.resolve();
		expect(values.items).toEqual(['x', 'x']);
		expect(dones.items).toEqual([true]);

		values.unsubscribe();
		dones.unsubscribe();
	});

	it('emits one value ASAP then done on next trigger (count=1)', async () => {
		const instance = repeatNode.getInstance();
		const trigger$ = new Subject<unknown>();
		const values = collect(instance.outputs.value);
		const dones = collect(instance.outputs.done);

		instance.inputs.trigger.connect(trigger$);
		instance.inputs.count.connect(of(1));
		instance.inputs.value.connect(of('once'));

		await Promise.resolve();
		expect(values.items).toEqual(['once']);

		trigger$.next('go');
		await Promise.resolve();
		expect(values.items).toEqual(['once']);
		expect(dones.items).toEqual([true]);

		values.unsubscribe();
		dones.unsubscribe();
	});

	it('emits done ASAP when count is 0', async () => {
		const instance = repeatNode.getInstance();
		const trigger$ = new Subject<unknown>();
		const values = collect(instance.outputs.value);
		const dones = collect(instance.outputs.done);

		instance.inputs.trigger.connect(trigger$);
		instance.inputs.count.connect(of(0));
		instance.inputs.value.connect(of('ignored'));

		await expect(
			firstValueFrom(instance.outputs.done.value$),
		).resolves.toBe(true);
		expect(values.items).toEqual([]);

		values.unsubscribe();
		dones.unsubscribe();
	});

	it('resets session when value changes mid-wait', async () => {
		const instance = repeatNode.getInstance();
		const trigger$ = new Subject<unknown>();
		const value$ = new BehaviorSubject<string>('a');
		const values = collect(instance.outputs.value);
		const dones = collect(instance.outputs.done);

		instance.inputs.trigger.connect(trigger$);
		instance.inputs.count.connect(of(2));
		instance.inputs.value.connect(value$);

		await Promise.resolve();
		expect(values.items).toEqual(['a']);

		value$.next('b');
		await Promise.resolve();
		expect(values.items).toEqual(['a', 'b']);

		trigger$.next(1);
		await Promise.resolve();
		expect(values.items).toEqual(['a', 'b', 'b']);
		expect(dones.items).toEqual([]);

		trigger$.next(2);
		await Promise.resolve();
		expect(dones.items).toEqual([true]);

		values.unsubscribe();
		dones.unsubscribe();
	});
});
