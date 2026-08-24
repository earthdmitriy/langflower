import {
	defineReactiveNode,
	EMBED_HANDLE_WIRE_TYPE,
	type EmbedHandle,
	type EmbedTextRole,
} from '@langflower/node-sdk';
import { distinctUntilChanged, map, pipe, switchMap } from 'rxjs';
import { getRunHostServices } from '../../ai/features/run-host-services.js';
import { fromEmbedding } from '../from-embedding.js';
import { resolveEmbeddingProviderModel } from '../resolve-embedding-provider-model.js';

const embedPanelUiSchema = [
	{
		field: 'providerId',
		type: 'select',
		label: 'Provider',
		optionsSource: 'langflower.providers',
	},
	{
		field: 'model',
		type: 'select',
		label: 'Model',
		optionsSource: 'langflower.models',
		dependsOn: 'providerId',
	},
] as const;

const abortError = (): Error => {
	const error = new Error('The operation was aborted');
	error.name = 'AbortError';
	return error;
};

const prefixForRole = (text: string, role: EmbedTextRole): string =>
	role === 'query' ? `query: ${text}` : `passage: ${text}`;

const linkAbortSignals = (
	runSignal: AbortSignal,
	callSignal: AbortSignal | undefined,
): AbortSignal => {
	const controller = new AbortController();
	const forward = (signal: AbortSignal): void => {
		if (signal.aborted) {
			controller.abort();
			return;
		}
		signal.addEventListener('abort', () => controller.abort(), {
			once: true,
		});
	};
	forward(runSignal);
	if (callSignal !== undefined) {
		forward(callSignal);
	}
	return controller.signal;
};

const buildEmbedHandle = (options: {
	readonly create: NonNullable<
		ReturnType<typeof getRunHostServices>
	>['createEmbedding'];
	readonly providerId: string;
	readonly model: string;
	readonly dim: number;
	readonly runSignal: AbortSignal;
}): EmbedHandle => {
	const { create, providerId, model, dim, runSignal } = options;
	if (create === undefined) {
		throw new Error(
			'OpenAI-compatible embeddings are only available during server workflow runs',
		);
	}

	return {
		dim,
		embedTexts: async (texts, options) => {
			if (runSignal.aborted === true) {
				throw abortError();
			}
			if (options?.signal?.aborted === true) {
				throw abortError();
			}

			const role = options?.role ?? 'document';
			const prefixed = texts.map((text) => prefixForRole(text, role));
			const result = await create({
				providerId,
				model,
				texts: prefixed,
				signal: linkAbortSignals(runSignal, options?.signal),
			});

			if (result.dim !== dim) {
				throw new Error(
					`Embedding dim mismatch: expected ${dim}, got ${result.dim}`,
				);
			}

			return result.vectors;
		},
	};
};

/**
 * UC2: emits a live {@link EmbedHandle} on **embed** after a one-text probe
 * fixes `dim`. Empty panel provider/model → Settings default.
 */
export const embedProviderNode = defineReactiveNode({
	type: 'common-embed-provider',
	displayName: 'Embed provider',
	category: 'Embeddings',
	description: `
Share an embedding model with custom nodes. Wire **embed** into a pack that needs batch vectors.

Uses the Settings default model, or pick one on this node.
`.trim(),
	uiSchema: embedPanelUiSchema,
	bind(ctx, { configureOutput, combineInputs }) {
		const embed$ = combineInputs([ctx], ([ec]) => ec).pipeValue(
			pipe(
				map((ec) => {
					const host = getRunHostServices(ec);
					const resolved = resolveEmbeddingProviderModel(
						ec.params,
						host,
					);
					return {
						ec,
						host,
						key: `${resolved.providerId}/${resolved.model}`,
						...resolved,
					};
				}),
				distinctUntilChanged((left, right) => left.key === right.key),
				switchMap(({ host, providerId, model }) =>
					fromEmbedding(async (runSignal): Promise<EmbedHandle> => {
						const create = host?.createEmbedding;
						if (create === undefined) {
							throw new Error(
								'OpenAI-compatible embeddings are only available during server workflow runs',
							);
						}

						const probe = await create({
							providerId,
							model,
							texts: [prefixForRole('x', 'document')],
							signal: runSignal,
						});

						return buildEmbedHandle({
							create,
							providerId,
							model,
							dim: probe.dim,
							runSignal,
						});
					}),
				),
			),
		);

		return {
			inputs: [],
			outputs: [
				configureOutput('embed', embed$, {
					wireType: EMBED_HANDLE_WIRE_TYPE,
				}),
			],
		};
	},
});
