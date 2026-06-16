import { statefulConnection } from '@rx-evo/stateful-observable';
import { map } from 'rxjs';
import type { NodeId, PortMeta, RuntimeNode } from '../../types.js';

export type JoinTestNodeOptions = {
	readonly nodeId: string;
	readonly separator?: string;
	/** `combine` = combineLatest; `zip` = flush after emit (all slots fresh). */
	readonly mode?: 'combine' | 'zip';
};

/**
 * Join stand-in — multi `lines` input receives an ordered array via `combine`
 * (combineLatest) or `zip` (flush after emit).
 */
export function createJoinTestNode(options: JoinTestNodeOptions): RuntimeNode {
	const { nodeId, separator = '\n', mode = 'combine' } = options;
	const lines = statefulConnection<readonly unknown[], unknown, PortMeta>({
		meta: {
			dir: 'in',
			portId: 'lines',
			wireType: 'string',
			mode,
		} satisfies PortMeta,
	});
	const text = lines
		.pipeValue(
			map((values) =>
				values.map((value) => String(value ?? '')).join(separator),
			),
		)
		.with({
			meta: {
				dir: 'out',
				portId: 'text',
				wireType: 'string',
			} satisfies PortMeta,
		});

	return {
		nodeId: nodeId as NodeId,
		inputs: { lines },
		outputs: { text },
		bypassPorts: {},
	};
}
