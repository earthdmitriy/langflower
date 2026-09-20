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
	'You are a strict Review node.',
	`Finish by calling exactly one control tool: ${REVIEW_ACCEPT_TOOL} or ${REVIEW_FEEDBACK_TOOL}.`,
	'You may call optional inventory tools first when they help verify the artifact.',
	'Do not write free-form accept/reject essays.',
	`Call ${REVIEW_ACCEPT_TOOL} when the result meets the task criteria.`,
	`Call ${REVIEW_FEEDBACK_TOOL} with revision notes when it does not.`,
].join(' ');

const buildUserContent = (task: string, result: string): string =>
	[
		'## Task / criteria',
		task.trim().length > 0 ? task : '(empty task)',
		'',
		'## Result under review',
		result.trim().length > 0 ? result : '(empty result)',
	].join('\n');

const buildRevisedResultUserContent = (result: string): string =>
	[
		'## Revised result under review',
		result.trim().length > 0 ? result : '(empty result)',
	].join('\n');

/**
 * Dedicated Review node: path choice via **Review-private** control tools
 * (`accept` / `feedback` in `path-choice/control-tools.ts`). Those chat tools are
 * ephemeral on completion calls only — they must not leak into shared
 * inventory / other LLM nodes. Tool payloads demux to `response` / `feedback`
 * ports; free-form replies get a reminder. Optional inventory / MCP /
 * Sub-Agents use shared LLM inventory ports.
 *
 * Session history uses the shared {@link createLlmSessionCycle$} (ADR-016):
 * init = task / system / inventory; turn driver = `result`.
 * @see docs/DONE/EPICS/03-review-node.md
 * @see docs/DONE/EPICS/MECHANICS-tool-execution.md
 */
export const reviewNode = defineLlmNode({
	type: 'common-review',
	displayName: 'Review',
	category: 'AI',
	description: `
A reviewer that must **accept** the work or send **feedback**. Needs a model that can call tools.

Typical uses:
- Gate a draft before the next stage
- Optional extra tools or Sub-Agents for the reviewer to use first
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
			primary: { id: 'task', name: 'task' },
			turn: { id: 'result', name: 'result' },
			forcedSystem: FORCED_TOOL_SYSTEM,
			requireProviderError: 'Provider is required for Review chat',
			requireModelError: 'Model is required for Review chat',
			buildUserContent,
			buildRevisedUserContent: buildRevisedResultUserContent,
		});
	},
});
