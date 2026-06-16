import { formatPortValue } from '../../sidebar/format-port-value';
import type { PortStreamItem, SequencedFrame } from '../types';

type PortStreamFrame = Pick<
	SequencedFrame,
	'source' | 'runId' | 'state' | 'value' | 'meta' | 'seq'
>;

const toolInteractionId = (
	meta: PortStreamFrame['meta'],
): string | undefined => {
	if (
		'interactionId' in meta &&
		(meta.presentation === 'tool-request' ||
			meta.presentation === 'tool-response')
	) {
		return meta.interactionId;
	}
	return undefined;
};

const isGrowingPresentation = (
	presentation: PortStreamFrame['meta']['presentation'],
): boolean =>
	presentation === 'reasoning' ||
	presentation === 'draft' ||
	presentation === 'tool' ||
	presentation === 'shell';

const toItem = (frame: PortStreamFrame): PortStreamItem => ({
	source: frame.source,
	runId: frame.runId,
	state: frame.state,
	value: frame.value,
	meta: frame.meta,
	seq: frame.seq,
});

/** Append a streaming chunk onto an open growing item's value. */
const appendGrowingValue = (prev: unknown, next: unknown): unknown => {
	if (typeof next === 'string') {
		if (typeof prev === 'string') {
			return prev + next;
		}
		const prevText = formatPortValue(prev);
		return prevText.length > 0 ? prevText + next : next;
	}
	const nextText = formatPortValue(next);
	if (nextText.length === 0) {
		return prev;
	}
	const prevText = typeof prev === 'string' ? prev : formatPortValue(prev);
	return prevText.length > 0 ? `${prevText}\n${nextText}` : nextText;
};

/** Tool request/response bodies are whole messages. */
const mergeToolBodies = (prev: unknown, next: unknown): string => {
	const left = formatPortValue(prev);
	const right = formatPortValue(next);
	if (left.length === 0) {
		return right;
	}
	if (right.length === 0) {
		return left;
	}
	return `${left}\n${right}`;
};

const findLastToolIndex = (
	items: readonly PortStreamItem[],
	interactionId: string,
): number => {
	for (let index = items.length - 1; index >= 0; index -= 1) {
		if (toolInteractionId(items[index]!.meta) === interactionId) {
			return index;
		}
	}
	return -1;
};

/**
 * Event-sourced port-stream fold: one frame in → updated item list.
 * Snapshots replay by reducing the frame sequence through this same function.
 */
export const foldPortStream = (
	items: readonly PortStreamItem[],
	frame: PortStreamFrame,
): readonly PortStreamItem[] => {
	const interactionId = toolInteractionId(frame.meta);
	if (interactionId !== undefined) {
		const index = findLastToolIndex(items, interactionId);
		if (index === -1) {
			return [...items, toItem(frame)];
		}
		const existing = items[index]!;
		const merged: PortStreamItem = {
			...existing,
			state: frame.state,
			meta: frame.meta,
			value: mergeToolBodies(existing.value, frame.value),
		};
		return items.map((item, itemIndex) =>
			itemIndex === index ? merged : item,
		);
	}

	const presentation = frame.meta.presentation;
	if (isGrowingPresentation(presentation)) {
		const last = items[items.length - 1];
		if (
			last !== undefined &&
			last.meta.presentation === presentation &&
			toolInteractionId(last.meta) === undefined
		) {
			return [
				...items.slice(0, -1),
				{
					...last,
					state: frame.state,
					meta: frame.meta,
					value: appendGrowingValue(last.value, frame.value),
				},
			];
		}
		return [...items, toItem(frame)];
	}

	return [...items, toItem(frame)];
};

/** Replay an ordered frame sequence through {@link foldPortStream}. */
export const replayPortStream = (
	frames: readonly PortStreamFrame[],
): readonly PortStreamItem[] => frames.reduce(foldPortStream, []);
