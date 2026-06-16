import type { CreateChatCompletionStream } from './chat-completion-stream.js';

type ScriptedToolCall = {
	readonly name: string;
	readonly arguments?: unknown;
};

export type ScriptedTurn =
	| { readonly toolCalls: readonly ScriptedToolCall[] }
	| { readonly text: string };

export const parseScriptedTurns = (
	value: unknown,
): readonly ScriptedTurn[] | undefined => {
	if (!Array.isArray(value) || value.length === 0) {
		return undefined;
	}

	const turns: ScriptedTurn[] = [];

	for (const item of value) {
		if (item === null || typeof item !== 'object') {
			continue;
		}

		const record = item as Record<string, unknown>;

		if (Array.isArray(record.toolCalls)) {
			const toolCalls = record.toolCalls
				.filter(
					(call): call is ScriptedToolCall =>
						call !== null &&
						typeof call === 'object' &&
						typeof (call as ScriptedToolCall).name === 'string',
				)
				.map((call) => ({
					name: call.name,
					...(call.arguments !== undefined
						? { arguments: call.arguments }
						: {}),
				}));
			turns.push({ toolCalls });
			continue;
		}

		if (typeof record.text === 'string') {
			turns.push({ text: record.text });
		}
	}

	return turns.length > 0 ? turns : undefined;
};

/**
 * Deterministic `CreateChatCompletionStream` for CI / demos. Cursor advances
 * across calls so multi-turn scripts keep working in one session.
 */
export const createScriptedFactory = (
	turns: readonly ScriptedTurn[],
): CreateChatCompletionStream => {
	let index = 0;

	return async () => {
		const turn = turns[index] ?? { text: '' };
		index += 1;

		return (async function* () {
			if ('toolCalls' in turn) {
				yield {
					kind: 'done' as const,
					text: '',
					tool_calls: turn.toolCalls.map((call, callIndex) => ({
						id: `script_${index}_${callIndex}`,
						name: call.name,
						arguments:
							typeof call.arguments === 'string'
								? call.arguments
								: JSON.stringify(call.arguments ?? {}),
					})),
				};
				return;
			}

			if (turn.text.length > 0) {
				yield { kind: 'draft' as const, text: turn.text };
			}

			yield { kind: 'done' as const, text: turn.text };
		})();
	};
};
