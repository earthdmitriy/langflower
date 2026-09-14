import {
	defineReactiveNode,
	EMBED_HANDLE_WIRE_TYPE,
	isEmbedHandle,
	TOOL_HANDLE_WIRE_TYPE,
	type ToolHandle,
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

const buildSearchTool = (
	embedInput: unknown,
	sqlitePath: string,
): readonly ToolHandle[] => {
	if (!isEmbedHandle(embedInput)) {
		throw new Error(
			'hello-embed-search-handle requires a wired embed input from common-embed-provider.',
		);
	}
	const embedder = textEmbedderFromHandle(embedInput, 'query');
	return [
		{
			toolId: 'project_search',
			name: 'project_search',
			description:
				'Hybrid search (vector + keyword) over the project markdown index from hello-embed-ingest. Returns Question + Context with full chunk bodies (path, heading, RRF score). Empty only if the index has no chunks or the query is empty.',
			inputSchema: {
				type: 'object',
				properties: {
					query: {
						type: 'string',
						description: 'Search phrase.',
					},
					topK: {
						type: 'integer',
						description: 'Max hits (default 8).',
					},
				},
				required: ['query'],
				additionalProperties: false,
			},
			invoke: async (args) => {
				const query = typeof args.query === 'string' ? args.query : '';
				const result = await runSearch({
					sqlitePath,
					query,
					topK: clampTopK(args.topK, DEFAULT_SEARCH_TOP_K),
					embedder,
				});
				return result.text;
			},
		},
	];
};

/**
 * LLM inventory: project_search over the hello-embed sqlite index.
 */
export default defineReactiveNode({
	type: 'hello-embed-search-handle',
	displayName: 'Hello Embed Search Handle',
	category: 'Hello Embed',
	description:
		'Emits project_search (hybrid retrieve, full chunks) for an agent tools port. Wire embed from common-embed-provider. Uses the same sqlitePath default as ingest/search.',
	uiSchema: [
		{
			field: 'sqlitePath',
			type: 'string',
			label: 'SQLite path',
			default: DEFAULT_SQLITE_PATH,
		},
	] as const,
	bind(ctx, { makeInput, configureOutput, combineInputs }) {
		const embed = makeInput<unknown>('embed', {
			name: 'embed',
			wireType: EMBED_HANDLE_WIRE_TYPE,
			required: true,
			description: 'Wire from common-embed-provider (fan-out OK).',
		});

		const tools$ = combineInputs([embed, ctx], ([embedInput, ec]) => {
			const projectDir = String(ec.projectDir ?? '');
			if (projectDir.length === 0) {
				throw new Error(
					'hello-embed-search-handle requires ctx.projectDir.',
				);
			}
			return buildSearchTool(
				embedInput,
				resolveSqlitePath(
					projectDir,
					asString(ec.params.sqlitePath, DEFAULT_SQLITE_PATH),
				),
			);
		});

		return {
			inputs: [embed],
			outputs: [
				configureOutput('tools', tools$, {
					wireType: TOOL_HANDLE_WIRE_TYPE,
				}),
			],
		};
	},
});
