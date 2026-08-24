import {
	BehaviorSubject,
	firstValueFrom,
	of,
	Subject,
	type Observable,
} from 'rxjs';
import { describe, expect, it } from 'vitest';
import { splitPacedNode } from './node.js';

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

describe('common-split-paced node', () => {
	it('emits chunks ASAP then on trigger, then finish (three lines)', async () => {
		const instance = splitPacedNode.getInstance();
		const trigger$ = new Subject<unknown>();
		const texts = collect(instance.outputs.text);
		const indices = collect(instance.outputs.index);
		const finishes = collect(instance.outputs.finish);

		instance.inputs.trigger.connect(trigger$);
		instance.inputs.divider.connect(of('\\n'));
		instance.inputs.startFrom.connect(of(0));
		instance.inputs.text.connect(of('a\nb\nc'));

		await Promise.resolve();
		expect(texts.items).toEqual(['a']);
		expect(indices.items).toEqual([0]);
		expect(finishes.items).toEqual([]);

		trigger$.next(1);
		await Promise.resolve();
		expect(texts.items).toEqual(['a', 'b']);
		expect(indices.items).toEqual([0, 1]);

		trigger$.next(2);
		await Promise.resolve();
		expect(texts.items).toEqual(['a', 'b', 'c']);
		expect(indices.items).toEqual([0, 1, 2]);
		expect(finishes.items).toEqual([]);

		trigger$.next(3);
		await Promise.resolve();
		expect(texts.items).toEqual(['a', 'b', 'c']);
		expect(indices.items).toEqual([0, 1, 2]);
		expect(finishes.items).toEqual([true]);

		texts.unsubscribe();
		indices.unsubscribe();
		finishes.unsubscribe();
	});

	it('drops empty chunks after split', async () => {
		const instance = splitPacedNode.getInstance();
		const trigger$ = new Subject<unknown>();
		const texts = collect(instance.outputs.text);
		const indices = collect(instance.outputs.index);

		instance.inputs.trigger.connect(trigger$);
		instance.inputs.divider.connect(of('\\n'));
		instance.inputs.startFrom.connect(of(0));
		instance.inputs.text.connect(of('a\n\nb'));

		await Promise.resolve();
		expect(texts.items).toEqual(['a']);
		expect(indices.items).toEqual([0]);

		trigger$.next(1);
		await Promise.resolve();
		expect(texts.items).toEqual(['a', 'b']);
		expect(indices.items).toEqual([0, 1]);

		texts.unsubscribe();
		indices.unsubscribe();
	});

	it('emits from startFrom with absolute index', async () => {
		const instance = splitPacedNode.getInstance();
		const trigger$ = new Subject<unknown>();
		const texts = collect(instance.outputs.text);
		const indices = collect(instance.outputs.index);

		instance.inputs.trigger.connect(trigger$);
		instance.inputs.divider.connect(of('\\n'));
		instance.inputs.startFrom.connect(of(1));
		instance.inputs.text.connect(of('a\nb\nc'));

		await Promise.resolve();
		expect(texts.items).toEqual(['b']);
		expect(indices.items).toEqual([1]);

		texts.unsubscribe();
		indices.unsubscribe();
	});

	it('emits finish ASAP when startFrom is past the end', async () => {
		const instance = splitPacedNode.getInstance();
		const trigger$ = new Subject<unknown>();
		const texts = collect(instance.outputs.text);
		const indices = collect(instance.outputs.index);

		instance.inputs.trigger.connect(trigger$);
		instance.inputs.divider.connect(of('\\n'));
		instance.inputs.startFrom.connect(of(5));
		instance.inputs.text.connect(of('a\nb'));

		await expect(
			firstValueFrom(instance.outputs.finish.value$),
		).resolves.toBe(true);
		expect(texts.items).toEqual([]);
		expect(indices.items).toEqual([]);

		texts.unsubscribe();
		indices.unsubscribe();
	});

	it('emits finish ASAP when text is empty', async () => {
		const instance = splitPacedNode.getInstance();
		const trigger$ = new Subject<unknown>();
		const texts = collect(instance.outputs.text);

		instance.inputs.trigger.connect(trigger$);
		instance.inputs.divider.connect(of('\\n'));
		instance.inputs.startFrom.connect(of(0));
		instance.inputs.text.connect(of(''));

		await expect(
			firstValueFrom(instance.outputs.finish.value$),
		).resolves.toBe(true);
		expect(texts.items).toEqual([]);

		texts.unsubscribe();
	});

	it('resets session when text changes mid-wait', async () => {
		const instance = splitPacedNode.getInstance();
		const trigger$ = new Subject<unknown>();
		const text$ = new BehaviorSubject<string>('a\nb');
		const texts = collect(instance.outputs.text);
		const indices = collect(instance.outputs.index);
		const finishes = collect(instance.outputs.finish);

		instance.inputs.trigger.connect(trigger$);
		instance.inputs.divider.connect(of('\\n'));
		instance.inputs.startFrom.connect(of(0));
		instance.inputs.text.connect(text$);

		await Promise.resolve();
		expect(texts.items).toEqual(['a']);
		expect(indices.items).toEqual([0]);

		text$.next('x\ny');
		await Promise.resolve();
		expect(texts.items).toEqual(['a', 'x']);
		expect(indices.items).toEqual([0, 0]);

		trigger$.next(1);
		await Promise.resolve();
		expect(texts.items).toEqual(['a', 'x', 'y']);
		expect(indices.items).toEqual([0, 0, 1]);
		expect(finishes.items).toEqual([]);

		trigger$.next(2);
		await Promise.resolve();
		expect(finishes.items).toEqual([true]);

		texts.unsubscribe();
		indices.unsubscribe();
		finishes.unsubscribe();
	});

	it('replaces literal \\n in divider with a line break', async () => {
		const instance = splitPacedNode.getInstance();
		const trigger$ = new Subject<unknown>();
		const texts = collect(instance.outputs.text);

		instance.inputs.trigger.connect(trigger$);
		instance.inputs.divider.connect(of('\\n'));
		instance.inputs.startFrom.connect(of(0));
		instance.inputs.text.connect(of('a\nb'));

		await Promise.resolve();
		expect(texts.items).toEqual(['a']);

		texts.unsubscribe();
	});

	it('strips leftover trailing \\r from CRLF pieces', async () => {
		const instance = splitPacedNode.getInstance();
		const trigger$ = new Subject<unknown>();
		const texts = collect(instance.outputs.text);
		const indices = collect(instance.outputs.index);

		instance.inputs.trigger.connect(trigger$);
		instance.inputs.divider.connect(of('\\n'));
		instance.inputs.startFrom.connect(of(0));
		instance.inputs.text.connect(of('a\r\nb\r\n'));

		await Promise.resolve();
		expect(texts.items).toEqual(['a']);
		expect(indices.items).toEqual([0]);

		trigger$.next(1);
		await Promise.resolve();
		expect(texts.items).toEqual(['a', 'b']);
		expect(indices.items).toEqual([0, 1]);

		texts.unsubscribe();
		indices.unsubscribe();
	});
});
