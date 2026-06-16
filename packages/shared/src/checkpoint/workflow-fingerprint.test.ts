import { describe, expect, it } from 'vitest';
import type { NodeId } from '@langflower/runtime';
import { buildWorkflowFingerprint } from './workflow-fingerprint.js';

describe('buildWorkflowFingerprint', () => {
	it('is stable under node/edge reorder and ignores labels', () => {
		const a = buildWorkflowFingerprint(
			[
				{ id: 'n1', type: 'common-string' },
				{ id: 'n2', type: 'common-delay' },
			],
			[
				{
					fromNodeId: 'n1' as NodeId,
					fromPort: ['value', 0],
					toNodeId: 'n2' as NodeId,
					toPort: ['value', 0],
				},
			],
		);
		const b = buildWorkflowFingerprint(
			[
				{ id: 'n2', type: 'common-delay' },
				{ id: 'n1', type: 'common-string' },
			],
			[
				{
					fromNodeId: 'n1' as NodeId,
					fromPort: ['value', 0],
					toNodeId: 'n2' as NodeId,
					toPort: ['value', 0],
				},
			],
		);

		expect(a).toBe(b);
	});

	it('changes when an edge endpoint changes', () => {
		const base = buildWorkflowFingerprint(
			[
				{ id: 'n1', type: 'common-string' },
				{ id: 'n2', type: 'common-delay' },
			],
			[
				{
					fromNodeId: 'n1' as NodeId,
					fromPort: ['value', 0],
					toNodeId: 'n2' as NodeId,
					toPort: ['value', 0],
				},
			],
		);
		const changed = buildWorkflowFingerprint(
			[
				{ id: 'n1', type: 'common-string' },
				{ id: 'n2', type: 'common-delay' },
			],
			[
				{
					fromNodeId: 'n1' as NodeId,
					fromPort: ['value', 0],
					toNodeId: 'n2' as NodeId,
					toPort: ['delay', 0],
				},
			],
		);

		expect(changed).not.toBe(base);
	});
});
