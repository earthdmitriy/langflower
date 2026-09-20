import { defineLlmNode } from '@langflower/node-sdk/llm';
import { llmCompactionUiSchema } from '../../features/ui-schema/llm-compaction-ui-schema.js';
import { llmRecoveryUiSchema } from '../../features/ui-schema/llm-recovery-ui-schema.js';
import {
	llmMaxIterationsUiField,
	llmPanelUiSchema,
} from '../../features/ui-schema/llm-panel-ui-schema.js';
import {
	DEFAULT_PATH_CHOICE_MAX_ITERATIONS,
	PATH_CHOICE_MAX_ITERATIONS_CAP,
} from '../../features/prompt/normalize-max-iterations.js';
import {
	REVIEW_ACCEPT_TOOL,
	REVIEW_FEEDBACK_TOOL,
} from '../../features/path-choice/control-tools.js';
import { bindPathChoiceSession } from '../../features/path-choice/bind-path-choice-session.js';

const FORCED_TOOL_SYSTEM = [
	'You are an adversarial Critique node — not the author of the assignment.',
	`Finish by calling exactly one control tool: ${REVIEW_ACCEPT_TOOL} or ${REVIEW_FEEDBACK_TOOL}.`,
	'Do not complete or rewrite the original assignment yourself.',
	'Your job is to attack the packet: contradictions, overclaim, unsafe assumptions, missing evidence, scope creep.',
	'You may call optional inventory tools first when they help investigate.',
	'Do not write free-form accept/reject essays.',
	`Call ${REVIEW_FEEDBACK_TOOL} with concrete findings when the packet is not yet defensible.`,
	`Call ${REVIEW_ACCEPT_TOOL} only when further attack is non-blocking — agreed enough to stop critiquing.`,
].join(' ');

const buildUserContent = (assignment: string, packet: string): string =>
	[
		'## Original assignment',
		assignment.trim().length > 0 ? assignment : '(empty assignment)',
		'',
		'## Packet to attack',
		packet.trim().length > 0 ? packet : '(empty packet)',
	].join('\n');

const buildRevisedPacketUserContent = (packet: string): string =>
	[
		'## Revised packet to attack',
		packet.trim().length > 0 ? packet : '(empty packet)',
	].join('\n');

/**
 * Adversarial Critique: path choice via the same Review-private control tools
 * (`accept` / `feedback`). First input is the original assignment; second is
 * the packet under attack. Optional inventory / MCP / Sub-Agents may run first.
 *
 * Session history uses the shared {@link createLlmSessionCycle$} (ADR-016):
 * init = assignment / system / inventory; turn driver = `packet`.
 */
export const critiqueNode = defineLlmNode({
	type: 'common-critique',
	displayName: 'Critique',
	category: 'AI',
	description: `
Attack the work against the original assignment. **Accept** when it is good enough, or send **feedback** with findings.

Wire the assignment on the first input and the packet to critique on the second. Needs a model that can call tools.
`.trim(),
	uiSchema: [
		...llmPanelUiSchema.filter((item) => item.field !== 'maxIterations'),
		llmMaxIterationsUiField(
			DEFAULT_PATH_CHOICE_MAX_ITERATIONS,
			PATH_CHOICE_MAX_ITERATIONS_CAP,
		),
		...llmCompactionUiSchema,
		...llmRecoveryUiSchema,
	] as const,
	bind(ctx, helpers, inventory) {
		return bindPathChoiceSession(ctx, helpers, inventory, {
			primary: { id: 'assignment', name: 'assignment' },
			turn: { id: 'packet', name: 'packet' },
			forcedSystem: FORCED_TOOL_SYSTEM,
			requireProviderError: 'Provider is required for Critique chat',
			requireModelError: 'Model is required for Critique chat',
			buildUserContent,
			buildRevisedUserContent: buildRevisedPacketUserContent,
		});
	},
});
