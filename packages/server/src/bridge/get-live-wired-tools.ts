import type { ToolHandle } from '@langflower/node-sdk';
import type { RuntimeNode } from '@langflower/runtime';
import type { Observable } from 'rxjs';
import type { LangflowerSession } from '../session/langflower-session.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const isToolHandle = (value: unknown): value is ToolHandle => {
	if (!isRecord(value)) {
		return false;
	}

	return (
		typeof value.toolId === 'string' &&
		typeof value.name === 'string' &&
		typeof value.description === 'string' &&
		typeof value.inputSchema === 'object' &&
		value.inputSchema !== null &&
		typeof value.invoke === 'function'
	);
};

/** Flatten multi-wire values that may be single handles or arrays (packs). */
const flattenToolHandles = (wired: readonly unknown[]): readonly ToolHandle[] =>
	wired.flatMap((item) => {
		if (Array.isArray(item)) {
			return item.filter(isToolHandle);
		}

		if (isToolHandle(item)) {
			return [item];
		}

		return [];
	});

const resolveToolsOutput = (
	outputs: RuntimeNode['outputs'],
	portId: string,
): { readonly value$: Observable<unknown> } | undefined => {
	const direct = outputs[portId];
	if (direct !== undefined) {
		return direct;
	}

	return Object.values(outputs).find((port) => port.meta.portId === portId);
};

/**
 * One-shot subscribe to activate a freshly swapped instance without
 * connecting into the LLM `tools` input.
 */
const peekPortValue = (port: {
	readonly value$: Observable<unknown>;
}): unknown => {
	let peeked: unknown;
	const sub = port.value$.subscribe((value) => {
		peeked = value;
	});
	sub.unsubscribe();
	return peeked;
};

/**
 * Activate current editor `tools` / `subagent-registration` outputs
 * (including post-swap instances) so a later inbound peek in
 * {@link getLiveWiredTools} sees live handles.
 */
export const refreshLiveWiredToolPacks = (session: LangflowerSession): void => {
	for (const node of session.runtime.editor.getNodes()) {
		for (const portId of ['tools', 'subagent-registration'] as const) {
			const port = resolveToolsOutput(node.outputs, portId);
			if (port !== undefined) {
				peekPortValue(port);
			}
		}
	}
};

/**
 * Walk inbound `tools` edges on **current** editor instances (post-swap).
 * Does not emit on the LLM tools port (ADR-016 session must not reset).
 */
export const getLiveWiredTools = (
	session: LangflowerSession,
	agentNodeId: string,
): readonly ToolHandle[] => {
	const editor = session.runtime.editor;
	const inbound = editor
		.getEdges()
		.filter(
			(edge) =>
				String(edge.toNodeId) === agentNodeId &&
				edge.toPort[0] === 'tools',
		);

	const packs: unknown[] = [];
	for (const edge of inbound) {
		const source = editor.getNode(edge.fromNodeId);
		if (source === false) {
			continue;
		}

		const port = resolveToolsOutput(source.outputs, edge.fromPort[0]);
		if (port === undefined) {
			continue;
		}

		const peeked = peekPortValue(port);
		if (peeked !== undefined) {
			packs.push(peeked);
		}
	}

	return flattenToolHandles(packs);
};
