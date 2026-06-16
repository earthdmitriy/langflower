import type { ReactiveNodeDefinition } from '@langflower/node-sdk';

/**
 * Mutable custom definition map updated only after a successful compile.
 */
export class CustomNodeRegistry {
	private byType = new Map<string, ReactiveNodeDefinition>();

	setNodes(nodes: readonly ReactiveNodeDefinition[]): void {
		const next = new Map<string, ReactiveNodeDefinition>();

		for (const node of nodes) {
			next.set(node.type, node);
		}

		this.byType = next;
	}

	clear(): void {
		this.byType = new Map();
	}

	get(type: string): ReactiveNodeDefinition | undefined {
		return this.byType.get(type);
	}
}
