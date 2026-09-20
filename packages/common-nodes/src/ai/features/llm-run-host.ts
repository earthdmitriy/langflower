/**
 * LLM-only host fields on the run-host bag. Non-AI nodes import
 * {@link RunHostServices} from `run-host/run-host-services.ts` so they
 * never type-depend on the chat-completion stream module.
 *
 * Live nodes read `ec.chat` from declared caps — do not peek this bag
 * from `ai/features/**`.
 */
import type { CreateChatCompletionStream } from './chat-completion-stream.js';
import type { RunHostServices } from '../../run-host/run-host-services.js';

export type LlmRunHostServices = RunHostServices & {
	readonly createChatCompletionStream?: CreateChatCompletionStream;
};
