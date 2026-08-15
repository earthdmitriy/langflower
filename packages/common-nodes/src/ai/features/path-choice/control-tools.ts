import type {
	ChatCompletionToolCall,
	ChatCompletionToolDefinition,
} from '../chat-completion-stream.js';

/**
 * Path-choice control tools (accept / feedback). Must not be merged into shared
 * inventory or harness allowlists. Import only from `ai/nodes/review/` and
 * `ai/nodes/critique/`.
 */

export const REVIEW_ACCEPT_TOOL = 'accept';
export const REVIEW_FEEDBACK_TOOL = 'feedback';

export const REVIEW_TOOL_REMINDER =
	'You must finish by calling exactly one control tool: accept or feedback. Free-form text answers are not valid. Call accept to approve the artifact, or feedback with notes to send it back for revision.';

/** Chat tool definitions injected only into path-choice completion calls. */
export const REVIEW_CHAT_TOOLS: readonly ChatCompletionToolDefinition[] = [
	{
		type: 'function',
		function: {
			name: REVIEW_ACCEPT_TOOL,
			description:
				'REQUIRED path when the artifact meets the task criteria. Call this tool to accept — never write a free-form approval. Optional notes may summarize why it passes. Exactly one of accept or feedback must be called to finish.',
			parameters: {
				type: 'object',
				properties: {
					notes: {
						type: 'string',
						description: 'Optional short acceptance notes',
					},
				},
			},
		},
	},
	{
		type: 'function',
		function: {
			name: REVIEW_FEEDBACK_TOOL,
			description:
				'REQUIRED path when the artifact fails the task criteria. Call this tool with concrete revision notes — never write a free-form reject essay. Exactly one of accept or feedback must be called to finish.',
			parameters: {
				type: 'object',
				properties: {
					notes: {
						type: 'string',
						description:
							'Required revision notes for the upstream agent',
					},
				},
				required: ['notes'],
			},
		},
	},
];

export const notesFromControlToolArgs = (
	args: Readonly<Record<string, unknown>>,
): string => {
	const notes = args.notes;

	if (typeof notes === 'string') {
		return notes;
	}

	const feedback = args.feedback;

	if (typeof feedback === 'string') {
		return feedback;
	}

	if (typeof args.__raw === 'string') {
		return args.__raw;
	}

	return '';
};

export const findControlToolCall = (
	toolCalls: readonly ChatCompletionToolCall[],
):
	| { readonly kind: 'accept'; readonly call: ChatCompletionToolCall }
	| { readonly kind: 'feedback'; readonly call: ChatCompletionToolCall }
	| undefined => {
	for (const call of toolCalls) {
		if (call.name === REVIEW_ACCEPT_TOOL) {
			return { kind: 'accept', call };
		}

		if (call.name === REVIEW_FEEDBACK_TOOL) {
			return { kind: 'feedback', call };
		}
	}

	return undefined;
};

export const isReviewControlToolName = (name: string): boolean =>
	name === REVIEW_ACCEPT_TOOL || name === REVIEW_FEEDBACK_TOOL;
