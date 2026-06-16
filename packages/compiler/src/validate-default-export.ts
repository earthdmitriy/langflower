import type { ReactiveNodeDefinition } from '@langflower/node-sdk';
import type { CompileDiagnostic } from './compile-types.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

const isReactiveNodeDefinition = (
	value: unknown,
): value is ReactiveNodeDefinition => {
	if (!isRecord(value)) {
		return false;
	}

	return (
		typeof value.type === 'string' &&
		value.type.length > 0 &&
		typeof value.displayName === 'string' &&
		typeof value.getInstance === 'function' &&
		Array.isArray(value.inputsConfigs) &&
		Array.isArray(value.outputsConfigs)
	);
};

export const parseDefaultExport = (
	value: unknown,
	filePath: string,
):
	| { readonly ok: true; readonly nodes: readonly ReactiveNodeDefinition[] }
	| { readonly ok: false; readonly diagnostic: CompileDiagnostic } => {
	if (Array.isArray(value)) {
		const nodes: ReactiveNodeDefinition[] = [];

		for (const [index, item] of value.entries()) {
			if (!isReactiveNodeDefinition(item)) {
				return {
					ok: false,
					diagnostic: {
						file: filePath,
						message: `export default[${index}] is not a node definition (need type, displayName, getInstance)`,
					},
				};
			}

			nodes.push(item);
		}

		return { ok: true, nodes };
	}

	if (!isReactiveNodeDefinition(value)) {
		return {
			ok: false,
			diagnostic: {
				file: filePath,
				message:
					'export default is not a node definition or array of definitions (need type, displayName, getInstance)',
			},
		};
	}

	return { ok: true, nodes: [value] };
};
