import type { ReactiveNodeDefinition } from '@langflower/node-sdk';

export type CompileDiagnostic = {
	readonly file?: string;
	readonly line?: number;
	readonly column?: number;
	readonly message: string;
};

export type CompilePackError = {
	readonly packageName: string;
	readonly message: string;
	readonly diagnostics: readonly CompileDiagnostic[];
};

/** Always returns successful nodes plus any per-pack / per-entry failures. */
export type CompileProjectNodesResult = {
	readonly nodes: readonly ReactiveNodeDefinition[];
	readonly errors: readonly CompilePackError[];
};

export type CompileProjectNodesOptions = {
	readonly force?: boolean;
};

export type LoadProjectNodesOptions = {
	readonly force?: boolean;
	readonly onCompile?: () => void;
};

export type LoadProjectNodesResult = CompileProjectNodesResult & {
	readonly compiled: boolean;
};

export type DiscoveredPack = {
	readonly packageName: string;
	readonly packDir: string;
	readonly entries: readonly string[];
};
