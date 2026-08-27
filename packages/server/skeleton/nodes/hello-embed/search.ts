import {
	defineNode,
	EMBED_HANDLE_WIRE_TYPE,
	isEmbedHandle,
} from '@langflower/node-sdk';
import {
	clampTopK,
	DEFAULT_SEARCH_TOP_K,
	DEFAULT_SQLITE_PATH,
	resolveSqlitePath,
} from './lib/paths.ts';
import { runSearch } from './lib/search.ts';
import { textEmbedderFromHandle } from './lib/text-embedder.ts';

const asString = (value: unknown, fallback: string): string => {
	if (typeof value === 'string') {
		return value;
	}
	return fallback;
};

/**
 * Hybrid search over the hello-embed sqlite index (cosine + FTS5, RRF).
 */
export default defineNode({
	type: 'hello-embed-search',
	displayName: 'Hello Embed Search',
	category: 'Hello Embed',
	description:
		'Retrieve markdown chunks (vector cosine + FTS5, RRF top-K). text is Question + full-chunk Context for an LLM userPrompt. Wire embed from common-embed-provider.',
	uiSchema: [
		{
			field: 'sqlitePath',
			type: 'string',
			label: 'SQLite path',
			default: DEFAULT_SQLITE_PATH,
		},
		{
			field: 'topK',
			type: 'number',
			label: 'Top K',
			default: DEFAULT_SEARCH_TOP_K,
			min: 1,
			max: 50,
			step: 1,
		},
	] as const,
	inputs: {
		query: {
			wireType: 'string',
			required: true,
			description: 'Search phrase.',
		},
		embed: {
			wireType: EMBED_HANDLE_WIRE_TYPE,
			required: true,
			description: 'Wire from common-embed-provider (fan-out OK).',
		},
	},
	outputs: {
		hits: {
			wireType: 'json',
			description:
				'Top-K hits with path, heading, RRF score, and full chunk text.',
		},
		text: {
			wireType: 'string',
			description:
				'Question + Context (full retrieved chunks) for Preview or LLM userPrompt.',
		},
	},
	async execute(ctx, inputs) {
		const embedInput = inputs['embed'];
		if (!isEmbedHandle(embedInput)) {
			throw new Error(
				'hello-embed-search requires a wired embed input from common-embed-provider.',
			);
		}
		const projectDir = String(ctx.projectDir ?? '');
		if (projectDir.length === 0) {
			throw new Error('hello-embed-search requires ctx.projectDir.');
		}
		const query = typeof inputs.query === 'string' ? inputs.query : '';
		const result = await runSearch({
			sqlitePath: resolveSqlitePath(
				projectDir,
				asString(ctx.params.sqlitePath, DEFAULT_SQLITE_PATH),
			),
			query,
			topK: clampTopK(ctx.params.topK, DEFAULT_SEARCH_TOP_K),
			embedder: textEmbedderFromHandle(embedInput, 'query'),
		});
		return {
			hits: result.hits,
			text: result.text,
		};
	},
});
