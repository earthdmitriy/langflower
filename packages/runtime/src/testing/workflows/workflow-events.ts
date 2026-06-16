import { filter, firstValueFrom } from 'rxjs';
import { RuntimeEditor } from '../../runtime-editor.js';
import { RuntimeRunner } from '../../runtime-runner.js';
import { type RuntimeOptions } from '../../runtime.js';
import type { RunId, RuntimeEdge, RuntimeRunnerEvent } from '../../types.js';

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

export type OutputEmittedEvent = Extract<
	RuntimeRunnerEvent,
	{ kind: 'output-emitted' }
>;

function isOutputEmitted(
	event: RuntimeRunnerEvent,
): event is OutputEmittedEvent {
	return event.kind === 'output-emitted' && event.state === 'value';
}

export function outputValues(
	events: readonly RuntimeRunnerEvent[],
	nodeId: string,
	portId: string,
	runId?: string,
): unknown[] {
	return events
		.filter(
			(event): event is OutputEmittedEvent =>
				isOutputEmitted(event) &&
				event.nodeId === nodeId &&
				event.portId === portId &&
				(runId === undefined || event.runId === runId),
		)
		.map((event) => event.value);
}

export async function waitForOutput(
	runtime: RuntimeRunner | RuntimeHarness,
	nodeId: string,
	portId: string,
	runId?: string,
): Promise<OutputEmittedEvent> {
	return waitForOutputMatching(runtime, nodeId, portId, () => true, runId);
}

async function waitForOutputMatching(
	runtime: RuntimeRunner | RuntimeHarness,
	nodeId: string,
	portId: string,
	predicate: (value: unknown) => boolean,
	runId?: string,
): Promise<OutputEmittedEvent> {
	const runner = resolveRunner(runtime);

	return firstValueFrom(
		runner.events$.pipe(
			filter(
				(event): event is OutputEmittedEvent =>
					isOutputEmitted(event) &&
					event.nodeId === nodeId &&
					event.portId === portId &&
					(runId === undefined || event.runId === runId) &&
					predicate(event.value),
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

async function collectEventsForMs(
	runtime: RuntimeRunner | RuntimeHarness,
	ms: number,
): Promise<readonly RuntimeRunnerEvent[]> {
	const events: RuntimeRunnerEvent[] = [];
	const runner = resolveRunner(runtime);
	const subscription = runner.events$.subscribe((event) => {
		events.push(event);
	});

	await new Promise((resolve) => {
		setTimeout(resolve, ms);
	});

	subscription.unsubscribe();
	return events;
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
					(event): event is { kind: 'done'; runId: RunId } =>
						event.kind === 'done' &&
						(runId === undefined || event.runId === runId),
				),
			),
		).then(() => 'done' as const),
		new Promise<'timeout'>((resolve) => {
			setTimeout(() => resolve('timeout'), ms);
		}),
	]);

	return result === 'timeout';
}
