import type { WorkflowSavePayload } from '@langflower/shared/types/langflower-workflow.js';
import {
	assertNode,
	booleanNode,
	checkpointNode,
	delayNode,
	edge,
	finishNode,
	ifNode,
	previewNode,
	savePayload,
	scenarioMetadata,
	stringNode,
} from '../workflow-scenario-builders.js';

// ─── Runnable today (catalog: string, delay, preview, finish) ───────────────

/** @see execute-smoke.ws.test.ts — bootstrap `example.json` */
export const bootstrapExampleWorkflow = (): WorkflowSavePayload => {
	return savePayload(
		'example',
		scenarioMetadata('Example', 'String literal workflow'),
		[
			stringNode('string-1', 'Hello Langflower', { x: 0, y: 0 }),
			previewNode('preview-1', { x: 240, y: 0 }),
		],
		[edge('e1', 'string-1', 'value', 'preview-1', 'text')],
	);
};

/** @see execute-workflow.ws.test.ts — linear string → preview */
export const stringPreviewWorkflow = (
	value = 'Hello Langflower',
): WorkflowSavePayload => {
	return savePayload(
		'smoke',
		scenarioMetadata('Smoke'),
		[
			stringNode('string-1', value, { x: 0, y: 0 }),
			previewNode('preview-1', { x: 240, y: 0 }),
		],
		[edge('e1', 'string-1', 'value', 'preview-1', 'text')],
	);
};

/** @see execute-workflow.ws.test.ts — graph lock / interrupt */
export const stringPreviewOpenRunWorkflow = (): WorkflowSavePayload => {
	return savePayload(
		'open-run',
		scenarioMetadata('Open Run'),
		[
			stringNode('string-1', 'running', { x: 0, y: 0 }),
			previewNode('preview-1', { x: 240, y: 0 }),
		],
		[edge('e1', 'string-1', 'value', 'preview-1', 'text')],
	);
};

/** @see execute-workflow.ws.test.ts — runner.done via finish sink */
export const stringFinishWorkflow = (
	value = 'done-value',
): WorkflowSavePayload => {
	return savePayload(
		'string-finish',
		scenarioMetadata('String Finish'),
		[
			stringNode('string-1', value, { x: 0, y: 0 }),
			finishNode('finish-1', { x: 240, y: 0 }),
		],
		[edge('e1', 'string-1', 'value', 'finish-1', 'value')],
	);
};

/**
 * @see execute-delay.ws.test.ts
 * User: run, wait ≥50ms, read preview "through-delay".
 */
export const delayPreviewWorkflow = (): WorkflowSavePayload => {
	return savePayload(
		'delay-preview',
		scenarioMetadata('Delay Preview'),
		[
			stringNode('string-1', 'through-delay', { x: 80, y: 120 }),
			delayNode('delay-1', 50, { x: 320, y: 120 }),
			previewNode('preview-1', { x: 560, y: 120 }),
		],
		[
			edge('edge-1', 'string-1', 'value', 'delay-1', 'value'),
			edge('edge-2', 'delay-1', 'value', 'preview-1', 'text'),
		],
	);
};

/**
 * @see execute-checkpoint-resume.ws.test.ts / demo checkpoint-resume.json
 * Stage A is short; explicit Checkpoint; Stage B is long so Stop lands after
 * the boundary.
 */
export const checkpointResumeWorkflow = (): WorkflowSavePayload => {
	return savePayload(
		'checkpoint-resume',
		scenarioMetadata(
			'Checkpoint resume',
			'Explicit checkpoint boundary → Stop → Continue after restart',
		),
		[
			stringNode('source', 'checkpoint-ok', { x: 40, y: 120 }, 'Source'),
			delayNode('stage-a', 40, { x: 260, y: 120 }, 'Stage A'),
			previewNode('preview-a', { x: 480, y: 120 }, 'Preview A'),
			checkpointNode(
				'checkpoint-a',
				{ x: 700, y: 120 },
				'Checkpoint A',
				'After stage A',
			),
			delayNode('stage-b', 400, { x: 920, y: 120 }, 'Stage B'),
			previewNode('preview-b', { x: 1140, y: 120 }, 'Preview B'),
			finishNode('finish', { x: 1360, y: 120 }, 'Finish'),
		],
		[
			edge('e-source-a', 'source', 'value', 'stage-a', 'value'),
			edge('e-a-preview', 'stage-a', 'value', 'preview-a', 'text'),
			edge(
				'e-preview-checkpoint',
				'preview-a',
				'text',
				'checkpoint-a',
				'value',
			),
			edge('e-checkpoint-b', 'checkpoint-a', 'value', 'stage-b', 'value'),
			edge('e-b-preview', 'stage-b', 'value', 'preview-b', 'text'),
			edge('e-preview-finish', 'preview-b', 'text', 'finish', 'value'),
		],
	);
};

/**
 * @see execute-hard-harness.ws.test.ts
 * Boolean + string → Assert → IF(true) → Preview (epic 06).
 */
export const hardHarnessAssertIfWorkflow = (): WorkflowSavePayload => {
	return savePayload(
		'hard-harness-assert-if',
		scenarioMetadata('Hard Harness Assert IF'),
		[
			booleanNode('cond-1', true, { x: 40, y: 80 }),
			stringNode('value-1', 'plan-ok', { x: 40, y: 200 }),
			assertNode('assert-1', { x: 280, y: 140 }, 'plan invalid'),
			ifNode('if-1', { x: 520, y: 140 }),
			previewNode('preview-1', { x: 760, y: 80 }),
		],
		[
			edge('e-cond-assert', 'cond-1', 'value', 'assert-1', 'condition'),
			edge('e-val-assert', 'value-1', 'value', 'assert-1', 'value'),
			edge('e-assert-if-val', 'assert-1', 'value', 'if-1', 'value'),
			edge('e-cond-if', 'cond-1', 'value', 'if-1', 'condition'),
			edge('e-if-preview', 'if-1', 'true', 'preview-1', 'text'),
		],
	);
};
