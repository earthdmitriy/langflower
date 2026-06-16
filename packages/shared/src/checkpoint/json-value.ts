import type { WorkflowCheckpointJsonValue } from '../types/workflow-checkpoint.js';

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' &&
	value !== null &&
	!Array.isArray(value) &&
	Object.getPrototypeOf(value) === Object.prototype;

/**
 * Convert an unknown runtime port value into a JSON-safe checkpoint payload.
 * Returns `undefined` when the value cannot be persisted (functions, symbols,
 * class instances, circular structures, bigint, …).
 */
export const toCheckpointJsonValue = (
	value: unknown,
	seen = new WeakSet<object>(),
): WorkflowCheckpointJsonValue | undefined => {
	if (value === null) {
		return null;
	}

	const valueType = typeof value;

	if (valueType === 'string' || valueType === 'boolean') {
		return value as string | boolean;
	}

	if (valueType === 'number') {
		return Number.isFinite(value) ? (value as number) : undefined;
	}

	if (valueType !== 'object') {
		return undefined;
	}

	if (seen.has(value as object)) {
		return undefined;
	}

	seen.add(value as object);

	if (Array.isArray(value)) {
		const items: WorkflowCheckpointJsonValue[] = [];

		for (const item of value) {
			const converted = toCheckpointJsonValue(item, seen);

			if (converted === undefined) {
				return undefined;
			}

			items.push(converted);
		}

		return items;
	}

	if (!isPlainObject(value)) {
		return undefined;
	}

	const entries = Object.entries(value);
	const result: Record<string, WorkflowCheckpointJsonValue> = {};

	for (const [key, entryValue] of entries) {
		const converted = toCheckpointJsonValue(entryValue, seen);

		if (converted === undefined) {
			return undefined;
		}

		result[key] = converted;
	}

	return result;
};
