import type { ResponseDto } from '@rx-evo/stateful-observable';
import {
	isPortTelemetry,
	type EdgeId,
	type PortTelemetry,
	type RuntimeFeedPortMeta,
	type RuntimeFeedRole,
	type RuntimeRunnerEvent,
} from './types.js';

const GROWING_ROLES = new Set<RuntimeFeedRole>([
	'reasoning',
	'progress',
	'draft',
	'shell',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const deepEqual = (left: unknown, right: unknown): boolean => {
	if (Object.is(left, right)) {
		return true;
	}
	if (Array.isArray(left) || Array.isArray(right)) {
		if (!Array.isArray(left) || !Array.isArray(right)) {
			return false;
		}
		if (left.length !== right.length) {
			return false;
		}
		for (let index = 0; index < left.length; index += 1) {
			if (!deepEqual(left[index], right[index])) {
				return false;
			}
		}
		return true;
	}
	if (!isRecord(left) || !isRecord(right)) {
		return false;
	}
	const leftKeys = Object.keys(left);
	const rightKeys = Object.keys(right);
	if (leftKeys.length !== rightKeys.length) {
		return false;
	}
	for (const key of leftKeys) {
		if (!Object.prototype.hasOwnProperty.call(right, key)) {
			return false;
		}
		if (!deepEqual(left[key], right[key])) {
			return false;
		}
	}
	return true;
};

const sameEdgeIds = (
	left: readonly EdgeId[],
	right: readonly EdgeId[],
): boolean => {
	if (left.length !== right.length) {
		return false;
	}
	for (let index = 0; index < left.length; index += 1) {
		if (left[index] !== right[index]) {
			return false;
		}
	}
	return true;
};

const isStringValueResponse = (
	response: ResponseDto<unknown>,
): response is { readonly value: string } =>
	'value' in response &&
	typeof response.value === 'string' &&
	!('pending' in response) &&
	!('error' in response) &&
	!('inactive' in response);

const isGrowingFeed = (feed: RuntimeFeedPortMeta | null): boolean =>
	feed !== null &&
	feed.streaming === true &&
	feed.role !== undefined &&
	GROWING_ROLES.has(feed.role);

const canMergePortFrames = (
	tail: PortTelemetry,
	event: PortTelemetry,
): boolean => {
	if (
		tail[0] !== event[0] ||
		tail[1] !== event[1] ||
		tail[2] !== event[2] ||
		tail[4] !== event[4]
	) {
		return false;
	}
	if (!sameEdgeIds(tail[5], event[5]) || !deepEqual(tail[6], event[6])) {
		return false;
	}
	if (!isGrowingFeed(tail[6]) || !isGrowingFeed(event[6])) {
		return false;
	}
	return isStringValueResponse(tail[3]) && isStringValueResponse(event[3]);
};

/**
 * One step of the retained-log fold.
 *
 * `merge` — `event` extends `tail`. Replace the held frame; do not emit.
 * `open` — `event` starts a streaming series (`reasoning`, `progress`,
 * `draft`, `shell`, `{ value: string }`). Emit the previous held frame,
 * then hold `event`.
 * `closed` — `event` is not an open streaming series. Emit the previous
 * held frame, then emit `event`, and hold nothing.
 *
 * A merge copies `tail` into a new tuple and sets `value` to
 * `previous + next`. It does not mutate `event`. A wired streaming port
 * interleaves an `in` frame after every `out` chunk, so those lanes do
 * not merge. Folding an already folded series is a no-op.
 */
export type FeedLogFoldStep =
	| { readonly kind: 'merge'; readonly frame: PortTelemetry }
	| { readonly kind: 'open'; readonly frame: PortTelemetry }
	| { readonly kind: 'closed' };

const isOpenStreamingFrame = (
	event: RuntimeRunnerEvent,
): event is PortTelemetry =>
	isPortTelemetry(event) &&
	isGrowingFeed(event[6]) &&
	isStringValueResponse(event[3]);

const mergedFrame = (
	tail: PortTelemetry,
	event: PortTelemetry,
): PortTelemetry | undefined => {
	const previous = tail[3];
	const next = event[3];
	if (!isStringValueResponse(previous) || !isStringValueResponse(next)) {
		return undefined;
	}
	return [
		tail[0],
		tail[1],
		tail[2],
		{ value: previous.value + next.value },
		tail[4],
		tail[5],
		tail[6],
	];
};

export const foldFeedLogEvent = (
	tail: RuntimeRunnerEvent | undefined,
	event: RuntimeRunnerEvent,
): FeedLogFoldStep => {
	if (
		tail !== undefined &&
		isPortTelemetry(tail) &&
		isPortTelemetry(event) &&
		canMergePortFrames(tail, event)
	) {
		const frame = mergedFrame(tail, event);
		if (frame !== undefined) {
			return { kind: 'merge', frame };
		}
	}
	if (isOpenStreamingFrame(event)) {
		return { kind: 'open', frame: event };
	}
	return { kind: 'closed' };
};
