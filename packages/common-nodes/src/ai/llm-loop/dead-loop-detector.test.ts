import { describe, expect, it } from 'vitest';
import {
	createDeadLoopDetector,
	type DeadLoopChannel,
	type DeadLoopDetector,
} from './dead-loop-detector.js';

const UNIQUE_STREAM_W = 1000;
const HASH_LOOKUPS_PER_PUSH_CAP = 8;

const createParagraphTokens = (length: number): readonly string[] =>
	Array.from({ length }, (_, index) => {
		if (index % 12 === 11) {
			return `The analysis restates caveat ${index} again.`;
		}

		return `word${index}`;
	});

const pushUntilDetected = (
	detector: DeadLoopDetector,
	tokens: readonly string[],
): { readonly index: number; readonly detector: DeadLoopDetector } => {
	for (let index = 0; index < tokens.length; index += 1) {
		const result = detector.push(tokens[index] ?? '');
		if (!result.ok) {
			return { index, detector };
		}
	}

	throw new Error('expected dead-loop detection before the token list ended');
};

const pushUniqueStream = (
	tokenCount: number,
	maxWindowTokens: number,
	channel: DeadLoopChannel = 'draft',
): {
	readonly detector: DeadLoopDetector;
	readonly maxLookupsPerPush: number;
} => {
	const detector = createDeadLoopDetector(channel, { maxWindowTokens });
	let previousLookups = 0;
	let maxLookupsPerPush = 0;

	for (let index = 0; index < tokenCount; index += 1) {
		const result = detector.push(`unique-${index}`);
		if (!result.ok) {
			throw new Error(`unique stream detected at ${index}`);
		}
		const lookupsThisPush = detector.hashLookups - previousLookups;
		if (lookupsThisPush > maxLookupsPerPush) {
			maxLookupsPerPush = lookupsThisPush;
		}
		previousLookups = detector.hashLookups;
	}

	return { detector, maxLookupsPerPush };
};

describe('createDeadLoopDetector', () => {
	it('detects consecutive identical deltas on reasoning', () => {
		const detector = createDeadLoopDetector('reasoning');
		expect(detector.push('loop').ok).toBe(true);
		expect(detector.push('loop').ok).toBe(true);
		expect(detector.push('loop').ok).toBe(true);
		expect(detector.push('loop').ok).toBe(true);
		const result = detector.push('loop');

		expect(result.ok).toBe(false);
		if (result.ok) {
			return;
		}

		expect(result.error.channel).toBe('reasoning');
		expect(result.error.reason).toBe('consecutive');
		expect(result.error.partialText).toBe('looplooplooplooploop');
		expect(result.error.lastTokens.length).toBeGreaterThan(0);
	});

	it('detects consecutive identical deltas on draft', () => {
		const detector = createDeadLoopDetector('draft');
		for (let index = 0; index < 4; index += 1) {
			expect(detector.push('x').ok).toBe(true);
		}
		const result = detector.push('x');

		expect(result.ok).toBe(false);
		if (result.ok) {
			return;
		}

		expect(result.error.channel).toBe('draft');
		expect(result.error.reason).toBe('consecutive');
		expect(result.error.lastTokens).toContain('x');
	});

	it('detects a cyclic two-token pattern after three repetitions', () => {
		const detector = createDeadLoopDetector('draft');
		const tokens = ['alpha', 'beta', 'alpha', 'beta', 'alpha', 'beta'];
		let detected: ReturnType<DeadLoopDetector['push']> | undefined;

		for (const token of tokens) {
			detected = detector.push(token);
			if (!detected.ok) {
				break;
			}
		}

		expect(detected?.ok).toBe(false);
		if (detected === undefined || detected.ok) {
			return;
		}

		expect(detector.exactCompareTokenVisits).toBeGreaterThan(0);
		expect(detected.error.reason).toBe('cyclic');
		expect(detected.error.channel).toBe('draft');
		expect(detected.error.partialText.length).toBeGreaterThan(0);
		expect(detected.error.lastTokens).toEqual(['alpha', 'beta']);
	});

	it('ignores empty pushes and does not detect a unique stream', () => {
		const detector = createDeadLoopDetector('reasoning');
		expect(detector.push('').ok).toBe(true);
		expect(detector.push('').ok).toBe(true);
		expect(detector.push('one').ok).toBe(true);
		expect(detector.push('two').ok).toBe(true);
		expect(detector.push('three').ok).toBe(true);
		expect(detector.hashLookups).toBeGreaterThanOrEqual(0);
	});

	it('does not treat a hash-only match as a loop without exact confirm', () => {
		const detector = createDeadLoopDetector('draft');
		const tokens = ['alpha', 'beta', 'alpha', 'beta', 'alpha', 'beta'];
		pushUntilDetected(detector, tokens);
		expect(detector.exactCompareTokenVisits).toBeGreaterThan(0);
	});
});

describe('createDeadLoopDetector complexity', () => {
	it('keeps hash lookups per push linear in W on a unique stream', () => {
		const tokenCount = 8_000;
		const { detector, maxLookupsPerPush } = pushUniqueStream(
			tokenCount,
			UNIQUE_STREAM_W,
		);

		expect(maxLookupsPerPush).toBeLessThanOrEqual(
			HASH_LOOKUPS_PER_PUSH_CAP * UNIQUE_STREAM_W,
		);
		expect(detector.exactCompareTokenVisits).toBeLessThanOrEqual(
			tokenCount,
		);
		expect(detector.hashLookups).toBeLessThan(tokenCount * tokenCount);
		expect(detector.hashLookups).toBeLessThanOrEqual(
			tokenCount * HASH_LOOKUPS_PER_PUSH_CAP * UNIQUE_STREAM_W,
		);
	}, 20_000);

	it('grows total hash lookups linearly in stream length, not T²', () => {
		const short = pushUniqueStream(2_000, UNIQUE_STREAM_W);
		const long = pushUniqueStream(8_000, UNIQUE_STREAM_W);
		const ratio = long.detector.hashLookups / short.detector.hashLookups;

		expect(ratio).toBeLessThanOrEqual(6);
		expect(ratio).toBeLessThan(12);
	}, 20_000);

	it('grows total hash lookups linearly in W, not W²', () => {
		const narrow = pushUniqueStream(4_000, 250);
		const wide = pushUniqueStream(4_000, 1_000);
		const ratio =
			wide.detector.hashLookups /
			Math.max(1, narrow.detector.hashLookups);

		expect(ratio).toBeLessThanOrEqual(8);
	}, 20_000);

	it('detects a ~300-token paragraph repeated 3× on reasoning and draft', () => {
		const paragraph = createParagraphTokens(300);
		const repeated = [...paragraph, ...paragraph, ...paragraph];

		for (const channel of ['reasoning', 'draft'] as const) {
			const detector = createDeadLoopDetector(channel);
			const { index } = pushUntilDetected(detector, repeated);
			expect(index).toBeLessThan(repeated.length);
			expect(index).toBeLessThanOrEqual(paragraph.length * 3 - 1);

			const replay = createDeadLoopDetector(channel);
			let detected: ReturnType<DeadLoopDetector['push']> | undefined;
			for (const token of repeated) {
				detected = replay.push(token);
				if (!detected.ok) {
					break;
				}
			}

			expect(detected?.ok).toBe(false);
			if (detected !== undefined && !detected.ok) {
				expect(detected.error.channel).toBe(channel);
				expect(detected.error.reason).toBe('cyclic');
				expect(detected.error.lastTokens.length).toBeGreaterThanOrEqual(
					2,
				);
			}
		}
	});

	it('does not exact-compare every L on a collision-heavy similar-block stream', () => {
		const tokenCount = 4_000;
		const maxWindowTokens = UNIQUE_STREAM_W;
		const detector = createDeadLoopDetector('draft', {
			maxWindowTokens,
		});
		let previousLookups = 0;
		let maxLookupsPerPush = 0;
		let previousExact = 0;
		let maxExactPerPush = 0;

		for (let index = 0; index < tokenCount; index += 1) {
			const block = index % 17;
			const result = detector.push(`block-${block}-${index}`);
			if (!result.ok) {
				throw new Error(`similar-block stream detected at ${index}`);
			}
			const lookupsThisPush = detector.hashLookups - previousLookups;
			const exactThisPush =
				detector.exactCompareTokenVisits - previousExact;
			if (lookupsThisPush > maxLookupsPerPush) {
				maxLookupsPerPush = lookupsThisPush;
			}
			if (exactThisPush > maxExactPerPush) {
				maxExactPerPush = exactThisPush;
			}
			previousLookups = detector.hashLookups;
			previousExact = detector.exactCompareTokenVisits;
		}

		expect(maxLookupsPerPush).toBeLessThanOrEqual(
			HASH_LOOKUPS_PER_PUSH_CAP * maxWindowTokens,
		);
		const quadraticExactPerPush =
			(maxWindowTokens * (maxWindowTokens + 1)) / 2;
		expect(maxExactPerPush).toBeLessThan(quadraticExactPerPush);
		expect(detector.exactCompareTokenVisits).toBeLessThan(
			tokenCount * maxWindowTokens,
		);
	}, 20_000);
});
