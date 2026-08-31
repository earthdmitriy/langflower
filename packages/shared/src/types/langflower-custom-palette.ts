import type {
	PaletteCompilationDiagnostic,
	PaletteNodeDefinition,
} from './langflower-palette.js';

/** Lifecycle of project custom-node compilation. */
export type CustomPaletteCompilationStatus =
	'not_compiled' | 'compiling' | 'ok' | 'partial' | 'error';

/**
 * One pack / entry failure — same diagnostics written to that pack's
 * `COMPILATION_ERRORS.md`.
 */
export type CustomPalettePackError = {
	readonly packageName: string;
	readonly message: string;
	readonly diagnostics: readonly PaletteCompilationDiagnostic[];
};

/**
 * Authoritative Custom-section slice. Successful nodes and failures coexist
 * (`partial` when both are non-empty).
 */
export type CustomPaletteSnapshotPayload = {
	readonly nodes: readonly PaletteNodeDefinition[];
	readonly errors: readonly CustomPalettePackError[];
	readonly status: CustomPaletteCompilationStatus;
};

/**
 * Client intent to recompile project packs. `force` rebuilds even when pack
 * fingerprints match (Custom → Update). Omitted / false is incremental.
 */
export type CustomPaletteUpdateRequestedPayload = {
	readonly force?: boolean;
};
