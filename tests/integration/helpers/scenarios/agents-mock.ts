import type { WorkflowSavePayload } from '@langflower/shared/langflower.js';
import {
	edge,
	previewNode,
	savePayload,
	scenarioMetadata,
	stringNode,
	ui,
} from '../workflow-scenario-builders.js';
import { agentNode, mockAgentParams } from './mock-agent-nodes.js';

/**
 * @see execute-structured-output.ws.test.ts
 * User: agent with JSON schema — mock returns invalid JSON → node error telemetry.
 */
export const agentStructuredOutputWorkflow = (): WorkflowSavePayload => {
	return savePayload(
		'agent-structured-output',
		scenarioMetadata('Agent Structured Output'),
		[
			stringNode('prompt-1', 'Return JSON', { x: 0, y: 0 }, 'Prompt'),
			{
				id: 'agent-1',
				type: 'common-agent',
				params: {
					...mockAgentParams(),
					structuredOutput: {
						type: 'object',
						properties: { answer: { type: 'string' } },
						required: ['answer'],
					},
				},
				inputs: {},
				ui: ui(280, 0, 'Agent'),
			},
		],
		[edge('e1', 'prompt-1', 'value', 'agent-1', 'userPrompt')],
	);
};

/**
 * @see execute-review.ws.test.ts (accept path)
 * Ref: tests/fixtures/workflows/agent-review-accept.json
 */
export const agentReviewAcceptWorkflow = (): WorkflowSavePayload => {
	return savePayload(
		'agent-review-accept',
		scenarioMetadata('Agent Review Accept'),
		[
			stringNode(
				'task-1',
				'Draft a one-line summary of the project',
				{ x: 0, y: 0 },
				'Task',
			),
			agentNode('agent-1', { x: 280, y: 0 }),
			{
				id: 'review-1',
				type: 'common-review',
				params: {
					providerId: 'mock',
					model: 'test-model',
					maxIterations: 3,
				},
				inputs: {},
				ui: ui(560, 0, 'Review'),
			},
			previewNode('preview-1', { x: 840, y: 0 }),
		],
		[
			edge('e-task-agent', 'task-1', 'value', 'agent-1', 'userPrompt'),
			edge('e-task-review', 'task-1', 'value', 'review-1', 'task'),
			edge('e-agent-review', 'agent-1', 'response', 'review-1', 'result'),
			edge(
				'e-review-preview',
				'review-1',
				'response',
				'preview-1',
				'text',
			),
		],
	);
};

/**
 * @see execute-review.ws.test.ts (rerun path)
 * Ref: tests/fixtures/workflows/agent-review-loop.json
 */
export const agentReviewLoopWorkflow = (): WorkflowSavePayload => {
	return savePayload(
		'agent-review-loop',
		scenarioMetadata('Agent Review Loop'),
		[
			stringNode(
				'task-1',
				'Write a brief summary of Langflower',
				{ x: 0, y: 0 },
				'Task',
			),
			agentNode('agent-1', { x: 280, y: 0 }),
			{
				id: 'review-1',
				type: 'common-review',
				params: {
					providerId: 'mock',
					model: 'test-model',
					maxIterations: 3,
					maxReviewAttempts: 3,
				},
				inputs: {},
				ui: ui(560, 0, 'Review'),
			},
			previewNode('preview-1', { x: 840, y: 0 }),
		],
		[
			edge('e-task-agent', 'task-1', 'value', 'agent-1', 'userPrompt'),
			edge('e-task-review', 'task-1', 'value', 'review-1', 'task'),
			edge('e-agent-review', 'agent-1', 'response', 'review-1', 'result'),
			edge(
				'e-review-preview',
				'review-1',
				'response',
				'preview-1',
				'text',
			),
			edge(
				'e-review-feedback',
				'review-1',
				'feedback',
				'agent-1',
				'feedback',
			),
		],
	);
};

/**
 * @see execute-agent-mock.ws.test.ts, bootstrap-plan-mock.test.ts
 * Ref: tests/fixtures/workflows/agent-plan-read.json
 * User: plan agent calls read_file tool from mock script, completes.
 */
export const agentPlanReadWorkflow = (): WorkflowSavePayload => {
	return savePayload(
		'agent-plan-read',
		scenarioMetadata('Plan Agent Read'),
		[
			stringNode(
				'prompt-1',
				'Draft a plan from README',
				{ x: 0, y: 0 },
				'Goal',
			),
			{
				id: 'plan-1',
				type: 'common-agent-plan',
				params: {
					providerId: 'mock',
					model: 'test-model',
					maxIterations: 5,
				},
				inputs: {},
				ui: ui(280, 0, 'Plan Agent'),
			},
		],
		[edge('e1', 'prompt-1', 'value', 'plan-1', 'userPrompt')],
	);
};

/**
 * @see execute-agent-mock.ws.test.ts (ask_user tool)
 * Ref: tests/fixtures/workflows/agent-plan-ask.json
 */
export const agentPlanAskWorkflow = (): WorkflowSavePayload => {
	return savePayload(
		'agent-plan-ask',
		scenarioMetadata('Plan Agent Ask'),
		[
			stringNode(
				'prompt-1',
				'Clarify scope before planning',
				{ x: 0, y: 0 },
				'Goal',
			),
			{
				id: 'plan-1',
				type: 'common-agent-plan',
				params: {
					providerId: 'mock',
					model: 'test-model',
					maxIterations: 5,
				},
				inputs: {},
				ui: ui(280, 0, 'Plan Agent'),
			},
		],
		[edge('e1', 'prompt-1', 'value', 'plan-1', 'userPrompt')],
	);
};

/**
 * @see execute-agent-mock.ws.test.ts (permission deny)
 * Ref: tests/fixtures/workflows/agent-coder-bash.json
 */
export const agentCoderBashWorkflow = (): WorkflowSavePayload => {
	return savePayload(
		'agent-coder-bash',
		scenarioMetadata('Coder Agent Bash'),
		[
			stringNode('prompt-1', 'Run tests', { x: 0, y: 0 }, 'Goal'),
			{
				id: 'coder-1',
				type: 'common-agent-coder',
				params: {
					providerId: 'mock',
					model: 'test-model',
					maxIterations: 5,
				},
				inputs: {},
				ui: ui(280, 0, 'Coder Agent'),
			},
		],
		[edge('e1', 'prompt-1', 'value', 'coder-1', 'userPrompt')],
	);
};
