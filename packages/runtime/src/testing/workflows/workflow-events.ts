import { filter, firstValueFrom } from 'rxjs';
import {
	isPortTelemetry,
	isPortValueTelemetry,
	isRuntimeDone,
	type EdgeId,
	type PortTelemetry,
	type RunId,
	type RuntimeEdge,
	type RuntimeRunnerEvent,
} from '../../types.js';
import { RuntimeEditor } from '../../runtime-editor.js';
import { RuntimeRunner } from '../../runtime-runner.js';
import { type RuntimeOptions } from '../../runtime.js';

export type RuntimeHarness = {
	readonly editor: RuntimeEditor;
	readonly runner: RuntimeRunner;
};

export function createRuntimeHarness(options?: RuntimeOptions): RuntimeHarness {
	const editor = new RuntimeEditor();
	const runner = new RuntimeRunner(editor, options);

	return { editor, runner };
}

function resolveRunner(runtime: RuntimeRunner | RuntimeHarness): RuntimeRunner {
	if (runtime instanceof RuntimeRunner) {
		return runtime;
	}

	return runtime.runner;
}

export function wireEdge(
	editor: RuntimeEditor,
	edge: Omit<RuntimeEdge, 'edgeId'>,
): void {
	if (!editor.addEdge(edge)) {
		throw new Error(
			`Failed to wire ${edge.fromNodeId}.${edge.fromPort[0]} → ${edge.toNodeId}.${edge.toPort[0]}`,
		);
	}
}

export type OutputEmittedEvent = PortTelemetry & { readonly 0: 'out' };

const isOutputValue = (
	event: RuntimeRunnerEvent,
): event is OutputEmittedEvent & {
	readonly 3: { readonly value: unknown };
} => isPortValueTelemetry(event) && event[0] === 'out';

export function outputValues(
	events: readonly RuntimeRunnerEvent[],
	nodeId: string,
	portId: string,
	_runId?: string,
): unknown[] {
	return events
		.filter(
			(
				event,
			): event is OutputEmittedEvent & {
				readonly 3: { readonly value: unknown };
			} =>
				isOutputValue(event) &&
				event[1] === nodeId &&
				event[2] === portId,
		)
		.map((event) => event[3].value);
}

export async function waitForOutput(
	runtime: RuntimeRunner | RuntimeHarness,
	nodeId: string,
	portId: string,
	_runId?: string,
): Promise<OutputEmittedEvent> {
	return waitForOutputMatching(runtime, nodeId, portId, () => true, _runId);
}

async function waitForOutputMatching(
	runtime: RuntimeRunner | RuntimeHarness,
	nodeId: string,
	portId: string,
	predicate: (value: unknown) => boolean,
	_runId?: string,
): Promise<OutputEmittedEvent> {
	const runner = resolveRunner(runtime);

	return firstValueFrom(
		runner.events$.pipe(
			filter(
				(event): event is OutputEmittedEvent =>
					isOutputValue(event) &&
					event[1] === nodeId &&
					event[2] === portId &&
					predicate(event[3].value),
			),
		),
	);
}

export async function runAndCollectEvents(
	runtime: RuntimeRunner | RuntimeHarness,
	startRun: () => string,
	settleMs = 50,
): Promise<{
	readonly runId: string;
	readonly events: readonly RuntimeRunnerEvent[];
}> {
	const events: RuntimeRunnerEvent[] = [];
	const runner = resolveRunner(runtime);
	const subscription = runner.events$.subscribe((event) => {
		events.push(event);
	});

	const runId = startRun();

	await new Promise((resolve) => {
		setTimeout(resolve, settleMs);
	});

	subscription.unsubscribe();

	return { runId, events };
}

export async function noDoneWithin(
	runtime: RuntimeRunner | RuntimeHarness,
	ms: number,
	runId?: RunId,
): Promise<boolean> {
	const runner = resolveRunner(runtime);

	const result = await Promise.race([
		firstValueFrom(
			runner.events$.pipe(
				filter(
					(event): event is readonly ['done', RunId] =>
						isRuntimeDone(event) &&
						event.length === 2 &&
						(runId === undefined || event[1] === runId),
				),
			),
		).then(() => 'done' as const),
		new Promise<'timeout'>((resolve) => {
			setTimeout(() => resolve('timeout'), ms);
		}),
	]);

	return result === 'timeout';
}

export const edgeIdsFromPortEvent = (event: PortTelemetry): readonly EdgeId[] =>
	event[5];

export const portDirLabel = (
	event: PortTelemetry,
): 'input-received' | 'output-emitted' =>
	event[0] === 'out' ? 'output-emitted' : 'input-received';

export const dtoHas = (
	dtos: readonly unknown[],
	key: 'pending' | 'value' | 'error' | 'inactive',
): boolean =>
	dtos.some((dto) => typeof dto === 'object' && dto !== null && key in dto);

export const dtoIndex = (
	dtos: readonly unknown[],
	key: 'pending' | 'value' | 'error' | 'inactive',
): number =>
	dtos.findIndex(
		(dto) => typeof dto === 'object' && dto !== null && key in dto,
	);
