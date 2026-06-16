import type { WorkflowSavePayload } from '@langflower/shared/langflower.js';
import {
	edge,
	fakeLlmNode,
	finishNode,
	hitlReviewGateNode,
	memoryToolsNode,
	previewNode,
	savePayload,
	scenarioMetadata,
	stringNode,
} from '../workflow-scenario-builders.js';

/**
 * @see execute-fake-llm.ws.test.ts
 * User: run string → fake-llm → preview; collect streaming reasoning/draft.
 */
export const fakeLlmStreamWorkflow = (): WorkflowSavePayload => {
	return savePayload(
		'fake-llm-stream',
		scenarioMetadata('Fake LLM Stream'),
		[
			stringNode('prompt-1', 'Write a haiku', { x: 0, y: 0 }, 'Prompt'),
			fakeLlmNode('llm-1', { x: 280, y: 0 }, { tokenDelayMs: 0 }),
			previewNode('preview-1', { x: 560, y: 0 }),
		],
		[
			edge('e-prompt', 'prompt-1', 'value', 'llm-1', 'userPrompt'),
			edge('e-response', 'llm-1', 'response', 'preview-1', 'text'),
		],
	);
};

/**
 * @see execute-fake-llm-debate-loop.ws.test.ts
 * Soft↔Hard debate (no finish): topic → soft; soft.response → hard;
 * hard.response → soft.feedback. Unwired reasoning/draft drive materialization.
 * maxFeedbackTurns on Soft caps unbounded revise storms (epic 08).
 */
export const fakeLlmDebateLoopWorkflow = (): WorkflowSavePayload => {
	return savePayload(
		'fake-llm-debate-loop',
		scenarioMetadata('Fake LLM Debate Loop'),
		[
			stringNode(
				'topic',
				'Should Langflower use a soft harness or a hard harness? Debate.',
				{ x: 0, y: 120 },
				'Topic',
			),
			// >0 so Soft↔Hard cannot wedge the event loop before interrupt.
			fakeLlmNode(
				'soft',
				{ x: 280, y: 40 },
				{ tokenDelayMs: 1, maxFeedbackTurns: 2 },
				'Soft',
			),
			fakeLlmNode(
				'hard',
				{ x: 280, y: 200 },
				{ tokenDelayMs: 1 },
				'Hard',
			),
		],
		[
			edge('e-topic', 'topic', 'value', 'soft', 'userPrompt'),
			edge('e-soft-hard', 'soft', 'response', 'hard', 'userPrompt'),
			edge('e-hard-soft', 'hard', 'response', 'soft', 'feedback'),
		],
	);
};

/**
 * Epic 08 Partial pilot — adversarial-red-team (CI fake path).
 * Task → proposer → attacker (feedback revise) → HITL Accept → Finish.
 * Critique uses `feedback` edges (not toolCall ports). CI mocks providers via Fake LLM.
 * Only one wire into proposer.feedback (attacker) — LLM feedback is not multi;
 * HITL/Review reject→revise is deferred (demo uses common-review accept path).
 * @see execute-adversarial-red-team.ws.test.ts
 */
export const adversarialRedTeamWorkflow = (): WorkflowSavePayload => {
	return savePayload(
		'adversarial-red-team',
		scenarioMetadata(
			'Adversarial red team',
			'Proposer → red-team feedback → HITL Accept → Finish',
		),
		[
			stringNode(
				'task',
				'Claim: soft harness should be the Langflower default. Defend briefly.',
				{ x: 40, y: 200 },
				'Task / claim',
			),
			fakeLlmNode(
				'proposer',
				{ x: 300, y: 160 },
				{
					// maxFeedbackTurns caps Soft↔Hard; delay 0 is safe once capped.
					tokenDelayMs: 0,
					rolePreset: 'custom',
					maxIterations: 4,
					maxFeedbackTurns: 1,
				},
				'Proposer',
			),
			fakeLlmNode(
				'attacker',
				{ x: 560, y: 280 },
				{
					tokenDelayMs: 0,
					rolePreset: 'custom',
					maxIterations: 4,
					maxFeedbackTurns: 0,
				},
				'Red-team',
			),
			hitlReviewGateNode('accept', { x: 820, y: 200 }, 'HITL Accept'),
			finishNode('done', { x: 1060, y: 220 }, 'Accepted'),
		],
		[
			edge('e-task-proposer', 'task', 'value', 'proposer', 'userPrompt'),
			edge(
				'e-proposer-attacker',
				'proposer',
				'response',
				'attacker',
				'userPrompt',
			),
			edge(
				'e-attacker-proposer-feedback',
				'attacker',
				'response',
				'proposer',
				'feedback',
			),
			edge(
				'e-attacker-accept',
				'attacker',
				'response',
				'accept',
				'result',
			),
			edge('e-accept-done', 'accept', 'response', 'done', 'value'),
		],
	);
};

/**
 * @see execute-fake-llm.ws.test.ts
 * User: memory-tools → fake-llm.tools; reasoning lists pack tool names.
 */
export const fakeLlmToolsWorkflow = (): WorkflowSavePayload => {
	return savePayload(
		'fake-llm-tools',
		scenarioMetadata('Fake LLM Tools'),
		[
			stringNode(
				'prompt-1',
				'Search the repo',
				{ x: 0, y: 120 },
				'Prompt',
			),
			memoryToolsNode('tools-1', { x: 0, y: 0 }, 'Memory Tools'),
			fakeLlmNode('llm-1', { x: 280, y: 120 }, { tokenDelayMs: 0 }),
			previewNode('preview-1', { x: 560, y: 120 }),
		],
		[
			edge('e-prompt', 'prompt-1', 'value', 'llm-1', 'userPrompt'),
			edge('e-tools', 'tools-1', 'tools', 'llm-1', 'tools'),
			edge('e-response', 'llm-1', 'response', 'preview-1', 'text'),
		],
	);
};

/**
 * Agent maxIterations continue HITL — scripted write then final text after Allow.
 * @see execute-fake-llm-limit-continue.ws.test.ts
 */
export const fakeLlmMaxIterationsContinueWorkflow = (): WorkflowSavePayload => {
	return savePayload(
		'fake-llm-max-iterations-continue',
		scenarioMetadata('Fake LLM maxIterations continue'),
		[
			stringNode(
				'prompt-1',
				'Write out.md then finish',
				{ x: 0, y: 0 },
				'Prompt',
			),
			fakeLlmNode(
				'llm-1',
				{ x: 280, y: 0 },
				{
					tokenDelayMs: 0,
					rolePreset: 'custom',
					enabledToolIds: ['write'],
					maxIterations: 1,
					scriptedToolTurns: [
						{
							toolCalls: [
								{
									name: 'write',
									arguments: {
										path: 'out.md',
										content: 'hello',
									},
								},
							],
						},
						{ text: 'continued after allow' },
					],
				},
			),
			previewNode('preview-1', { x: 560, y: 0 }),
		],
		[
			edge('e-prompt', 'prompt-1', 'value', 'llm-1', 'userPrompt'),
			edge('e-response', 'llm-1', 'response', 'preview-1', 'text'),
		],
	);
};
