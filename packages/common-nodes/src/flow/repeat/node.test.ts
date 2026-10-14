import type { NodeStateHook, NodeStateJson } from '@langflower/node-sdk';
import {
	BehaviorSubject,
	firstValueFrom,
	of,
	Subject,
	type Observable,
} from 'rxjs';
import { describe, expect, it } from 'vitest';
import { repeatNode } from './node.js';

const collectPersist = (source: Observable<NodeStateJson>) => {
	const items: NodeStateJson[] = [];
	const sub = source.subscribe((item) => {
		items.push(item);
	});
	return {
		items,
		unsubscribe: () => {
			sub.unsubscribe();
		},
	};
};

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

const hookOf = (
	instance: ReturnType<typeof repeatNode.getInstance>,
): NodeStateHook => {
	const state = instance.state;

	if (state === undefined) {
		throw new Error('Repeat state hook is missing');
	}

	return state;
};

describe('common-repeat node', () => {
	it('emits value count times then done on the next trigger (count=2)', async () => {
		const instance = repeatNode.getInstance();
		const trigger$ = new Subject<unknown>();
		const values = collect(instance.outputs.value);
		const indices = collect(instance.outputs.index);
		const dones = collect(instance.outputs.done);

		instance.inputs.trigger.connect(trigger$);
		instance.inputs.count.connect(of(2));
		instance.inputs.value.connect(of('x'));

		await Promise.resolve();
		expect(values.items).toEqual(['x']);
		expect(indices.items).toEqual([0]);
		expect(dones.items).toEqual([]);

		trigger$.next(1);
		await Promise.resolve();
		expect(values.items).toEqual(['x', 'x']);
		expect(indices.items).toEqual([0, 1]);
		expect(dones.items).toEqual([]);

		trigger$.next(2);
		await Promise.resolve();
		expect(values.items).toEqual(['x', 'x']);
		expect(indices.items).toEqual([0, 1]);
		expect(dones.items).toEqual([true]);

		values.unsubscribe();
		indices.unsubscribe();
		dones.unsubscribe();
	});

	it('emits one value ASAP then done on next trigger (count=1)', async () => {
		const instance = repeatNode.getInstance();
		const trigger$ = new Subject<unknown>();
		const values = collect(instance.outputs.value);
		const indices = collect(instance.outputs.index);
		const dones = collect(instance.outputs.done);

		instance.inputs.trigger.connect(trigger$);
		instance.inputs.count.connect(of(1));
		instance.inputs.value.connect(of('once'));

		await Promise.resolve();
		expect(values.items).toEqual(['once']);
		expect(indices.items).toEqual([0]);

		trigger$.next('go');
		await Promise.resolve();
		expect(values.items).toEqual(['once']);
		expect(indices.items).toEqual([0]);
		expect(dones.items).toEqual([true]);

		values.unsubscribe();
		indices.unsubscribe();
		dones.unsubscribe();
	});

	it('emits done ASAP when count is 0', async () => {
		const instance = repeatNode.getInstance();
		const trigger$ = new Subject<unknown>();
		const values = collect(instance.outputs.value);
		const indices = collect(instance.outputs.index);
		const dones = collect(instance.outputs.done);

		instance.inputs.trigger.connect(trigger$);
		instance.inputs.count.connect(of(0));
		instance.inputs.value.connect(of('ignored'));

		await expect(
			firstValueFrom(instance.outputs.done.value$),
		).resolves.toBe(true);
		expect(values.items).toEqual([]);
		expect(indices.items).toEqual([]);

		values.unsubscribe();
		indices.unsubscribe();
		dones.unsubscribe();
	});

	it('resets session when value changes mid-wait', async () => {
		const instance = repeatNode.getInstance();
		const trigger$ = new Subject<unknown>();
		const value$ = new BehaviorSubject<string>('a');
		const values = collect(instance.outputs.value);
		const indices = collect(instance.outputs.index);
		const dones = collect(instance.outputs.done);

		instance.inputs.trigger.connect(trigger$);
		instance.inputs.count.connect(of(2));
		instance.inputs.value.connect(value$);

		await Promise.resolve();
		expect(values.items).toEqual(['a']);
		expect(indices.items).toEqual([0]);

		value$.next('b');
		await Promise.resolve();
		expect(values.items).toEqual(['a', 'b']);
		expect(indices.items).toEqual([0, 0]);

		trigger$.next(1);
		await Promise.resolve();
		expect(values.items).toEqual(['a', 'b', 'b']);
		expect(indices.items).toEqual([0, 0, 1]);
		expect(dones.items).toEqual([]);

		trigger$.next(2);
		await Promise.resolve();
		expect(dones.items).toEqual([true]);

		values.unsubscribe();
		indices.unsubscribe();
		dones.unsubscribe();
	});

	it('resets index sequence when count changes', async () => {
		const instance = repeatNode.getInstance();
		const trigger$ = new Subject<unknown>();
		const count$ = new BehaviorSubject<number>(2);
		const values = collect(instance.outputs.value);
		const indices = collect(instance.outputs.index);

		instance.inputs.trigger.connect(trigger$);
		instance.inputs.count.connect(count$);
		instance.inputs.value.connect(of('x'));

		await Promise.resolve();
		expect(values.items).toEqual(['x']);
		expect(indices.items).toEqual([0]);

		count$.next(3);
		await Promise.resolve();
		expect(values.items).toEqual(['x', 'x']);
		expect(indices.items).toEqual([0, 0]);

		trigger$.next(1);
		await Promise.resolve();
		expect(values.items).toEqual(['x', 'x', 'x']);
		expect(indices.items).toEqual([0, 0, 1]);

		values.unsubscribe();
		indices.unsubscribe();
	});

	it('persists the cursor after the first value', async () => {
		const instance = repeatNode.getInstance();
		const state = hookOf(instance);
		const persisted = collectPersist(state.persist$);
		const trigger$ = new Subject<unknown>();
		const indices = collect(instance.outputs.index);

		instance.inputs.trigger.connect(trigger$);
		instance.inputs.count.connect(of(2));
		instance.inputs.value.connect(of('x'));

		await Promise.resolve();
		expect(indices.items).toEqual([0]);
		expect(persisted.items).toEqual([
			{ nextIndex: 1, done: false, count: 2 },
		]);

		indices.unsubscribe();
		persisted.unsubscribe();
	});

	it('resumes at the saved index without replaying earlier values', async () => {
		const instance = repeatNode.getInstance();
		const restored = hookOf(instance).restore({
			nextIndex: 1,
			done: false,
			count: 2,
		});
		expect(restored).toEqual({ ok: true });

		const trigger$ = new Subject<unknown>();
		const values = collect(instance.outputs.value);
		const indices = collect(instance.outputs.index);
		const dones = collect(instance.outputs.done);

		instance.inputs.trigger.connect(trigger$);
		instance.inputs.count.connect(of(2));
		instance.inputs.value.connect(of('x'));

		await Promise.resolve();
		expect(values.items).toEqual(['x']);
		expect(indices.items).toEqual([1]);
		expect(dones.items).toEqual([]);

		trigger$.next(1);
		await Promise.resolve();
		expect(indices.items).toEqual([1]);
		expect(dones.items).toEqual([true]);

		values.unsubscribe();
		indices.unsubscribe();
		dones.unsubscribe();
	});

	it('stays quiet after a restored done cursor', async () => {
		const instance = repeatNode.getInstance();
		hookOf(instance).restore({
			nextIndex: 1,
			done: true,
			count: 1,
		});

		const trigger$ = new Subject<unknown>();
		const values = collect(instance.outputs.value);
		const indices = collect(instance.outputs.index);
		const dones = collect(instance.outputs.done);

		instance.inputs.trigger.connect(trigger$);
		instance.inputs.count.connect(of(1));
		instance.inputs.value.connect(of('x'));

		await Promise.resolve();
		trigger$.next(1);
		await Promise.resolve();
		expect(values.items).toEqual([]);
		expect(indices.items).toEqual([]);
		expect(dones.items).toEqual([]);

		values.unsubscribe();
		indices.unsubscribe();
		dones.unsubscribe();
	});

	it('starts at 0 when the restored count does not match', async () => {
		const instance = repeatNode.getInstance();
		hookOf(instance).restore({
			nextIndex: 1,
			done: false,
			count: 2,
		});

		const trigger$ = new Subject<unknown>();
		const indices = collect(instance.outputs.index);
		const persisted = collectPersist(hookOf(instance).persist$);

		instance.inputs.trigger.connect(trigger$);
		instance.inputs.count.connect(of(3));
		instance.inputs.value.connect(of('x'));

		await Promise.resolve();
		expect(indices.items).toEqual([0]);
		expect(persisted.items[0]).toEqual({
			nextIndex: 0,
			done: false,
			count: 3,
		});

		indices.unsubscribe();
		persisted.unsubscribe();
	});

	it('rejects an invalid cursor and starts at 0', async () => {
		const instance = repeatNode.getInstance();
		const restored = hookOf(instance).restore({
			nextIndex: -1,
			done: false,
			count: 2,
		});
		expect(restored).toEqual({
			ok: false,
			message: 'Repeat cursor is invalid',
		});

		const trigger$ = new Subject<unknown>();
		const indices = collect(instance.outputs.index);

		instance.inputs.trigger.connect(trigger$);
		instance.inputs.count.connect(of(2));
		instance.inputs.value.connect(of('x'));

		await Promise.resolve();
		expect(indices.items).toEqual([0]);

		indices.unsubscribe();
	});
});
