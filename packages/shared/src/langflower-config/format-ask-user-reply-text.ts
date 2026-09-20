import type { AskUserQuestion } from '../types/langflower-config.js';

export type AskUserReplySelections = ReadonlyMap<string, readonly string[]>;

export type FormatAskUserReplyArgs = {
	readonly questions: readonly AskUserQuestion[];
	readonly selections: AskUserReplySelections;
	readonly freeform: string;
};

export const hasAskUserReplyContent = (
	freeform: string,
	selections: AskUserReplySelections,
): boolean => {
	if (freeform.trim().length > 0) {
		return true;
	}

	for (const ids of selections.values()) {
		if (ids.length > 0) {
			return true;
		}
	}

	return false;
};

export const toggleAskUserOption = (
	question: AskUserQuestion,
	selectedIds: readonly string[],
	optionId: string,
): readonly string[] => {
	if (question.allowMultiple) {
		return selectedIds.includes(optionId)
			? selectedIds.filter((id) => id !== optionId)
			: [...selectedIds, optionId];
	}

	return selectedIds.length === 1 && selectedIds[0] === optionId
		? []
		: [optionId];
};

/**
 * Operator answer as the `ask_user` tool result / WS `reply.text`.
 * Legacy calls (no questions) return trimmed freeform only.
 */
export const formatAskUserReplyText = (
	args: FormatAskUserReplyArgs,
): string => {
	const freeform = args.freeform.trim();
	if (args.questions.length === 0) {
		return freeform;
	}

	const blocks = args.questions.map((question, index) => {
		const lines = [`Q${index + 1}. ${question.prompt}`];
		if (question.options.length === 0) {
			return lines.join('\n');
		}

		const selectedIds = args.selections.get(question.id) ?? [];
		const labels = selectedIds.flatMap((id) => {
			const option = question.options.find((entry) => entry.id === id);
			return option === undefined ? [] : [option.label];
		});
		lines.push(
			`Selected: ${labels.length > 0 ? labels.join('; ') : '(none)'}`,
		);
		return lines.join('\n');
	});

	if (freeform.length > 0) {
		blocks.push(`Freeform:\n${freeform}`);
	}

	return blocks.join('\n');
};
