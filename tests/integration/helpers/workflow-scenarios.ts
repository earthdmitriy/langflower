import type { WorkflowSavePayload } from '@langflower/shared/types/langflower-workflow.js';
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
	fakeLlmAskUserQuestionsWorkflow,
	fakeLlmAskUserWorkflow,
	fakeLlmDebateLoopWorkflow,
	fakeLlmMaxIterationsContinueWorkflow,
	fakeLlmPermissionAskTimeoutWorkflow,
	fakeLlmStreamWorkflow,
	fakeLlmToolsWorkflow,
} from './scenarios/fake-llm.js';
import {
	hitlChatLoopWorkflow,
	hitlReviewApproveWorkflow,
	hitlReviewFeedbackWorkflow,
} from './scenarios/hitl.js';
import {
	bootstrapExampleWorkflow,
	checkpointResumeWorkflow,
	delayPreviewWorkflow,
	hardHarnessAssertIfWorkflow,
	stringFinishWorkflow,
	stringPreviewOpenRunWorkflow,
	stringPreviewWorkflow,
} from './scenarios/smoke.js';

/**
 * Single composer table: scenario id === factory `workflowId` ===
 * `workflowScenarioById` key === `scenarioReadyById` argument.
 * Every row must use types present in `getCommonReactiveNodeCatalog()`.
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
		{ id: 'hitl-review-approve', factory: hitlReviewApproveWorkflow },
		{ id: 'hitl-review-feedback', factory: hitlReviewFeedbackWorkflow },
		{ id: 'hitl-chat-loop', factory: hitlChatLoopWorkflow },
		{ id: 'fake-llm-stream', factory: fakeLlmStreamWorkflow },
		{ id: 'fake-llm-tools', factory: fakeLlmToolsWorkflow },
		{ id: 'fake-llm-debate-loop', factory: fakeLlmDebateLoopWorkflow },
		{
			id: 'fake-llm-max-iterations-continue',
			factory: fakeLlmMaxIterationsContinueWorkflow,
		},
		{ id: 'fake-llm-ask-user', factory: fakeLlmAskUserWorkflow },
		{
			id: 'fake-llm-ask-user-questions',
			factory: fakeLlmAskUserQuestionsWorkflow,
		},
		{
			id: 'fake-llm-permission-ask-timeout',
			factory: fakeLlmPermissionAskTimeoutWorkflow,
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
