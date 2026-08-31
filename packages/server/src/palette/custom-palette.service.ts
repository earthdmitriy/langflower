import { loadProjectNodes } from '@langflower/compiler/load-project-nodes';
import type { ReactiveNodeDefinition } from '@langflower/node-sdk';
import type {
	CustomPaletteCompilationStatus,
	CustomPalettePackError,
	CustomPaletteSnapshotPayload,
	PaletteNodeDefinition,
} from '@langflower/shared/langflower.js';
import { toPaletteDefinition } from './palette.service.js';
import type { CustomNodeRegistry } from './custom-node-registry.js';

const toPackErrors = (
	errors: readonly {
		readonly packageName: string;
		readonly message: string;
		readonly diagnostics: readonly {
			readonly file?: string;
			readonly line?: number;
			readonly column?: number;
			readonly message: string;
		}[];
	}[],
): readonly CustomPalettePackError[] =>
	errors.map((error) => ({
		packageName: error.packageName,
		message: error.message,
		diagnostics: error.diagnostics,
	}));

const statusFromResult = (
	nodeCount: number,
	errorCount: number,
): CustomPaletteCompilationStatus => {
	if (errorCount === 0) {
		return 'ok';
	}

	if (nodeCount === 0) {
		return 'error';
	}

	return 'partial';
};

export type CustomPaletteUpdateOptions = {
	readonly force?: boolean;
	readonly onCompile?: () => void;
};

export type CustomPaletteUpdateResult = {
	readonly snapshot: CustomPaletteSnapshotPayload;
	readonly compiled: boolean;
};

export class CustomPaletteService {
	private lastSnapshot: CustomPaletteSnapshotPayload = {
		nodes: [],
		errors: [],
		status: 'not_compiled',
	};

	constructor(private readonly registry: CustomNodeRegistry) {}

	getSnapshot(): CustomPaletteSnapshotPayload {
		return this.lastSnapshot;
	}

	compilingSnapshot(): CustomPaletteSnapshotPayload {
		const snapshot: CustomPaletteSnapshotPayload = {
			nodes: this.lastSnapshot.nodes,
			errors: this.lastSnapshot.errors,
			status: 'compiling',
		};
		this.lastSnapshot = snapshot;
		return snapshot;
	}

	/** Empty palette with no packs — sync registry without compiling. */
	applyEmptyOk(): CustomPaletteSnapshotPayload {
		this.registry.setNodes([]);
		const snapshot: CustomPaletteSnapshotPayload = {
			nodes: [],
			errors: [],
			status: 'ok',
		};
		this.lastSnapshot = snapshot;
		return snapshot;
	}

	async update(
		projectDir: string,
		options?: CustomPaletteUpdateOptions,
	): Promise<CustomPaletteUpdateResult> {
		const loaded = await loadProjectNodes(projectDir, {
			force: options?.force === true,
			...(options?.onCompile === undefined
				? {}
				: { onCompile: options.onCompile }),
		});
		this.registry.setNodes(loaded.nodes);

		const nodes: readonly PaletteNodeDefinition[] = loaded.nodes.map(
			(node: ReactiveNodeDefinition) =>
				toPaletteDefinition(node, 'custom'),
		);
		const errors = toPackErrors(loaded.errors);
		const snapshot: CustomPaletteSnapshotPayload = {
			nodes,
			errors,
			status: statusFromResult(nodes.length, errors.length),
		};
		this.lastSnapshot = snapshot;
		return { snapshot, compiled: loaded.compiled };
	}
}
