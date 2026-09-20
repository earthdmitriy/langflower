import { asBoolean, asString } from '../args.js';
import type { AskUserQuestion, AskUserRequest } from '../types.js';

export const ASK_USER_MAX_QUESTIONS = 8;
export const ASK_USER_MAX_OPTIONS = 12;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
	value !== null && typeof value === 'object' && !Array.isArray(value);

const parseOptions = (raw: unknown): AskUserQuestion['options'] => {
	if (raw === undefined) {
		return [];
	}

	if (!Array.isArray(raw)) {
		throw new Error('ask_user «options» must be an array of strings.');
	}

	if (raw.length > ASK_USER_MAX_OPTIONS) {
		throw new Error(
			`ask_user accepts at most ${ASK_USER_MAX_OPTIONS} options per question.`,
		);
	}

	const options: AskUserQuestion['options'][number][] = [];
	for (const [optionIndex, entry] of raw.entries()) {
		if (typeof entry !== 'string' || entry.trim().length === 0) {
			throw new Error(
				'ask_user option labels must be non-empty strings.',
			);
		}

		options.push({
			id: `o${optionIndex + 1}`,
			label: entry.trim(),
		});
	}

	return options;
};

const parseQuestions = (raw: unknown): readonly AskUserQuestion[] => {
	if (raw === undefined) {
		return [];
	}

	if (!Array.isArray(raw)) {
		throw new Error('ask_user «questions» must be an array.');
	}

	if (raw.length > ASK_USER_MAX_QUESTIONS) {
		throw new Error(
			`ask_user accepts at most ${ASK_USER_MAX_QUESTIONS} questions.`,
		);
	}

	const questions: AskUserQuestion[] = [];
	for (const [index, entry] of raw.entries()) {
		if (!isRecord(entry)) {
			throw new Error(
				'ask_user each question must be an object with «prompt».',
			);
		}

		const prompt = asString(entry, 'prompt')?.trim();
		if (prompt === undefined || prompt.length === 0) {
			throw new Error(
				'ask_user each question needs a non-empty «prompt».',
			);
		}

		questions.push({
			id: `q${index + 1}`,
			prompt,
			options: parseOptions(entry['options']),
			allowMultiple: asBoolean(entry, 'allowMultiple', false),
		});
	}

	return questions;
};

/** Normalize agent args into a host `AskUserRequest`. Throws on empty batch / caps. */
export const parseAskUserArgs = (
	args: Readonly<Record<string, unknown>>,
): AskUserRequest => {
	const question = asString(args, 'question')?.trim() ?? '';
	const questions = parseQuestions(args['questions']);

	if (question.length === 0 && questions.length === 0) {
		throw new Error(
			'ask_user requires «question» or a non-empty «questions» list.',
		);
	}

	return { question, questions };
};
