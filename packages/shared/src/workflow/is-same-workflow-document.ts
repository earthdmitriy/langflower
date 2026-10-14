import type { WorkflowLoadedPayload } from '../types/langflower-workflow.js';

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' &&
	value !== null &&
	!Array.isArray(value) &&
	Object.getPrototypeOf(value) === Object.prototype;

/**
 * Structural equality. Array order counts. Object key order does not.
 * Non-plain objects (dates, class instances) compare by reference only.
 */
const deepEqual = (left: unknown, right: unknown): boolean => {
	if (Object.is(left, right)) {
		return true;
	}

	if (Array.isArray(left) || Array.isArray(right)) {
		if (!Array.isArray(left) || !Array.isArray(right)) {
			return false;
		}
		if (left.length !== right.length) {
			return false;
		}
		for (let index = 0; index < left.length; index += 1) {
			if (!deepEqual(left[index], right[index])) {
				return false;
			}
		}
		return true;
	}

	if (!isPlainRecord(left) || !isPlainRecord(right)) {
		return false;
	}

	const leftKeys = Object.keys(left);
	if (leftKeys.length !== Object.keys(right).length) {
		return false;
	}

	for (const key of leftKeys) {
		if (!Object.hasOwn(right, key) || !deepEqual(left[key], right[key])) {
			return false;
		}
	}

	return true;
};

const withoutViewport = (document: WorkflowLoadedPayload) => {
	const { viewport: _viewport, ...graph } = document.graph;
	return {
		workflowId: document.workflowId,
		metadata: document.metadata,
		graph,
	};
};

/**
 * Content equality of two loaded workflow documents.
 * Ignores `graph.viewport` (pan and zoom). Node order and edge order
 * count — this does not sort them.
 */
export const isSameWorkflowDocument = (
	left: WorkflowLoadedPayload,
	right: WorkflowLoadedPayload,
): boolean => deepEqual(withoutViewport(left), withoutViewport(right));
