import type { ReactiveNodeDefinition } from '@langflower/node-sdk';
import { getCommonReactiveNodeCatalog } from '@langflower/common-nodes';
import type {
	PaletteConfigPayload,
	PaletteNodeDefinition,
} from '@langflower/shared/langflower.js';

const omitInferTypeFrom = <T extends object>(meta: T): T => {
	if (!('inferTypeFrom' in meta)) {
		return meta;
	}

	const { inferTypeFrom: _omit, ...rest } = meta as T & {
		readonly inferTypeFrom?: unknown;
	};
	return rest as T;
};

export const toPaletteDefinition = (
	node: ReactiveNodeDefinition,
	source: PaletteNodeDefinition['source'],
): PaletteNodeDefinition => {
	const { getInstance: _getInstance, ...definition } = node;

	return {
		...definition,
		// Passthrough probe streams only land on output metas.
		outputsConfigs: definition.outputsConfigs.map(omitInferTypeFrom),
		source,
	};
};

export class PaletteService {
	/**
	 * System catalog only. Custom packs are owned by
	 * {@link CustomPaletteService} / `customPalette.snapshot`.
	 */
	async reload(
		_projectDir: string,
	): Promise<{ readonly ok: true; readonly payload: PaletteConfigPayload }> {
		const catalog = getCommonReactiveNodeCatalog();
		const nodes = Object.values(catalog).map((node) =>
			toPaletteDefinition(node, 'system'),
		);

		return { ok: true, payload: { nodes } };
	}
}
