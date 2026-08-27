import { defineReactiveNode, withLoading } from '@langflower/node-sdk';
import { map, switchMap } from 'rxjs';
import { getRunHostServices } from '../../ai/features/run-host-services.js';
import { fromEmbedding } from '../from-embedding.js';
import { resolveEmbeddingProviderModel } from '../resolve-embedding-provider-model.js';

const PREVIEW_FLOATS = 8;

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

type EmbedTextSession = {
	readonly vector: readonly number[];
	readonly dim: number;
	readonly preview: string;
};

const formatEmbedPreview = (dim: number, vector: readonly number[]): string => {
	const shown = vector.slice(0, PREVIEW_FLOATS).map((n) => {
		const rounded = Math.round(n * 100) / 100;
		return String(rounded);
	});
	const suffix = vector.length > PREVIEW_FLOATS ? ', …' : '';
	return `dim=${dim}  [${shown.join(', ')}${suffix}]`;
};

/**
 * UC1: embed a single string via the host embeddings factory (raw texts,
 * no e5 role prefixes). Empty panel provider/model → Settings default.
 */
export const embedTextNode = defineReactiveNode({
	type: 'common-embed-text',
	displayName: 'Embed text',
	category: 'Embeddings',
	description: `
Turn wired text into an embedding vector. Uses the Settings default model, or pick one on the node.

Typical uses:
- String → Embed text → Preview
- Feed **vector** into Embed similarity
`.trim(),
	uiSchema: embedPanelUiSchema,
	bind(ctx, { makeInput, configureOutput, combineInputs }) {
		const text = makeInput<string>('text', {
			name: 'text',
			wireType: 'string',
			inline: 'text',
			required: true,
		});

		const session$ = combineInputs(
			[text, ctx],
			([rawText, ec]) =>
				({
					rawText: String(rawText ?? ''),
					ec,
				}) as const,
		)
			.pipe(withLoading())
			.pipeValue(
				switchMap(({ rawText, ec }) =>
					fromEmbedding(async (signal): Promise<EmbedTextSession> => {
						const host = getRunHostServices(ec);
						const create = host?.createEmbedding;
						if (create === undefined) {
							throw new Error(
								'OpenAI-compatible embeddings are only available during server workflow runs',
							);
						}

						const { providerId, model } =
							resolveEmbeddingProviderModel(ec.params, host);
						const result = await create({
							providerId,
							model,
							texts: [rawText],
							signal,
						});
						const first = result.vectors[0];
						if (first === undefined) {
							throw new Error(
								'Provider returned no embedding vectors',
							);
						}

						const vector = Array.from(first);
						return {
							vector,
							dim: result.dim,
							preview: formatEmbedPreview(result.dim, vector),
						};
					}),
				),
			);

		return {
			inputs: [text],
			outputs: [
				configureOutput(
					'vector',
					session$.pipeValue(map((session) => session.vector)),
					{ wireType: 'json' },
				),
				configureOutput(
					'dim',
					session$.pipeValue(map((session) => session.dim)),
					{ wireType: 'number' },
				),
				configureOutput(
					'preview',
					session$.pipeValue(map((session) => session.preview)),
					{ wireType: 'string' },
				),
			],
		};
	},
});
