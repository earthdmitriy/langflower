import {
	isChatCompletionUserTurn,
	type ChatCompletionUserTurn,
} from '../ai/features/chat-completion-stream.js';

/**
 * A string is still a question with no files. An already-formed user
 * turn passes through. Anything else is an empty question with no files.
 */
export const coerceChatUserTurn = (value: unknown): ChatCompletionUserTurn => {
	if (typeof value === 'string') {
		return { text: value, files: [] };
	}

	if (isChatCompletionUserTurn(value)) {
		return value;
	}

	return { text: '', files: [] };
};

/**
 * What a reply node puts on its wire. A reply with no files stays the plain
 * string it always was, so a graph wired before attachments existed (a string
 * consumer behind `message` or `feedback`) behaves as before. Attached
 * files make it a `user-turn`.
 */
export const replyValue = (value: unknown): string | ChatCompletionUserTurn => {
	const turn = coerceChatUserTurn(value);
	return turn.files.length > 0 ? turn : turn.text;
};
