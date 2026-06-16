import { describe, expect, it } from 'vitest';
import {
	defaultChatModelEmptyTitle,
	formatDefaultChatModel,
	parseDefaultChatModel,
} from './parse-default-chat-model.js';

describe('parseDefaultChatModel', () => {
	it('splits provider/model on the first slash', () => {
		expect(parseDefaultChatModel('lmstudio/local-model')).toEqual({
			providerId: 'lmstudio',
			model: 'local-model',
		});
		expect(parseDefaultChatModel('openai/org/custom')).toEqual({
			providerId: 'openai',
			model: 'org/custom',
		});
	});

	it('rejects missing slash or empty parts', () => {
		expect(parseDefaultChatModel(undefined)).toBeNull();
		expect(parseDefaultChatModel('')).toBeNull();
		expect(parseDefaultChatModel('noslash')).toBeNull();
		expect(parseDefaultChatModel('/model')).toBeNull();
		expect(parseDefaultChatModel('provider/')).toBeNull();
		expect(parseDefaultChatModel('  /  ')).toBeNull();
	});
});

describe('formatDefaultChatModel', () => {
	it('joins non-empty parts', () => {
		expect(formatDefaultChatModel('lmstudio', 'local-model')).toBe(
			'lmstudio/local-model',
		);
	});

	it('returns undefined when either part is empty', () => {
		expect(formatDefaultChatModel('', 'm')).toBeUndefined();
		expect(formatDefaultChatModel('p', '')).toBeUndefined();
		expect(formatDefaultChatModel('  ', 'm')).toBeUndefined();
	});
});

describe('defaultChatModelEmptyTitle', () => {
	it('formats Default (provider/model)', () => {
		expect(defaultChatModelEmptyTitle('lmstudio/local-model')).toBe(
			'Default (lmstudio/local-model)',
		);
	});

	it('returns null when unset', () => {
		expect(defaultChatModelEmptyTitle(undefined)).toBeNull();
		expect(defaultChatModelEmptyTitle('')).toBeNull();
	});
});
