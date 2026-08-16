import {
	defineReactiveNode,
	TOOL_HANDLE_WIRE_TYPE,
	type ToolHandler,
} from '@langflower/node-sdk';
import { getRunHostServices } from '../ai/features/run-host-services.js';
import { emitRegistrationTools } from './emit-registration-tools.js';

const MISSING_RPC_TEXT =
	'{ ok: false }\ncompile_custom_nodes unavailable (no bus RPC)';

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/** Format `customPalette.snapshot` (RPC wait skips `compiling`). */
const formatPaletteSnapshot = (value: unknown): string => {
	if (!isRecord(value)) {
		return `{ ok: false }\nUnexpected compile result`;
	}

	const status = typeof value.status === 'string' ? value.status : 'error';
	const lines = [`status: ${status}`];
	const nodes = Array.isArray(value.nodes) ? value.nodes : [];
	const nodeTypes = nodes.flatMap((node) =>
		isRecord(node) && typeof node.type === 'string' ? [node.type] : [],
	);
	if (nodeTypes.length > 0) {
		lines.push(`nodeTypes: ${nodeTypes.join(', ')}`);
	}

	const errors = Array.isArray(value.errors) ? value.errors : [];
	if (errors.length > 0) {
		lines.push('errors:');
		for (const error of errors) {
			if (!isRecord(error)) {
				continue;
			}

			const pack =
				typeof error.packageName === 'string'
					? error.packageName
					: 'unknown';
			const message =
				typeof error.message === 'string' ? error.message : '';
			lines.push(`- ${pack}: ${message}`);
		}
	}

	return lines.join('\n');
};

const LANGFLOWER_BUS_TOOL_CONFIGS = [
	{
		toolId: 'compile_custom_nodes',
		description:
			'Recompile `.langflower/nodes/` packs, hot-swap live custom instances, and refresh the Custom palette (same intent as Custom → Update). No arguments. Pack failures also write COMPILATION_ERRORS.md.',
		inputSchema: {
			type: 'object',
			properties: {},
			additionalProperties: false,
		},
		handler: (async (_args, ctx) => {
			const request = getRunHostServices(ctx)?.requestLangflowerBus;

			if (request === undefined) {
				return MISSING_RPC_TEXT;
			}

			try {
				const snapshot = await request(
					'customPalette.update.requested',
					{},
				);
				return formatPaletteSnapshot(snapshot);
			} catch (error: unknown) {
				const message =
					error instanceof Error ? error.message : String(error);
				return `{ ok: false }\n${message}`;
			}
		}) satisfies ToolHandler,
	},
];

/**
 * Emits Langflower bus tools for agent inventory. Recompile is unsafe:
 * wire this node’s `tools` into the agent (starter Helper / Writer).
 */
export const langflowerToolsNode = defineReactiveNode({
	type: 'common-langflower-tools',
	displayName: 'Langflower Tools',
	category: 'Tools',
	description:
		'Emits compile_custom_nodes (Custom → Update over the bus). Wire tools to opt in; later bus actions may be added to this pack.',
	uiSchema: [] as const,
	bind(ctx, { configureOutput }) {
		return {
			inputs: [],
			outputs: [
				configureOutput(
					'tools',
					emitRegistrationTools(ctx, LANGFLOWER_BUS_TOOL_CONFIGS),
					{ wireType: TOOL_HANDLE_WIRE_TYPE },
				),
			],
		};
	},
});
