import type { WorkflowSavePayload } from '@langflower/shared/langflower.js';
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
	ui,
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
 * Ref: tests/fixtures/workflows/delay-preview.json
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

// ─── Runtime primitives (await catalog: router, triple, throw) ───────────────

/**
 * @see execute-router.ws.test.ts
 * Ref: tests/fixtures/workflows/router-two-channels.json
 * User: global run — preview-a shows "alpha", preview-b shows "beta".
 * Partial rerun: change one string, startNode on that branch.
 */
export const routerTwoChannelsWorkflow = (): WorkflowSavePayload => {
	return savePayload(
		'router-two-channels',
		scenarioMetadata('Router Two Channels'),
		[
			stringNode('string-a', 'alpha', { x: 40, y: 80 }, 'String A'),
			stringNode('string-b', 'beta', { x: 40, y: 200 }, 'String B'),
			{
				id: 'router-1',
				type: 'common-router',
				params: {},
				inputs: {},
				ui: ui(240, 140, 'Router'),
			},
			previewNode('preview-a', { x: 420, y: 80 }, 'Preview A'),
			previewNode('preview-b', { x: 420, y: 200 }, 'Preview B'),
		],
		[
			edge('edge-a', 'string-a', 'value', 'router-1', 'ch'),
			edge('edge-b', 'string-b', 'value', 'router-1', 'ch@1'),
			edge('edge-pa', 'router-1', 'ch', 'preview-a', 'text'),
			edge('edge-pb', 'router-1', 'ch@1', 'preview-b', 'text'),
		],
	);
};

/**
 * @see execute-triple.ws.test.ts
 * Ref: tests/fixtures/workflows/triple-emit.json
 * User: run reactive triple — preview receives three "triple-me" emissions.
 */
export const tripleEmitWorkflow = (): WorkflowSavePayload => {
	return savePayload(
		'triple-emit',
		scenarioMetadata('Triple Emit'),
		[
			stringNode('string-1', 'triple-me', { x: 40, y: 80 }),
			{
				id: 'triple-1',
				type: 'common-triple',
				params: {},
				inputs: { delay: 30 },
				ui: ui(240, 80, 'Triple'),
			},
			previewNode('preview-1', { x: 440, y: 80 }),
		],
		[
			edge('edge-c-t', 'string-1', 'value', 'triple-1', 'value'),
			edge('edge-t-p', 'triple-1', 'value', 'preview-1', 'text'),
		],
	);
};

/**
 * @see execute-resilient.ws.test.ts
 * Ref: tests/fixtures/workflows/throw-preview.json
 * User: run — throw node fails; preview never receives value; run ends with errors.
 */
export const throwPreviewWorkflow = (): WorkflowSavePayload => {
	return savePayload(
		'throw-preview',
		scenarioMetadata('Throw Preview'),
		[
			{
				id: 'throw-1',
				type: 'common-throw',
				params: {},
				inputs: {},
				ui: ui(80, 120, 'Throw'),
			},
			previewNode('preview-1', { x: 320, y: 120 }),
		],
		[edge('edge-1', 'throw-1', 'done', 'preview-1', 'text')],
	);
};
