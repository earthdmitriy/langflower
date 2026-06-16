import type { WorkflowSavePayload } from '@langflower/shared/langflower.js';
import {
	agentCoderBashWorkflow,
	agentPlanAskWorkflow,
	agentPlanReadWorkflow,
	agentReviewAcceptWorkflow,
	agentReviewLoopWorkflow,
	agentStructuredOutputWorkflow,
} from './scenarios/agents-mock.js';
import {
	agentSwarmWorkflow,
	articleWritingWorkflow,
	basicCoderWorkflow,
	chatInputMultiTurnWorkflow,
	codingAgentWorkflow,
	permissionEscalationOpsWorkflow,
	promptRefiningWorkflow,
	researchFanoutWorkflow,
} from './scenarios/agents-pilots.js';
import { evalRegressionGateWorkflow } from './scenarios/eval.js';
import {
	adversarialRedTeamWorkflow,
	fakeLlmDebateLoopWorkflow,
	fakeLlmMaxIterationsContinueWorkflow,
	fakeLlmStreamWorkflow,
	fakeLlmToolsWorkflow,
} from './scenarios/fake-llm.js';
import {
	hitlReviewApproveWorkflow,
	hitlReviewFeedbackWorkflow,
	llmHitlFeedbackWorkflow,
	llmHitlOnceWorkflow,
	simpleHitlPreviewWorkflow,
} from './scenarios/hitl.js';
import {
	bootstrapExampleWorkflow,
	checkpointResumeWorkflow,
	delayPreviewWorkflow,
	hardHarnessAssertIfWorkflow,
	routerTwoChannelsWorkflow,
	stringFinishWorkflow,
	stringPreviewOpenRunWorkflow,
	stringPreviewWorkflow,
	throwPreviewWorkflow,
	tripleEmitWorkflow,
} from './scenarios/smoke.js';

/**
 * Single composer table: scenario id === factory `workflowId` ===
 * `workflowScenarioById` key === `scenarioReadyById` argument.
 * Catalog gates are derived from each factory's node types.
 */
export type WorkflowScenarioComposerEntry = {
	readonly id: string;
	readonly factory: () => WorkflowSavePayload;
};

export const WORKFLOW_SCENARIO_COMPOSER: readonly WorkflowScenarioComposerEntry[] =
	[
		{ id: 'example', factory: bootstrapExampleWorkflow },
		{ id: 'smoke', factory: () => stringPreviewWorkflow() },
		{ id: 'open-run', factory: stringPreviewOpenRunWorkflow },
		{ id: 'string-finish', factory: () => stringFinishWorkflow() },
		{ id: 'delay-preview', factory: delayPreviewWorkflow },
		{ id: 'checkpoint-resume', factory: checkpointResumeWorkflow },
		{
			id: 'hard-harness-assert-if',
			factory: hardHarnessAssertIfWorkflow,
		},
		{
			id: 'eval-regression-gate-pass',
			factory: () => evalRegressionGateWorkflow(1, 1),
		},
		{
			id: 'eval-regression-gate-fail',
			factory: () => evalRegressionGateWorkflow(0.5, 1),
		},
		{ id: 'router-two-channels', factory: routerTwoChannelsWorkflow },
		{ id: 'triple-emit', factory: tripleEmitWorkflow },
		{ id: 'throw-preview', factory: throwPreviewWorkflow },
		{ id: 'llm-hitl-once', factory: llmHitlOnceWorkflow },
		{ id: 'llm-hitl', factory: llmHitlFeedbackWorkflow },
		{ id: 'simple', factory: simpleHitlPreviewWorkflow },
		{
			id: 'agent-structured-output',
			factory: agentStructuredOutputWorkflow,
		},
		{ id: 'agent-review-accept', factory: agentReviewAcceptWorkflow },
		{ id: 'agent-review-loop', factory: agentReviewLoopWorkflow },
		{ id: 'agent-plan-read', factory: agentPlanReadWorkflow },
		{ id: 'agent-plan-ask', factory: agentPlanAskWorkflow },
		{ id: 'agent-coder-bash', factory: agentCoderBashWorkflow },
		{ id: 'hitl-review-approve', factory: hitlReviewApproveWorkflow },
		{ id: 'hitl-review-feedback', factory: hitlReviewFeedbackWorkflow },
		{ id: 'fake-llm-stream', factory: fakeLlmStreamWorkflow },
		{ id: 'fake-llm-tools', factory: fakeLlmToolsWorkflow },
		{ id: 'fake-llm-debate-loop', factory: fakeLlmDebateLoopWorkflow },
		{
			id: 'fake-llm-max-iterations-continue',
			factory: fakeLlmMaxIterationsContinueWorkflow,
		},
		{ id: 'adversarial-red-team', factory: adversarialRedTeamWorkflow },
		{ id: 'prompt-refining', factory: promptRefiningWorkflow },
		{ id: 'article-writing', factory: articleWritingWorkflow },
		{ id: 'basic-coder', factory: basicCoderWorkflow },
		{
			id: 'permission-escalation-ops',
			factory: permissionEscalationOpsWorkflow,
		},
		{ id: 'coding-agent', factory: codingAgentWorkflow },
		{ id: 'chat-input-multi-turn', factory: chatInputMultiTurnWorkflow },
		{ id: 'research-fanout', factory: researchFanoutWorkflow },
		{ id: 'agent-swarm', factory: agentSwarmWorkflow },
	];

const scenarioFactoryById = new Map(
	WORKFLOW_SCENARIO_COMPOSER.map((entry) => [entry.id, entry.factory]),
);

/** Lookup by scenario id (composer-owned). */
export const workflowScenarioById = (
	id: string,
): WorkflowSavePayload | undefined => {
	const factory = scenarioFactoryById.get(id);

	return factory === undefined ? undefined : factory();
};
