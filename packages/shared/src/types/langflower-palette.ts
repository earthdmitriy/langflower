import type { ReactiveNodeDefinition } from '@langflower/node-sdk';

/** Palette catalog origin — set by server when building palette snapshots. */
export type PaletteNodeSource = 'system' | 'custom';

/**
 * Registry palette entry — {@link ReactiveNodeDefinition} without the runtime
 * node factory, plus wire-only {@link PaletteNodeSource}.
 *
 * Port metadata lives in `inputsConfigs` / `outputsConfigs` (`config` fields).
 * Optional `description` is markdown for the palette detail popover footer.
 */
export type PaletteNodeDefinition = Omit<
	ReactiveNodeDefinition,
	'getInstance'
> & {
	readonly source: PaletteNodeSource;
};

/** Registered node types for the canvas palette (system catalog). */
export type PaletteConfigPayload = {
	readonly nodes: readonly PaletteNodeDefinition[];
};

/** Single diagnostic from custom-node compile (esbuild / validate). */
export type PaletteCompilationDiagnostic = {
	readonly file?: string;
	readonly line?: number;
	readonly column?: number;
	readonly message: string;
};
