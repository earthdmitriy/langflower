import type {
	ChatCompletionMessage,
	ChatCompletionToolDefinition,
	CreateChatCompletionStream,
} from '../chat-completion-stream.js';
import { isContextLengthExceededError } from './context-length-error.js';
import type { LlmCompactionConfig } from './normalize-compaction-params.js';

export type CompactMessagesResult =
	| {
			readonly ok: true;
			readonly messages: readonly ChatCompletionMessage[];
			readonly beforeTokens: number;
			readonly afterTokens: number;
	  }
	| { readonly ok: false; readonly message: string };

type MessageBlock = {
	readonly messages: readonly ChatCompletionMessage[];
	readonly isProtected: boolean;
};

const SUMMARY_PREFIX = '## Compacted conversation context\n';
export const SUMMARY_SYSTEM_PROMPT = [
	'Summarize the following conversation history for continuity.',
	'Preserve requirements, decisions, unfinished tasks, tool outcomes,',
	'and exact constraints. Be dense and factual. Do not invent content.',
].join(' ');

const estimateApproxTokens = (value: unknown): number => {
	try {
		return Math.ceil(JSON.stringify(value).length / 4);
	} catch {
		return Math.ceil(String(value).length / 4);
	}
};

export const estimateMessagesTokens = (
	messages: readonly ChatCompletionMessage[],
): number => estimateApproxTokens(messages);

export const estimateToolsTokens = (
	tools: readonly ChatCompletionToolDefinition[],
): number => (tools.length === 0 ? 0 : estimateApproxTokens(tools));

export const estimateRequestTokens = (
	messages: readonly ChatCompletionMessage[],
	tools: readonly ChatCompletionToolDefinition[],
): number => estimateMessagesTokens(messages) + estimateToolsTokens(tools);

const effectiveInputBudget = (contextSize: number): number =>
	Math.floor(contextSize * 0.8);

const summarySlotTokens = (inputBudget: number): number =>
	Math.min(4096, Math.max(256, Math.floor(inputBudget * 0.15)));

const truncateToApproxTokens = (text: string, maxTokens: number): string => {
	const maxChars = Math.max(0, maxTokens * 4);

	if (text.length <= maxChars) {
		return text;
	}

	return text.slice(text.length - maxChars);
};

const splitLeadingSystem = (
	messages: readonly ChatCompletionMessage[],
): {
	readonly system: readonly ChatCompletionMessage[];
	readonly rest: readonly ChatCompletionMessage[];
} => {
	let end = 0;

	while (end < messages.length && messages[end]?.role === 'system') {
		end += 1;
	}

	return {
		system: messages.slice(0, end),
		rest: messages.slice(end),
	};
};

const findLastUserIndex = (
	messages: readonly ChatCompletionMessage[],
): number => {
	for (let i = messages.length - 1; i >= 0; i -= 1) {
		if (messages[i]?.role === 'user') {
			return i;
		}
	}

	return -1;
};

const toBlocks = (
	messages: readonly ChatCompletionMessage[],
):
	| { readonly ok: true; readonly blocks: readonly MessageBlock[] }
	| { readonly ok: false; readonly message: string } => {
	const blocks: MessageBlock[] = [];
	const lastUserIndex = findLastUserIndex(messages);
	let i = 0;

	while (i < messages.length) {
		const message = messages[i];

		if (message === undefined) {
			break;
		}

		if (message.role === 'tool') {
			return {
				ok: false,
				message:
					'Cannot compact history: orphan tool message without a preceding assistant tool_calls block',
			};
		}

		if (
			message.role === 'assistant' &&
			message.tool_calls !== undefined &&
			message.tool_calls.length > 0
		) {
			const callIds = new Set(message.tool_calls.map((call) => call.id));
			const group: ChatCompletionMessage[] = [message];
			let j = i + 1;

			while (j < messages.length) {
				const next = messages[j];

				if (next === undefined || next.role !== 'tool') {
					break;
				}

				if (!callIds.has(next.tool_call_id)) {
					return {
						ok: false,
						message: `Cannot compact history: tool message id ${next.tool_call_id} is not part of the preceding assistant tool_calls`,
					};
				}

				group.push(next);
				callIds.delete(next.tool_call_id);
				j += 1;
			}

			if (callIds.size > 0) {
				return {
					ok: false,
					message:
						'Cannot compact history: incomplete assistant tool_calls / tool result block',
				};
			}

			const isNewest = j === messages.length;
			blocks.push({
				messages: group,
				isProtected: isNewest,
			});
			i = j;
			continue;
		}

		blocks.push({
			messages: [message],
			isProtected: i === lastUserIndex || i === messages.length - 1,
		});
		i += 1;
	}

	if (blocks.length > 0) {
		const last = blocks[blocks.length - 1];

		if (last !== undefined && !last.isProtected) {
			blocks[blocks.length - 1] = { ...last, isProtected: true };
		}
	}

	return { ok: true, blocks };
};

const flattenBlocks = (
	blocks: readonly MessageBlock[],
): readonly ChatCompletionMessage[] =>
	blocks.flatMap((block) => block.messages);

const serializeMessagesForSummary = (
	messages: readonly ChatCompletionMessage[],
): string =>
	messages
		.map((message) => {
			if (message.role === 'tool') {
				return `[tool ${message.tool_call_id}]\n${message.content}`;
			}

			if (
				message.role === 'assistant' &&
				message.tool_calls !== undefined &&
				message.tool_calls.length > 0
			) {
				const calls = message.tool_calls
					.map(
						(call) =>
							`${call.name}(${call.arguments}) id=${call.id}`,
					)
					.join('; ');

				return `[assistant tool_calls]\n${message.content}\n${calls}`;
			}

			return `[${message.role}]\n${message.content}`;
		})
		.join('\n\n');

const collectDoneText = async (
	stream: AsyncIterable<{
		readonly kind: string;
		readonly text?: string;
	}>,
): Promise<string> => {
	let text = '';

	for await (const chunk of stream) {
		if (chunk.kind === 'draft' && typeof chunk.text === 'string') {
			text += chunk.text;
		} else if (chunk.kind === 'done' && typeof chunk.text === 'string') {
			text = chunk.text.length > 0 ? chunk.text : text;
		}
	}

	return text.trim();
};

const summarizeRange = async (args: {
	readonly factory: CreateChatCompletionStream;
	readonly providerId: string;
	readonly model: string;
	readonly signal?: AbortSignal;
	readonly source: readonly ChatCompletionMessage[];
	readonly sourceBudgetTokens: number;
}): Promise<
	| { readonly ok: true; readonly content: string }
	| {
			readonly ok: false;
			readonly message: string;
			readonly aborted?: boolean;
	  }
> => {
	let sourceBudget = args.sourceBudgetTokens;

	for (let attempt = 0; attempt < 3; attempt += 1) {
		if (args.signal !== undefined && args.signal.aborted) {
			return {
				ok: false,
				message: 'Compaction aborted',
				aborted: true,
			};
		}

		const serialized = truncateToApproxTokens(
			serializeMessagesForSummary(args.source),
			sourceBudget,
		);

		try {
			const stream = await args.factory({
				providerId: args.providerId,
				model: args.model,
				messages: [
					{ role: 'system', content: SUMMARY_SYSTEM_PROMPT },
					{ role: 'user', content: serialized },
				],
				...(args.signal !== undefined ? { signal: args.signal } : {}),
			});
			const content = await collectDoneText(stream);

			if (content.length === 0) {
				return {
					ok: false,
					message: 'Compaction summary returned empty text',
				};
			}

			return { ok: true, content };
		} catch (error) {
			if (args.signal !== undefined && args.signal.aborted) {
				return {
					ok: false,
					message: 'Compaction aborted',
					aborted: true,
				};
			}

			if (isContextLengthExceededError(error)) {
				sourceBudget = Math.max(256, Math.floor(sourceBudget / 2));
				continue;
			}

			const message =
				error instanceof Error ? error.message : String(error);

			return {
				ok: false,
				message: `Compaction summary failed: ${message}`,
			};
		}
	}

	return {
		ok: false,
		message:
			'Compaction summary failed after repeated context-length errors',
	};
};

const findRemovableRange = (
	blocks: readonly MessageBlock[],
): { readonly start: number; readonly end: number } | undefined => {
	let start = -1;

	for (let i = 0; i < blocks.length; i += 1) {
		if (!blocks[i]!.isProtected) {
			start = i;
			break;
		}
	}

	if (start < 0) {
		return undefined;
	}

	let end = start;

	while (end + 1 < blocks.length && !blocks[end + 1]!.isProtected) {
		end += 1;
	}

	return { start, end };
};

const buildSummaryMessage = (
	content: string,
	slotTokens: number,
): ChatCompletionMessage => ({
	role: 'user',
	content: `${SUMMARY_PREFIX}${truncateToApproxTokens(content, slotTokens)}`,
});

/**
 * LLM-summary compaction: replace contiguous unprotected message blocks with
 * a summary user message while preserving leading system + last user + newest
 * block and full assistant/tool groups.
 */
export const compactMessagesWithSummary = async (args: {
	readonly factory: CreateChatCompletionStream;
	readonly providerId: string;
	readonly model: string;
	readonly messages: readonly ChatCompletionMessage[];
	readonly tools: readonly ChatCompletionToolDefinition[];
	readonly targetTokens: number;
	readonly signal?: AbortSignal;
}): Promise<CompactMessagesResult> => {
	const beforeTokens = estimateRequestTokens(args.messages, args.tools);

	if (beforeTokens <= args.targetTokens) {
		return {
			ok: true,
			messages: args.messages,
			beforeTokens,
			afterTokens: beforeTokens,
		};
	}

	const { system, rest } = splitLeadingSystem(args.messages);
	const blocked = toBlocks(rest);

	if (!blocked.ok) {
		return blocked;
	}

	let blocks = [...blocked.blocks];
	const toolsTokens = estimateToolsTokens(args.tools);
	const slot = summarySlotTokens(args.targetTokens);
	const requiredTokens =
		estimateMessagesTokens([
			...system,
			...(findLastUserIndex(rest) >= 0
				? [rest[findLastUserIndex(rest)]!]
				: []),
		]) +
		toolsTokens +
		slot;

	if (requiredTokens > args.targetTokens) {
		return {
			ok: false,
			message: `Cannot compact history: required system/user/tools already need ~${requiredTokens} approx tokens (budget ${args.targetTokens})`,
		};
	}

	let workingMessages = args.messages;
	let passes = 0;

	while (
		estimateRequestTokens(workingMessages, args.tools) >
			args.targetTokens &&
		passes < 2
	) {
		if (args.signal !== undefined && args.signal.aborted) {
			return { ok: false, message: 'Compaction aborted' };
		}

		const range = findRemovableRange(blocks);

		if (range === undefined) {
			return {
				ok: false,
				message:
					'Cannot compact history: no removable message blocks left under the protected prefix/suffix',
			};
		}

		const source = flattenBlocks(blocks.slice(range.start, range.end + 1));
		const remainingBudget = Math.max(
			256,
			args.targetTokens -
				toolsTokens -
				estimateMessagesTokens([
					...system,
					...flattenBlocks(blocks.slice(0, range.start)),
					...flattenBlocks(blocks.slice(range.end + 1)),
				]) -
				slot,
		);
		const summary = await summarizeRange({
			factory: args.factory,
			providerId: args.providerId,
			model: args.model,
			...(args.signal !== undefined ? { signal: args.signal } : {}),
			source,
			sourceBudgetTokens: remainingBudget,
		});

		if (!summary.ok) {
			return {
				ok: false,
				message: summary.message,
			};
		}

		const summaryMessage = buildSummaryMessage(summary.content, slot);
		blocks = [
			...blocks.slice(0, range.start),
			{
				messages: [summaryMessage],
				isProtected: true,
			},
			...blocks.slice(range.end + 1),
		];
		workingMessages = [...system, ...flattenBlocks(blocks)];
		passes += 1;
	}

	const afterTokens = estimateRequestTokens(workingMessages, args.tools);

	if (afterTokens > args.targetTokens) {
		return {
			ok: false,
			message: `Cannot compact history below ~${args.targetTokens} approx tokens (still ~${afterTokens})`,
		};
	}

	return {
		ok: true,
		messages: workingMessages,
		beforeTokens,
		afterTokens,
	};
};

export const resolveProactiveTargetTokens = (
	config: LlmCompactionConfig,
): number | undefined => {
	if (config.contextSize <= 0) {
		return undefined;
	}

	return effectiveInputBudget(config.contextSize);
};

export const resolveForceTargetTokens = (
	config: LlmCompactionConfig,
	currentInputEstimate: number,
): number => {
	if (config.contextSize > 0) {
		return Math.min(
			effectiveInputBudget(config.contextSize),
			Math.max(256, Math.floor(currentInputEstimate * 0.5)),
		);
	}

	return Math.max(256, Math.floor(currentInputEstimate * 0.5));
};
