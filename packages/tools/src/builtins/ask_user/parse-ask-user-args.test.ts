import { describe, expect, it } from 'vitest';
import {
	ASK_USER_MAX_OPTIONS,
	ASK_USER_MAX_QUESTIONS,
	parseAskUserArgs,
} from './parse-ask-user-args.js';

describe('parseAskUserArgs', () => {
	it('parses a legacy question string', () => {
		expect(parseAskUserArgs({ question: '  What is the goal?  ' })).toEqual(
			{
				question: 'What is the goal?',
				questions: [],
			},
		);
	});

	it('parses questions-only with host-assigned ids', () => {
		expect(
			parseAskUserArgs({
				questions: [
					{
						prompt: ' Stack? ',
						options: [' React ', 'Vue'],
						allowMultiple: true,
					},
					{ prompt: 'Ship it?' },
				],
			}),
		).toEqual({
			question: '',
			questions: [
				{
					id: 'q1',
					prompt: 'Stack?',
					allowMultiple: true,
					options: [
						{ id: 'o1', label: 'React' },
						{ id: 'o2', label: 'Vue' },
					],
				},
				{
					id: 'q2',
					prompt: 'Ship it?',
					allowMultiple: false,
					options: [],
				},
			],
		});
	});

	it('keeps a headline when both fields are set', () => {
		const parsed = parseAskUserArgs({
			question: 'Need a few choices',
			questions: [{ prompt: 'Color?', options: ['red'] }],
		});
		expect(parsed.question).toBe('Need a few choices');
		expect(parsed.questions).toHaveLength(1);
	});

	it('rejects an empty batch', () => {
		expect(() => parseAskUserArgs({})).toThrow(/question/i);
		expect(() => parseAskUserArgs({ question: '   ' })).toThrow(
			/question/i,
		);
		expect(() => parseAskUserArgs({ questions: [] })).toThrow(/questions/i);
	});

	it('rejects over-cap questions and options', () => {
		expect(() =>
			parseAskUserArgs({
				questions: Array.from(
					{ length: ASK_USER_MAX_QUESTIONS + 1 },
					(_, index) => ({ prompt: `Q${index}` }),
				),
			}),
		).toThrow(/at most 8 questions/i);
		expect(() =>
			parseAskUserArgs({
				questions: [
					{
						prompt: 'Pick',
						options: Array.from(
							{ length: ASK_USER_MAX_OPTIONS + 1 },
							(_, index) => `opt${index}`,
						),
					},
				],
			}),
		).toThrow(/at most 12 options/i);
	});

	it('rejects blank prompts and option labels', () => {
		expect(() =>
			parseAskUserArgs({ questions: [{ prompt: '  ' }] }),
		).toThrow(/prompt/i);
		expect(() =>
			parseAskUserArgs({
				questions: [{ prompt: 'Pick', options: ['ok', '  '] }],
			}),
		).toThrow(/option/i);
	});
});
