import type { WorkflowSavePayload } from '@langflower/shared/types/langflower-workflow.js';
import {
	chatLoopNode,
	edge,
	hitlReviewGateNode,
	previewNode,
	savePayload,
	scenarioMetadata,
	stringNode,
} from '../workflow-scenario-builders.js';

/** @see execute-hitl-inputs.ws.test.ts — Review approve button */
export const hitlReviewApproveWorkflow = (): WorkflowSavePayload => {
	return savePayload(
		'hitl-review-approve',
		scenarioMetadata('HITL Review Approve'),
		[
			stringNode('result-1', 'approved draft', { x: 0, y: 0 }),
			hitlReviewGateNode('review-1', { x: 280, y: 0 }),
			previewNode('preview-1', { x: 560, y: 0 }),
		],
		[
			edge('e1', 'result-1', 'value', 'review-1', 'result'),
			edge('e2', 'review-1', 'response', 'preview-1', 'text'),
		],
	);
};

/** @see execute-hitl-inputs.ws.test.ts — Review request-changes textarea */
export const hitlReviewFeedbackWorkflow = (): WorkflowSavePayload => {
	return savePayload(
		'hitl-review-feedback',
		scenarioMetadata('HITL Review Feedback'),
		[
			stringNode('result-1', 'needs work', { x: 0, y: 0 }),
			hitlReviewGateNode('review-1', { x: 280, y: 0 }),
			previewNode('preview-1', { x: 560, y: 0 }),
		],
		[
			edge('e1', 'result-1', 'value', 'review-1', 'result'),
			edge('e2', 'review-1', 'feedback', 'preview-1', 'text'),
		],
	);
};

/** @see execute-hitl-inputs.ws.test.ts — Chat Loop Send → feedback */
export const hitlChatLoopWorkflow = (): WorkflowSavePayload => {
	return savePayload(
		'hitl-chat-loop',
		scenarioMetadata('HITL Chat Loop'),
		[
			stringNode('result-1', 'agent turn', { x: 0, y: 0 }),
			chatLoopNode('loop-1', { x: 280, y: 0 }),
			previewNode('preview-1', { x: 560, y: 0 }),
		],
		[
			edge('e1', 'result-1', 'value', 'loop-1', 'result'),
			edge('e2', 'loop-1', 'feedback', 'preview-1', 'text'),
		],
	);
};
