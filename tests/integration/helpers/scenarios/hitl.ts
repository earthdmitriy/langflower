import type { WorkflowSavePayload } from '@langflower/shared/langflower.js';
import {
	edge,
	hitlReviewGateNode,
	previewNode,
	savePayload,
	scenarioMetadata,
	stringNode,
} from '../workflow-scenario-builders.js';
import { agentNode, dialogNode } from './mock-agent-nodes.js';

/**
 * @see execute-simple.ws.test.ts
 * Ref: tests/fixtures/workflows/llm-hitl-once.json (without feedback edge)
 * User: run string → mock agent → terminal completed.
 */
export const llmHitlOnceWorkflow = (): WorkflowSavePayload => {
	return savePayload(
		'llm-hitl-once',
		scenarioMetadata('LLM HITL Once'),
		[
			stringNode('prompt-1', 'Say hello', { x: 0, y: 0 }, 'Prompt'),
			agentNode('llm-1', { x: 280, y: 0 }),
			dialogNode('ask-1', { x: 560, y: 0 }),
		],
		[
			edge('e-prompt-llm', 'prompt-1', 'value', 'llm-1', 'userPrompt'),
			edge('e-llm-ask', 'llm-1', 'response', 'ask-1', 'question'),
		],
	);
};

/**
 * @see execute-llm-hitl.ws.test.ts, execute-streaming.ws.test.ts
 * Ref: tests/fixtures/workflows/llm-hitl.json
 * User: agent → ask → feedback loop; second LLM call after user reply.
 */
export const llmHitlFeedbackWorkflow = (): WorkflowSavePayload => {
	return savePayload(
		'llm-hitl',
		scenarioMetadata('LLM HITL Feedback'),
		[
			stringNode('user-prompt', 'Say hello', { x: 0, y: 0 }, 'Prompt'),
			agentNode('llm-1', { x: 200, y: 0 }),
			dialogNode('ask-1', { x: 400, y: 0 }),
		],
		[
			edge('e1', 'user-prompt', 'value', 'llm-1', 'userPrompt'),
			edge('e2', 'llm-1', 'response', 'ask-1', 'question'),
			edge('e3', 'ask-1', 'reply', 'llm-1', 'feedback'),
		],
	);
};

/**
 * @see execute-simple-bootstrap.ws.test.ts
 * Ref: demo-project/.langflower/workflows/simple.json
 * User: preview shows prompt text, HITL pauses run (no terminal progress).
 */
export const simpleHitlPreviewWorkflow = (): WorkflowSavePayload => {
	return savePayload(
		'simple',
		scenarioMetadata('Simple HITL Preview'),
		[
			stringNode(
				'prompt-1',
				'Say hello and ask what I should help with next.',
				{ x: 0, y: 0 },
				'Prompt',
			),
			previewNode('preview-1', { x: 280, y: 0 }),
			dialogNode('ask-1', { x: 560, y: 0 }),
		],
		[
			edge('e-prompt-preview', 'prompt-1', 'value', 'preview-1', 'text'),
			edge('e-preview-ask', 'preview-1', 'text', 'ask-1', 'question'),
			edge('e-ask-preview', 'ask-1', 'reply', 'preview-1', 'text'),
		],
	);
};

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
