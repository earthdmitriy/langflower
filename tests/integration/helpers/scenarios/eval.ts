import type { WorkflowSavePayload } from '@langflower/shared/langflower.js';
import {
	assertNode,
	compareNode,
	edge,
	finishNode,
	numberNode,
	savePayload,
	scenarioMetadata,
	stringNode,
} from '../workflow-scenario-builders.js';

/**
 * Epic 09 — suiteScore vs threshold → Compare(gte) → Assert → Finish.
 * Models the fail-closed regression gate on the canvas (epic 06 Assert).
 * @see execute-eval-regression-gate.ws.test.ts
 */
export const evalRegressionGateWorkflow = (
	suiteScore: number,
	threshold = 1,
): WorkflowSavePayload => {
	const id =
		suiteScore >= threshold
			? 'eval-regression-gate-pass'
			: 'eval-regression-gate-fail';
	const name =
		suiteScore >= threshold
			? 'Eval regression gate (pass)'
			: 'Eval regression gate (fail)';
	return savePayload(
		id,
		scenarioMetadata(
			name,
			'Compare suiteScore >= threshold → Assert stop-on-regression',
		),
		[
			numberNode(
				'suite-score',
				suiteScore,
				{ x: 40, y: 80 },
				'Suite score',
			),
			numberNode('threshold', threshold, { x: 40, y: 220 }, 'Threshold'),
			compareNode('cmp', 'gte', { x: 280, y: 140 }, 'Score ≥ threshold'),
			stringNode(
				'summary',
				`suiteScore=${suiteScore} threshold=${threshold}`,
				{ x: 280, y: 300 },
				'Summary',
			),
			assertNode(
				'gate',
				{ x: 560, y: 180 },
				'Eval regression: suite score below threshold',
				'Assert gate',
			),
			finishNode('done', { x: 820, y: 180 }, 'Gate passed'),
		],
		[
			edge('e-score-a', 'suite-score', 'value', 'cmp', 'a'),
			edge('e-thr-b', 'threshold', 'value', 'cmp', 'b'),
			edge('e-cmp-assert', 'cmp', 'result', 'gate', 'condition'),
			edge('e-sum-assert', 'summary', 'value', 'gate', 'value'),
			edge('e-assert-done', 'gate', 'value', 'done', 'value'),
		],
	);
};
