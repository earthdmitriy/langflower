import { describe, expect, it } from 'vitest';
import { scenarioReadyById } from '../helpers/workflow-scenario-registry.js';
import {
	agentCoderBashWorkflow,
	agentPlanAskWorkflow,
	agentPlanReadWorkflow,
} from '../helpers/scenarios/agents-mock.js';

describe('execute agent mock (WS bridge)', () => {
	it('defines plan read scenario graph', () => {
		expect(agentPlanReadWorkflow().workflowId).toBe('agent-plan-read');
	});

	it('defines plan ask scenario graph', () => {
		expect(agentPlanAskWorkflow().workflowId).toBe('agent-plan-ask');
	});

	it('defines coder bash scenario graph', () => {
		expect(agentCoderBashWorkflow().workflowId).toBe('agent-coder-bash');
	});

	describe.skipIf(!scenarioReadyById('agent-plan-read'))('runtime', () => {
		it.todo('plan agent mock tool loop (read_file → final response)');
		it.todo('ask_user tool pause + resume via HITL intent');
		it.todo('coder bash denied when config blocks tool permission');
	});
});
