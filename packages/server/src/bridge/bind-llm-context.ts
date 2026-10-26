import {
	createChatCompletionStream,
	type CreateChatCompletionStream,
	type OpenAiProviderCredentials,
	type ReadSessionUpload,
} from '@langflower/common-nodes/ai/openai/create-chat-completion-stream';
import type { StageSessionUpload } from '@langflower/tools/create-project-harness';
import { listProviderModels as listOpenAiProviderModels } from '@langflower/common-nodes/ai/openai/list-provider-models';
import type { ProviderModelEntry } from '@langflower/shared/types/langflower-config.js';
import type { LangflowerConfigService } from '../config/langflower-config.service.js';
import { resolveProviderCredentials } from '../config/resolve-provider-credentials.js';
import type { LangflowerSession } from '../session/langflower-session.js';
import type { WorkflowSessionStore } from '../workflow-sessions/workflow-session-store.js';

const boundWorkflowSession = (
	session: LangflowerSession,
): { readonly workflowId: string; readonly sessionId: string } | undefined => {
	if (session.binding.kind !== 'workflowSession') {
		return undefined;
	}

	const workflowId =
		session.activeWorkflow?.workflowId ?? session.activeWorkflowId;

	if (workflowId === undefined || workflowId.length === 0) {
		return undefined;
	}

	return { workflowId, sessionId: session.binding.sessionId };
};

/**
 * Read one staged upload on the session bound at call time.
 * `fileId` stays an opaque id; the store resolves it.
 */
export const readBoundSessionUpload =
	(
		session: LangflowerSession,
		store: WorkflowSessionStore,
	): ReadSessionUpload =>
	async (fileId) => {
		const bound = boundWorkflowSession(session);

		if (bound === undefined) {
			return { ok: false, message: 'No workflow session is bound' };
		}

		const loaded = await store.readUpload(
			bound.workflowId,
			bound.sessionId,
			fileId,
		);

		if (!loaded.ok) {
			return { ok: false, message: loaded.message };
		}

		return { ok: true, bytes: loaded.value.bytes };
	};

/**
 * Stage one `read` media file on the session bound at call time.
 * Nothing is written when no workflow session is bound.
 */
export const stageBoundSessionUpload =
	(
		session: LangflowerSession,
		store: WorkflowSessionStore,
	): StageSessionUpload =>
	async (input) => {
		const bound = boundWorkflowSession(session);

		if (bound === undefined) {
			throw new Error('No workflow session is bound');
		}

		const written = await store.writeUpload(
			bound.workflowId,
			bound.sessionId,
			{
				name: input.name,
				mimeType: input.mimeType,
				bytes: Buffer.isBuffer(input.bytes)
					? input.bytes
					: Buffer.from(input.bytes),
			},
		);

		if (!written.ok) {
			throw new Error(written.message);
		}

		return written.value;
	};

/**
 * Thin credential bind: secrets stay server-side; OpenAI adapters live in
 * common-nodes.
 */
export const bindCreateChatCompletionStream = (
	langflowerConfigService: LangflowerConfigService,
	readSessionUpload?: ReadSessionUpload,
): CreateChatCompletionStream =>
	createChatCompletionStream({
		resolveProvider: async (providerId) => {
			const config = await langflowerConfigService.read();
			const resolved = resolveProviderCredentials(config, providerId);

			if (!resolved.ok) {
				throw new Error(resolved.message);
			}

			return resolved.credentials;
		},
		...(readSessionUpload !== undefined ? { readSessionUpload } : {}),
	});

export type ListProviderModelsResult = {
	readonly models: readonly ProviderModelEntry[];
	readonly error?: string;
};

export const listProviderModels = async (
	langflowerConfigService: LangflowerConfigService,
	providerId: string,
): Promise<ListProviderModelsResult> => {
	const config = await langflowerConfigService.read();
	const resolved = resolveProviderCredentials(config, providerId);

	if (!resolved.ok) {
		return { models: [], error: resolved.message };
	}

	const credentials: OpenAiProviderCredentials = resolved.credentials;
	const result = await listOpenAiProviderModels(credentials);

	return {
		models: result.models,
		...(result.error !== undefined ? { error: result.error } : {}),
	};
};
