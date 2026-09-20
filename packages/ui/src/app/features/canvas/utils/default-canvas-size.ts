import type { PaletteNodeDefinition } from '@langflower/shared/types/langflower-palette';

/**
 * Canvas box declared by the node definition (`defaultCanvasSize`), used when
 * the node has no persisted width. Unknown types and definitions without the
 * field auto-size.
 */
export const defaultCanvasSizeForType = (
	type: string,
	paletteCatalog: ReadonlyMap<string, PaletteNodeDefinition>,
): { readonly width: number; readonly height: number } | undefined =>
	paletteCatalog.get(type)?.defaultCanvasSize;

/** Drop payload: seeds the declared default box on a fresh palette drop. */
export const withDefaultDropSize = (
	type: string,
	position: { readonly x: number; readonly y: number },
	paletteCatalog: ReadonlyMap<string, PaletteNodeDefinition>,
): {
	readonly x: number;
	readonly y: number;
	readonly width?: number;
	readonly height?: number;
} => {
	const size = defaultCanvasSizeForType(type, paletteCatalog);

	return size === undefined
		? { x: position.x, y: position.y }
		: { x: position.x, y: position.y, ...size };
};
