import { describe, expect, it } from 'vitest';
import type { AskUserQuestion } from '../types/langflower-config.js';
import {
	formatAskUserReplyText,
	hasAskUserReplyContent,
	toggleAskUserOption,
} from './format-ask-user-reply-text.js';

const stack: AskUserQuestion = {
	id: 'q1',
	prompt: 'Stack?',
	allowMultiple: true,
	options: [
		{ id: 'o1', label: 'React' },
		{ id: 'o2', label: 'Vue' },
	],
};

const ship: AskUserQuestion = {
	id: 'q2',
	prompt: 'Ship it?',
	allowMultiple: false,
	options: [
		{ id: 'o1', label: 'yes' },
		{ id: 'o2', label: 'no' },
	],
};

const note: AskUserQuestion = {
	id: 'q3',
	prompt: 'Anything else?',
	allowMultiple: false,
	options: [],
};

describe('formatAskUserReplyText', () => {
	it('returns trimmed freeform when there are no questions', () => {
		expect(
			formatAskUserReplyText({
				questions: [],
				selections: new Map(),
				freeform: '  hello  ',
			}),
		).toBe('hello');
	});

	it('formats selected chips, none, omitted Selected, and freeform', () => {
		expect(
			formatAskUserReplyText({
				questions: [stack, ship, note],
				selections: new Map([
					['q1', ['o1', 'o2']],
					['q2', []],
				]),
				freeform: 'prefer React 19',
			}),
		).toBe(
			[
				'Q1. Stack?',
				'Selected: React; Vue',
				'Q2. Ship it?',
				'Selected: (none)',
				'Q3. Anything else?',
				'Freeform:',
				'prefer React 19',
			].join('\n'),
		);
	});

	it('omits the Freeform block when the textarea is empty', () => {
		expect(
			formatAskUserReplyText({
				questions: [ship],
				selections: new Map([['q2', ['o1']]]),
				freeform: '   ',
			}),
		).toBe(['Q1. Ship it?', 'Selected: yes'].join('\n'));
	});
});

describe('hasAskUserReplyContent', () => {
	it('is true when a chip is selected or freeform is non-empty', () => {
		expect(hasAskUserReplyContent('', new Map())).toBe(false);
		expect(hasAskUserReplyContent('  hi  ', new Map())).toBe(true);
		expect(hasAskUserReplyContent('', new Map([['q1', ['o1']]]))).toBe(
			true,
		);
	});
});

describe('toggleAskUserOption', () => {
	it('toggles independently when allowMultiple is true', () => {
		expect(toggleAskUserOption(stack, [], 'o1')).toEqual(['o1']);
		expect(toggleAskUserOption(stack, ['o1'], 'o2')).toEqual(['o1', 'o2']);
		expect(toggleAskUserOption(stack, ['o1', 'o2'], 'o1')).toEqual(['o2']);
	});

	it('replaces or clears when allowMultiple is false', () => {
		expect(toggleAskUserOption(ship, [], 'o1')).toEqual(['o1']);
		expect(toggleAskUserOption(ship, ['o1'], 'o2')).toEqual(['o2']);
		expect(toggleAskUserOption(ship, ['o1'], 'o1')).toEqual([]);
	});
});
