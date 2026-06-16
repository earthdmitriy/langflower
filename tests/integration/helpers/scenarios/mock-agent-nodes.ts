import type { WorkflowSavePayload } from '@langflower/shared/langflower.js';
import { ui } from '../workflow-scenario-builders.js';

const MOCK_AGENT_PARAMS = {
	providerId: 'mock',
	model: 'test-model',
	enabledTools: [] as readonly string[],
	temperature: 0.7,
	maxTokens: 4096,
	maxIterations: 3,
} as const;

export const mockAgentParams = (): typeof MOCK_AGENT_PARAMS =>
	MOCK_AGENT_PARAMS;

export const agentNode = (
	id: string,
	position: { readonly x: number; readonly y: number },
	label = 'Agent',
): WorkflowSavePayload['graph']['nodes'][number] => ({
	id,
	type: 'common-agent',
	params: { ...MOCK_AGENT_PARAMS },
	inputs: {},
	ui: ui(position.x, position.y, label),
});

export const dialogNode = (
	id: string,
	position: { readonly x: number; readonly y: number },
	label = 'Ask User',
): WorkflowSavePayload['graph']['nodes'][number] => ({
	id,
	type: 'common-dialog',
	params: {},
	inputs: {},
	ui: ui(position.x, position.y, label),
});
