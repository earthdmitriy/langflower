import type { ResponseDto } from '@rx-evo/stateful-observable';
import { describe, expect, it } from 'vitest';
import { foldFeedLogEvent } from './feed-log-fold.js';
import {
	type EdgeId,
	type NodeId,
	type PortTelemetry,
	type RunId,
	type RuntimeFeedPortMeta,
	type RuntimeFeedRole,
	type RuntimeRunnerEvent,
} from './types.js';

const nodeId = (value: string): NodeId => value as NodeId;
const edgeId = (value: string): EdgeId => value as EdgeId;
const run = 'run-1' as RunId;

const draftFeed: RuntimeFeedPortMeta = {
	role: 'draft',
	streaming: true,
};

const fold = (
	events: readonly RuntimeRunnerEvent[],
): readonly RuntimeRunnerEvent[] => {
	const log: RuntimeRunnerEvent[] = [];
	for (const event of events) {
		const step = foldFeedLogEvent(log[log.length - 1], event);
		if (step.kind === 'merge') {
			log[log.length - 1] = step.frame;
		} else {
			log.push(event);
		}
	}
	return log;
};

const frame = (
	portDir: 'in' | 'out',
	node: string,
	port: string,
	response: ResponseDto<unknown>,
	options: {
		readonly portIdx?: number;
		readonly edgeIds?: readonly EdgeId[];
		readonly feed?: RuntimeFeedPortMeta | null;
	} = {},
): PortTelemetry => [
	portDir,
	nodeId(node),
	port,
	response,
	options.portIdx ?? 0,
	options.edgeIds ?? [],
	options.feed === undefined ? draftFeed : options.feed,
];

const text = (
	portDir: 'in' | 'out',
	node: string,
	port: string,
	value: string,
	options: {
		readonly portIdx?: number;
		readonly edgeIds?: readonly EdgeId[];
		readonly feed?: RuntimeFeedPortMeta | null;
	} = {},
): PortTelemetry => frame(portDir, node, port, { value }, options);

describe('foldFeedLogEvent', () => {
	it('opens a streaming frame and closes a done frame', () => {
		const event = text('out', 'agent', 'draft', 'Hel');
		expect(foldFeedLogEvent(undefined, event)).toEqual({
			kind: 'open',
			frame: event,
		});
		expect(foldFeedLogEvent(undefined, ['done', run])).toEqual({
			kind: 'closed',
		});
	});

	it('merges the next chunk into a new tuple', () => {
		const first = text('out', 'agent', 'draft', 'Hel');
		const second = text('out', 'agent', 'draft', 'lo');
		const step = foldFeedLogEvent(first, second);
		expect(step.kind).toBe('merge');
		if (step.kind !== 'merge') {
			return;
		}
		expect(step.frame[3]).toEqual({ value: 'Hello' });
		expect(step.frame[6]).toBe(first[6]);
		expect(second[3]).toEqual({ value: 'lo' });
	});

	it('appends the first frame onto an empty log', () => {
		const event = text('out', 'agent', 'draft', 'Hel');
		expect(fold([event])).toEqual([event]);
	});

	it('keeps a single frame unchanged', () => {
		const event = text('out', 'agent', 'draft', 'Hel');
		expect(fold([event])).toEqual([event]);
	});

	it('concatenates consecutive string chunks and keeps the first frame', () => {
		const edges: readonly EdgeId[] = [edgeId('e1')];
		const first = text('out', 'agent', 'draft', 'Hel', { edgeIds: edges });
		const second = text('out', 'agent', 'draft', 'lo', { edgeIds: edges });
		const third = text('out', 'agent', 'draft', '!', { edgeIds: edges });

		const folded = fold([first, second, third]);

		expect(folded).toHaveLength(1);
		expect(folded[0]?.[3]).toEqual({ value: 'Hello!' });
		expect(folded[0]?.[4]).toBe(first[4]);
		expect(folded[0]?.[5]).toBe(first[5]);
		expect(folded[0]?.[6]).toBe(first[6]);
	});

	it('concatenates an empty string chunk', () => {
		expect(
			fold([
				text('out', 'agent', 'draft', ''),
				text('out', 'agent', 'draft', 'a'),
			])[0]?.[3],
		).toEqual({ value: 'a' });
	});

	it('merges reasoning, progress, draft, and shell', () => {
		const roles: readonly RuntimeFeedRole[] = [
			'reasoning',
			'progress',
			'draft',
			'shell',
		];
		for (const role of roles) {
			const feed: RuntimeFeedPortMeta = { role, streaming: true };
			const folded = fold([
				text('out', 'agent', role, 'a', { feed }),
				text('out', 'agent', role, 'b', { feed }),
			]);
			expect(folded).toHaveLength(1);
			expect(folded[0]?.[3]).toEqual({ value: 'ab' });
		}
	});

	it('merges feeds that differ only by key order', () => {
		const left: RuntimeFeedPortMeta = { role: 'draft', streaming: true };
		const right: RuntimeFeedPortMeta = { streaming: true, role: 'draft' };
		const folded = fold([
			text('out', 'agent', 'draft', 'a', { feed: left }),
			text('out', 'agent', 'draft', 'b', { feed: right }),
		]);
		expect(folded).toHaveLength(1);
		expect(folded[0]?.[3]).toEqual({ value: 'ab' });
		expect(folded[0]?.[6]).toBe(left);
	});

	it('does not merge tool, result, recovery, or none', () => {
		const roles: readonly RuntimeFeedRole[] = [
			'tool',
			'result',
			'recovery',
			'none',
		];
		for (const role of roles) {
			const feed: RuntimeFeedPortMeta = { role, streaming: true };
			expect(
				fold([
					text('out', 'agent', role, 'a', { feed }),
					text('out', 'agent', role, 'b', { feed }),
				]),
			).toHaveLength(2);
		}
	});

	it('does not merge when streaming is off or the feed is absent', () => {
		expect(
			fold([
				text('out', 'agent', 'draft', 'a', { feed: { role: 'draft' } }),
				text('out', 'agent', 'draft', 'b', { feed: { role: 'draft' } }),
			]),
		).toHaveLength(2);
		expect(
			fold([
				text('out', 'agent', 'draft', 'a', { feed: null }),
				text('out', 'agent', 'draft', 'b', { feed: null }),
			]),
		).toHaveLength(2);
	});

	it('does not merge pending, error, or inactive frames', () => {
		expect(
			fold([
				text('out', 'agent', 'draft', 'a'),
				frame('out', 'agent', 'draft', { pending: true }),
				text('out', 'agent', 'draft', 'b'),
			]),
		).toEqual([
			text('out', 'agent', 'draft', 'a'),
			frame('out', 'agent', 'draft', { pending: true }),
			text('out', 'agent', 'draft', 'b'),
		]);
		expect(
			fold([
				text('out', 'agent', 'draft', 'a'),
				frame('out', 'agent', 'draft', { error: 'boom' }),
				text('out', 'agent', 'draft', 'b'),
			]),
		).toHaveLength(3);
		expect(
			fold([
				text('out', 'agent', 'draft', 'a'),
				frame('out', 'agent', 'draft', { inactive: true }),
				text('out', 'agent', 'draft', 'b'),
			]),
		).toHaveLength(3);
	});

	it('does not merge non-string values', () => {
		expect(
			fold([
				frame('out', 'agent', 'draft', { value: 1 }),
				frame('out', 'agent', 'draft', { value: 2 }),
			]),
		).toHaveLength(2);
		expect(
			fold([
				frame('out', 'agent', 'draft', { value: { n: 1 } }),
				frame('out', 'agent', 'draft', { value: { n: 2 } }),
			]),
		).toHaveLength(2);
	});

	it('does not merge a different lane, port index, or edge id sequence', () => {
		expect(
			fold([
				text('out', 'agent', 'draft', 'a'),
				text('out', 'other', 'draft', 'b'),
			]),
		).toHaveLength(2);
		expect(
			fold([
				text('out', 'agent', 'draft', 'a'),
				text('out', 'agent', 'reasoning', 'b'),
			]),
		).toHaveLength(2);
		expect(
			fold([
				text('out', 'agent', 'draft', 'a'),
				text('in', 'agent', 'draft', 'b'),
			]),
		).toHaveLength(2);
		expect(
			fold([
				text('out', 'agent', 'draft', 'a', { portIdx: 0 }),
				text('out', 'agent', 'draft', 'b', { portIdx: 1 }),
			]),
		).toHaveLength(2);
		expect(
			fold([
				text('out', 'agent', 'draft', 'a', {
					edgeIds: [edgeId('e1')],
				}),
				text('out', 'agent', 'draft', 'b', {
					edgeIds: [edgeId('e2')],
				}),
			]),
		).toHaveLength(2);
		expect(
			fold([
				text('out', 'agent', 'draft', 'a', {
					edgeIds: [edgeId('e1'), edgeId('e2')],
				}),
				text('out', 'agent', 'draft', 'b', {
					edgeIds: [edgeId('e2'), edgeId('e1')],
				}),
			]),
		).toHaveLength(2);
	});

	it('does not merge when closesPreviousVisit differs', () => {
		const open: RuntimeFeedPortMeta = { role: 'draft', streaming: true };
		const closing: RuntimeFeedPortMeta = {
			role: 'draft',
			streaming: true,
			closesPreviousVisit: true,
		};
		expect(
			fold([
				text('out', 'agent', 'draft', 'a', { feed: open }),
				text('out', 'agent', 'draft', 'b', { feed: closing }),
			]),
		).toHaveLength(2);
	});

	it('keeps a done frame as its own entry', () => {
		const chunk = text('out', 'agent', 'draft', 'a');
		expect(fold([chunk, ['done', run]])).toEqual([chunk, ['done', run]]);
		expect(fold([['done'], chunk])).toEqual([['done'], chunk]);
		expect(
			fold([chunk, ['done', run], text('out', 'agent', 'draft', 'b')]),
		).toHaveLength(3);
	});

	it('keeps draft, tool, and draft as three segments', () => {
		const tool: RuntimeFeedPortMeta = { role: 'tool', streaming: true };
		const folded = fold([
			text('out', 'agent', 'draft', 'Hel'),
			text('out', 'agent', 'draft', 'lo'),
			text('out', 'agent', 'tool', 'lookup', { feed: tool }),
			text('out', 'agent', 'draft', 'wor'),
			text('out', 'agent', 'draft', 'ld'),
		]);
		expect(folded.map((event) => event[3])).toEqual([
			{ value: 'Hello' },
			{ value: 'lookup' },
			{ value: 'world' },
		]);
	});

	it('does not merge a wired lane that interleaves in frames', () => {
		const edges: readonly EdgeId[] = [edgeId('e1')];
		const out = (value: string): PortTelemetry =>
			text('out', 'src', 'draft', value, { edgeIds: edges });
		const inn = (value: string): PortTelemetry =>
			text('in', 'sink', 'value', value, { edgeIds: edges });
		const raw = [out('a'), inn('a'), out('b'), inn('b')];

		expect(fold(raw)).toEqual(raw);
		expect(fold([out('a'), out('b')])).toHaveLength(1);
	});

	it('is a no-op when the log is already folded', () => {
		const tool: RuntimeFeedPortMeta = { role: 'tool', streaming: true };
		const raw: readonly RuntimeRunnerEvent[] = [
			text('out', 'agent', 'draft', 'a'),
			text('out', 'agent', 'draft', 'b'),
			text('out', 'agent', 'tool', 'lookup', { feed: tool }),
			text('out', 'agent', 'draft', 'c'),
			text('out', 'agent', 'draft', 'd'),
			['done', run],
		];
		const once = fold(raw);
		expect(fold(once)).toEqual(once);
	});
});
