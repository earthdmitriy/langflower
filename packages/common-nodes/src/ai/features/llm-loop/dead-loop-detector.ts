import { DEFAULT_LLM_RECOVERY_POLICY } from './llm-loop-types.js';

const DEFAULT_DEAD_LOOP_OPTIONS = DEFAULT_LLM_RECOVERY_POLICY.deadLoop;

export type DeadLoopChannel = 'reasoning' | 'draft';

export type DeadLoopDetectorOptions = {
	readonly maxWindowTokens?: number;
	readonly consecutiveThreshold?: number;
	readonly minRepetitions?: number;
	readonly minPatternTokens?: number;
	readonly structuralRunCap?: number;
};

const LETTER = /\p{L}/u;

const hasLetter = (text: string): boolean => {
	LETTER.lastIndex = 0;
	return LETTER.test(text);
};

/** Punctuation, digits, whitespace, or a single character (e.g. `"1"`, `"-"`). */
const isStructuralDelta = (text: string): boolean =>
	text.length < 2 || !hasLetter(text);

type DeadLoopError = {
	readonly name: 'DeadLoopError';
	readonly message: string;
	readonly partialText: string;
	readonly lastTokens: readonly string[];
	readonly reason: 'consecutive' | 'cyclic';
	readonly channel: DeadLoopChannel;
};

type DeadLoopPushResult =
	| { readonly ok: true }
	| { readonly ok: false; readonly error: DeadLoopError };

export type DeadLoopDetector = {
	readonly hashLookups: number;
	readonly exactCompareTokenVisits: number;
	readonly push: (text: string) => DeadLoopPushResult;
};

const BASE1 = 911_382_323;
const BASE2 = 972_663_749;
const FNV_OFFSET1 = 2_166_136_261;
const FNV_OFFSET2 = 84_696_351;
const FNV_PRIME = 16_777_619;

const hashString = (text: string, offset: number): number => {
	let hash = offset >>> 0;
	for (let index = 0; index < text.length; index += 1) {
		hash ^= text.charCodeAt(index);
		hash = Math.imul(hash, FNV_PRIME);
	}

	return hash >>> 0;
};

const createPowTable = (base: number, maxExponent: number): Uint32Array => {
	const table = new Uint32Array(maxExponent + 1);
	table[0] = 1;
	for (let exponent = 1; exponent <= maxExponent; exponent += 1) {
		table[exponent] = Math.imul(table[exponent - 1] ?? 1, base) >>> 0;
	}

	return table;
};

export const createDeadLoopDetector = (
	channel: DeadLoopChannel,
	options: DeadLoopDetectorOptions = {},
): DeadLoopDetector => {
	const maxWindowTokens =
		options.maxWindowTokens ?? DEFAULT_DEAD_LOOP_OPTIONS.maxWindowTokens;
	const consecutiveThreshold =
		options.consecutiveThreshold ??
		DEFAULT_DEAD_LOOP_OPTIONS.consecutiveThreshold;
	const minRepetitions =
		options.minRepetitions ?? DEFAULT_DEAD_LOOP_OPTIONS.minRepetitions;
	const minPatternTokens =
		options.minPatternTokens ?? DEFAULT_DEAD_LOOP_OPTIONS.minPatternTokens;
	const structuralRunCap =
		options.structuralRunCap ?? DEFAULT_DEAD_LOOP_OPTIONS.structuralRunCap;
	const capacity = Math.max(1, maxWindowTokens);
	const tokens = new Array<string>(capacity);
	const hashes1 = new Uint32Array(capacity);
	const hashes2 = new Uint32Array(capacity);
	const prefix1 = new Uint32Array(capacity + 1);
	const prefix2 = new Uint32Array(capacity + 1);
	const pow1 = createPowTable(BASE1, capacity);
	const pow2 = createPowTable(BASE2, capacity);
	const stats = {
		hashLookups: 0,
		exactCompareTokenVisits: 0,
	};
	let head = 0;
	let size = 0;
	let consecutiveCount = 0;

	const physicalIndex = (logical: number): number =>
		(head + logical) % capacity;

	const tokenAt = (logical: number): string =>
		tokens[physicalIndex(logical)] ?? '';

	const dropOldest = (): void => {
		const removedPhysical = head;
		const removed1 = hashes1[removedPhysical] ?? 0;
		const removed2 = hashes2[removedPhysical] ?? 0;
		for (let logical = 1; logical < size; logical += 1) {
			prefix1[logical] =
				((prefix1[logical + 1] ?? 0) -
					Math.imul(removed1, pow1[logical] ?? 1)) >>>
				0;
			prefix2[logical] =
				((prefix2[logical + 1] ?? 0) -
					Math.imul(removed2, pow2[logical] ?? 1)) >>>
				0;
		}
		prefix1[0] = 0;
		prefix2[0] = 0;
		head = (head + 1) % capacity;
		size -= 1;
	};

	const appendPrefix = (physical: number): void => {
		prefix1[size] =
			(Math.imul(prefix1[size - 1] ?? 0, BASE1) +
				(hashes1[physical] ?? 0)) >>>
			0;
		prefix2[size] =
			(Math.imul(prefix2[size - 1] ?? 0, BASE2) +
				(hashes2[physical] ?? 0)) >>>
			0;
	};

	const rangeHashesEqual = (
		leftStart: number,
		rightStart: number,
		length: number,
	): boolean => {
		stats.hashLookups += 1;
		const leftEnd = leftStart + length;
		const rightEnd = rightStart + length;
		const powA = pow1[length] ?? 1;
		const powB = pow2[length] ?? 1;
		const left1 =
			((prefix1[leftEnd] ?? 0) -
				Math.imul(prefix1[leftStart] ?? 0, powA)) >>>
			0;
		const right1 =
			((prefix1[rightEnd] ?? 0) -
				Math.imul(prefix1[rightStart] ?? 0, powA)) >>>
			0;
		if (left1 !== right1) {
			return false;
		}

		const left2 =
			((prefix2[leftEnd] ?? 0) -
				Math.imul(prefix2[leftStart] ?? 0, powB)) >>>
			0;
		const right2 =
			((prefix2[rightEnd] ?? 0) -
				Math.imul(prefix2[rightStart] ?? 0, powB)) >>>
			0;

		return left2 === right2;
	};

	const sliceTokens = (start: number, end: number): readonly string[] => {
		const sliced: string[] = [];
		for (let logical = start; logical < end; logical += 1) {
			sliced.push(tokenAt(logical));
		}

		return sliced;
	};

	const joinTokens = (): string => {
		let text = '';
		for (let logical = 0; logical < size; logical += 1) {
			text += tokenAt(logical);
		}

		return text;
	};

	const exactBlocksMatch = (patternLength: number): boolean => {
		const baseStart = size - patternLength;
		for (let repeat = 1; repeat < minRepetitions; repeat += 1) {
			const otherStart = size - (repeat + 1) * patternLength;
			for (let offset = 0; offset < patternLength; offset += 1) {
				stats.exactCompareTokenVisits += 1;
				if (
					tokenAt(baseStart + offset) !== tokenAt(otherStart + offset)
				) {
					return false;
				}
			}
		}

		return true;
	};

	const fail = (
		reason: 'consecutive' | 'cyclic',
		lastTokens: readonly string[],
	): DeadLoopPushResult => ({
		ok: false,
		error: {
			name: 'DeadLoopError',
			message:
				reason === 'consecutive'
					? `Consecutive token repetition on ${channel}`
					: `Cyclic repetition on ${channel}`,
			partialText: joinTokens(),
			lastTokens,
			reason,
			channel,
		},
	});

	const detectCyclic = (): DeadLoopPushResult | undefined => {
		const maxPatternLength = Math.floor(size / minRepetitions);
		for (
			let patternLength = minPatternTokens;
			patternLength <= maxPatternLength;
			patternLength += 1
		) {
			const blockStart = size - patternLength;
			let repeats = true;
			for (let repeat = 1; repeat < minRepetitions; repeat += 1) {
				const start = size - (repeat + 1) * patternLength;
				if (!rangeHashesEqual(start, blockStart, patternLength)) {
					repeats = false;
					break;
				}
			}

			if (!repeats) {
				continue;
			}

			let patternHasLetter = false;
			for (let offset = 0; offset < patternLength; offset += 1) {
				if (hasLetter(tokenAt(blockStart + offset))) {
					patternHasLetter = true;
					break;
				}
			}

			if (!patternHasLetter) {
				continue;
			}

			if (exactBlocksMatch(patternLength)) {
				return fail('cyclic', sliceTokens(blockStart, size));
			}
		}

		return undefined;
	};

	const push = (text: string): DeadLoopPushResult => {
		if (text.length === 0) {
			return { ok: true };
		}

		const previous = size === 0 ? undefined : tokenAt(size - 1);
		consecutiveCount = previous === text ? consecutiveCount + 1 : 1;

		if (size === capacity) {
			dropOldest();
		}

		const physical = physicalIndex(size);
		tokens[physical] = text;
		hashes1[physical] = hashString(text, FNV_OFFSET1);
		hashes2[physical] = hashString(text, FNV_OFFSET2);
		size += 1;
		appendPrefix(physical);

		const threshold = isStructuralDelta(text)
			? structuralRunCap
			: consecutiveThreshold;
		if (consecutiveCount >= threshold) {
			const start = Math.max(0, size - consecutiveCount);

			return fail('consecutive', sliceTokens(start, size));
		}

		return detectCyclic() ?? { ok: true };
	};

	return {
		get hashLookups() {
			return stats.hashLookups;
		},
		get exactCompareTokenVisits() {
			return stats.exactCompareTokenVisits;
		},
		push,
	};
};
