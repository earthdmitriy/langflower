import type { WorkflowSavePayload } from '@langflower/shared/langflower.js';
import {
	chatInputNode,
	edge,
	fakeLlmNode,
	finishNode,
	hitlReviewGateNode,
	loopNode,
	mergeNode,
	previewNode,
	savePayload,
	scenarioMetadata,
	stringNode,
	subAgentNode,
} from '../workflow-scenario-builders.js';

const PROMPT_REFINING_ARTIFACT = [
	'# Image prompt',
	'',
	'A misty harbor at dawn, cinematic lighting, 35mm film grain --ar 16:9',
	'',
	'Negative: text overlays, watermark, blurry',
].join('\n');

/**
 * Epic 05 Partial pilot — prompt-refining (CI fake path).
 * Brief → Fake LLM (write prompts/scene-01.md) → HITL Review Gate → Finish.
 * @see execute-prompt-refining.ws.test.ts
 */
export const promptRefiningWorkflow = (): WorkflowSavePayload => {
	return savePayload(
		'prompt-refining',
		scenarioMetadata(
			'Prompt refining',
			'Draft prompt → HITL QA → write prompts/scene-01.md',
		),
		[
			stringNode(
				'brief',
				'Misty harbor at dawn for Midjourney, cinematic, no text overlays.',
				{ x: 40, y: 200 },
				'Brief',
			),
			fakeLlmNode(
				'draft',
				{ x: 320, y: 180 },
				{
					tokenDelayMs: 0,
					rolePreset: 'custom',
					enabledToolIds: ['read', 'write', 'create'],
					maxIterations: 4,
					scriptedToolTurns: [
						{
							toolCalls: [
								{
									name: 'write',
									arguments: {
										path: 'prompts/scene-01.md',
										content: PROMPT_REFINING_ARTIFACT,
									},
								},
							],
						},
						{
							text: 'Draft saved to prompts/scene-01.md — ready for QA.',
						},
					],
				},
				'Draft prompt',
			),
			hitlReviewGateNode('qa', { x: 620, y: 180 }, 'HITL QA'),
			finishNode('done', { x: 900, y: 200 }, 'Done'),
		],
		[
			edge('e-brief', 'brief', 'value', 'draft', 'userPrompt'),
			edge('e-draft-qa', 'draft', 'response', 'qa', 'result'),
			edge('e-qa-feedback', 'qa', 'feedback', 'draft', 'feedback'),
			edge('e-qa-done', 'qa', 'response', 'done', 'value'),
		],
	);
};

const ARTICLE_DRAFT_ARTIFACT = [
	'# Harbor mornings',
	'',
	'At first light the docks smell of salt and diesel.',
	'Fishermen move without hurry; the town wakes in layers.',
].join('\n');

/**
 * Epic 05 Partial pilot — article-writing (CI fake path).
 * Topic → Fake LLM outline/draft write → HITL Review Gate → Finish.
 * Research/crawl deferred (epic 12); MCP deferred (epic 16).
 * @see execute-article-writing.ws.test.ts
 */
export const articleWritingWorkflow = (): WorkflowSavePayload => {
	return savePayload(
		'article-writing',
		scenarioMetadata(
			'Article writing',
			'Outline/draft → HITL tone/fact gate → articles/draft.md',
		),
		[
			stringNode(
				'topic',
				'Write a 2-paragraph mood piece about harbor mornings. Audience: travel magazine.',
				{ x: 40, y: 200 },
				'Topic brief',
			),
			fakeLlmNode(
				'draft',
				{ x: 320, y: 180 },
				{
					tokenDelayMs: 0,
					rolePreset: 'custom',
					enabledToolIds: ['read', 'write', 'create'],
					maxIterations: 4,
					scriptedToolTurns: [
						{
							toolCalls: [
								{
									name: 'write',
									arguments: {
										path: 'articles/draft.md',
										content: ARTICLE_DRAFT_ARTIFACT,
									},
								},
							],
						},
						{
							text: 'Draft article written to articles/draft.md.',
						},
					],
				},
				'Draft article',
			),
			hitlReviewGateNode('tone-fact', { x: 620, y: 180 }, 'Tone / facts'),
			finishNode('done', { x: 900, y: 200 }, 'Accepted'),
		],
		[
			edge('e-topic', 'topic', 'value', 'draft', 'userPrompt'),
			edge('e-draft-gate', 'draft', 'response', 'tone-fact', 'result'),
			edge(
				'e-gate-feedback',
				'tone-fact',
				'feedback',
				'draft',
				'feedback',
			),
			edge('e-gate-done', 'tone-fact', 'response', 'done', 'value'),
		],
	);
};

/**
 * Epic 05/13 Partial pilot — basic-coder (CI fake path).
 * Chat Input → Plan (rolePreset) → Coder (rolePreset) with harness tools.
 * Smoke only — full coding-agent Value is `codingAgentWorkflow` / coding-agent.json.
 * @see execute-basic-coder.ws.test.ts
 */
export const basicCoderWorkflow = (): WorkflowSavePayload => {
	return savePayload(
		'basic-coder',
		scenarioMetadata(
			'Basic coder',
			'Chat Input → Plan → Coder with harness tools and permission asks',
		),
		[
			chatInputNode('goal', { x: 40, y: 200 }, 'Goal'),
			fakeLlmNode(
				'plan',
				{ x: 300, y: 120 },
				{
					tokenDelayMs: 0,
					rolePreset: 'plan',
					maxIterations: 4,
					scriptedToolTurns: [
						{
							toolCalls: [
								{
									name: 'read',
									arguments: { path: 'src/greet.ts' },
								},
							],
						},
						{
							toolCalls: [
								{
									name: 'write',
									arguments: {
										path: 'plans/fix.md',
										content: [
											'# Goal',
											'Fix greet() return value.',
											'',
											'# Steps',
											'1. Edit src/greet.ts return string.',
											'2. Keep export intact.',
										].join('\n'),
									},
								},
							],
						},
						{
							text: 'Plan: edit src/greet.ts return to Hello, Langflower! See plans/fix.md.',
						},
					],
				},
				'Plan',
			),
			fakeLlmNode(
				'coder',
				{ x: 580, y: 280 },
				{
					tokenDelayMs: 0,
					rolePreset: 'coder',
					maxIterations: 4,
					scriptedToolTurns: [
						{
							toolCalls: [
								{
									name: 'edit',
									arguments: {
										path: 'src/greet.ts',
										oldString: "return 'Hello, world!';",
										newString:
											"return 'Hello, Langflower!';",
									},
								},
							],
						},
						{
							text: 'Updated src/greet.ts. Review the diff when ready.',
						},
					],
				},
				'Coder',
			),
			previewNode('summary', { x: 860, y: 280 }, 'Summary'),
		],
		[
			edge('e-goal-plan', 'goal', 'message', 'plan', 'userPrompt'),
			edge('e-plan-coder', 'plan', 'response', 'coder', 'userPrompt'),
			edge('e-coder-summary', 'coder', 'response', 'summary', 'text'),
		],
	);
};

/** Write stage inventory — mutate tools only; bash is a later graph stage. */
const WRITE_STAGE_TOOL_IDS = [
	'read',
	'glob',
	'grep',
	'edit',
	'write',
	'create',
	'delete',
] as const;

/**
 * Epic 24 Partial — permission-escalation-ops (CI fake path).
 * Explore (Plan) → Write handoff → Write (no bash) → Bash handoff →
 * Bash (Coder) → Finish. Stages = distinct nodes/budgets — no mid-run tier.
 * Demo real-LLM: demo-project/.../permission-escalation-ops.json.
 * ≠ basic-coder smoke / coding-agent Partial.
 * @see execute-permission-escalation-ops.ws.test.ts
 */
export const permissionEscalationOpsWorkflow = (): WorkflowSavePayload => {
	return savePayload(
		'permission-escalation-ops',
		scenarioMetadata(
			'Permission escalation ops',
			'Explore → write → bash staged-ops (Fake LLM CI path)',
		),
		[
			chatInputNode('goal', { x: 40, y: 280 }, 'Goal'),
			fakeLlmNode(
				'explore',
				{ x: 300, y: 200 },
				{
					tokenDelayMs: 0,
					rolePreset: 'plan',
					maxIterations: 4,
					scriptedToolTurns: [
						{
							toolCalls: [
								{
									name: 'read',
									arguments: { path: 'src/greet.ts' },
								},
							],
						},
						{
							toolCalls: [
								{
									name: 'glob',
									arguments: { pattern: 'src/**/*.ts' },
								},
							],
						},
						{
							text: 'Explore: src/greet.ts returns Hello, world!. Plan: edit return string next.',
						},
					],
				},
				'Explore (Plan)',
			),
			hitlReviewGateNode(
				'write-gate',
				{ x: 580, y: 220 },
				'Write handoff',
			),
			fakeLlmNode(
				'write',
				{ x: 860, y: 200 },
				{
					tokenDelayMs: 0,
					rolePreset: 'coder',
					enabledToolIds: WRITE_STAGE_TOOL_IDS,
					maxIterations: 4,
					scriptedToolTurns: [
						{
							toolCalls: [
								{
									name: 'edit',
									arguments: {
										path: 'src/greet.ts',
										oldString: "return 'Hello, world!';",
										newString:
											"return 'Hello, Langflower!';",
									},
								},
							],
						},
						{
							text: 'Write: updated src/greet.ts. Ready for bash stage.',
						},
					],
				},
				'Write (no bash)',
			),
			hitlReviewGateNode(
				'bash-gate',
				{ x: 1140, y: 220 },
				'Bash handoff',
			),
			fakeLlmNode(
				'bash',
				{ x: 1420, y: 200 },
				{
					tokenDelayMs: 0,
					rolePreset: 'coder',
					maxIterations: 4,
					scriptedToolTurns: [
						{
							toolCalls: [
								{
									name: 'bash',
									arguments: {
										command: 'echo staged-ops-ok',
									},
								},
							],
						},
						{
							text: 'Bash: verified greet file contents. Done.',
						},
					],
				},
				'Bash (Coder)',
			),
			finishNode('done', { x: 1700, y: 240 }, 'Finish'),
		],
		[
			edge('e-goal-explore', 'goal', 'message', 'explore', 'userPrompt'),
			edge(
				'e-explore-write-gate',
				'explore',
				'response',
				'write-gate',
				'result',
			),
			edge(
				'e-write-gate-explore-feedback',
				'write-gate',
				'feedback',
				'explore',
				'feedback',
			),
			edge(
				'e-write-gate-write',
				'write-gate',
				'response',
				'write',
				'userPrompt',
			),
			edge(
				'e-write-bash-gate',
				'write',
				'response',
				'bash-gate',
				'result',
			),
			edge(
				'e-bash-gate-write-feedback',
				'bash-gate',
				'feedback',
				'write',
				'feedback',
			),
			edge(
				'e-bash-gate-bash',
				'bash-gate',
				'response',
				'bash',
				'userPrompt',
			),
			edge('e-bash-done', 'bash', 'response', 'done', 'value'),
		],
	);
};

/**
 * Epic 21 Partial — coding-agent full pipeline (CI fake path).
 * ChatInput → Planner ⇄ AskUser + RedTeam + PlanGate → Coder ⇄ QA +
 * Principles HITL (common-review stand-in) → ResultGate → Finish.
 * Planner/Coder feedback fan-in via common-merge (feedback ports are not multi).
 * Demo real-LLM graph: demo-project/.../coding-agent.json (common-review).
 * @see execute-coding-agent.ws.test.ts
 */
export const codingAgentWorkflow = (): WorkflowSavePayload => {
	return savePayload(
		'coding-agent',
		scenarioMetadata(
			'Coding agent',
			'Full multi-loop S1–S7 topology (Fake LLM CI path)',
		),
		[
			chatInputNode('goal', { x: 40, y: 280 }, 'Goal'),
			fakeLlmNode(
				'planner',
				{ x: 300, y: 200 },
				{
					tokenDelayMs: 0,
					rolePreset: 'plan',
					maxIterations: 4,
					// HITL clarify / plan-gate / result-gate only — not Fake
					// Soft↔Hard with red-team (scripted Attack would storm).
					maxFeedbackTurns: 4,
					// Short script — avoid imitate-mode multi-paragraph streams in CI.
					scriptedToolTurns: [
						{
							text: 'Clarify: which file should we change? Draft plan: edit src/greet.ts return value.',
						},
					],
				},
				'Planner',
			),
			hitlReviewGateNode('ask', { x: 560, y: 40 }, 'Clarify'),
			fakeLlmNode(
				'red-team',
				{ x: 560, y: 280 },
				{
					tokenDelayMs: 0,
					rolePreset: 'custom',
					maxIterations: 2,
					maxFeedbackTurns: 0,
					scriptedToolTurns: [
						{
							text: 'Final: Attack — missing tests; narrow scope to src/greet.ts only.',
						},
					],
				},
				'Planner Red Team',
			),
			hitlReviewGateNode('plan-gate', { x: 560, y: 520 }, 'Plan Accept'),
			mergeNode(
				'planner-feedback',
				{ x: 300, y: 480 },
				'Planner feedback',
			),
			fakeLlmNode(
				'coder',
				{ x: 860, y: 200 },
				{
					tokenDelayMs: 0,
					rolePreset: 'coder',
					maxIterations: 4,
					// Review HITL feedback only — not Fake QA Soft↔Hard
					// (scripted PASS would storm on every coder revise).
					maxFeedbackTurns: 2,
					scriptedToolTurns: [
						{
							toolCalls: [
								{
									// write (not edit) so QA→Coder feedback re-run stays idempotent
									name: 'write',
									arguments: {
										path: 'src/greet.ts',
										content: [
											'export const greet = (): string => {',
											"\treturn 'Hello, Langflower!';",
											'};',
											'',
										].join('\n'),
									},
								},
							],
						},
						{
							text: 'Updated src/greet.ts. Ready for QA / review.',
						},
					],
				},
				'Coder',
			),
			fakeLlmNode(
				'qa',
				{ x: 1120, y: 80 },
				{
					tokenDelayMs: 0,
					rolePreset: 'custom',
					maxIterations: 2,
					maxFeedbackTurns: 0,
					scriptedToolTurns: [
						{
							text: 'Final: PASS — greet tests ok.',
						},
					],
				},
				'QA Agent',
			),
			// HITL stand-in for common-review (demo JSON uses real common-review).
			hitlReviewGateNode(
				'review',
				{ x: 1120, y: 320 },
				'Principles Review',
			),
			mergeNode('coder-feedback', { x: 860, y: 400 }, 'Coder feedback'),
			hitlReviewGateNode(
				'result-gate',
				{ x: 1380, y: 280 },
				'Result HITL',
			),
			finishNode('done', { x: 1620, y: 280 }, 'Finish'),
		],
		[
			edge('e-goal-planner', 'goal', 'message', 'planner', 'userPrompt'),
			edge('e-planner-ask', 'planner', 'response', 'ask', 'result'),
			edge(
				'e-ask-planner-merge',
				'ask',
				'feedback',
				'planner-feedback',
				'value@0',
			),
			edge(
				'e-planner-redteam',
				'planner',
				'response',
				'red-team',
				'userPrompt',
			),
			// Fake CI: do NOT wire red-team.response → planner-feedback.
			// Scripted Attack + planner.revise is an unbounded Soft↔Hard storm
			// that hits maxFeedbackTurns before HITL can finish (debate-loop
			// covers the capped-storm case). Demo coding-agent.json keeps the
			// real Soft↔Hard edge for live LLMs.
			edge(
				'e-planner-plangate',
				'planner',
				'response',
				'plan-gate',
				'result',
			),
			edge(
				'e-plangate-planner-merge',
				'plan-gate',
				'feedback',
				'planner-feedback',
				'value@1',
			),
			edge(
				'e-resultgate-planner-merge',
				'result-gate',
				'feedback',
				'planner-feedback',
				'value@2',
			),
			edge(
				'e-planner-merge-feedback',
				'planner-feedback',
				'value',
				'planner',
				'feedback',
			),
			edge(
				'e-plangate-coder',
				'plan-gate',
				'response',
				'coder',
				'userPrompt',
			),
			edge('e-coder-qa', 'coder', 'response', 'qa', 'userPrompt'),
			// Fake CI: do NOT wire qa.response → coder-feedback (scripted PASS
			// Soft↔Hard storm). Principles HITL feedback still reaches Coder.
			edge('e-qa-review', 'qa', 'response', 'review', 'result'),
			edge(
				'e-review-coder-merge',
				'review',
				'feedback',
				'coder-feedback',
				'value@0',
			),
			edge(
				'e-coder-merge-feedback',
				'coder-feedback',
				'value',
				'coder',
				'feedback',
			),
			edge(
				'e-review-resultgate',
				'review',
				'response',
				'result-gate',
				'result',
			),
			edge(
				'e-resultgate-done',
				'result-gate',
				'response',
				'done',
				'value',
			),
		],
	);
};

/**
 * Epic 13 — Chat Input cold-start + Review Gate feedback multi-turn (ADR-016).
 * @see execute-chat-input.ws.test.ts
 */
export const chatInputMultiTurnWorkflow = (): WorkflowSavePayload => {
	return savePayload(
		'chat-input-multi-turn',
		scenarioMetadata(
			'Chat Input multi-turn',
			'Chat Input → Fake LLM → Review Gate feedback loop',
		),
		[
			chatInputNode('chat', { x: 40, y: 200 }, 'Chat Input'),
			fakeLlmNode(
				'llm',
				{ x: 300, y: 200 },
				{ tokenDelayMs: 0 },
				'Agent',
			),
			hitlReviewGateNode('ask', { x: 560, y: 200 }, 'Review'),
			previewNode('preview', { x: 800, y: 200 }, 'Preview'),
		],
		[
			edge('e-chat-llm', 'chat', 'message', 'llm', 'userPrompt'),
			edge('e-llm-ask', 'llm', 'response', 'ask', 'result'),
			edge('e-ask-feedback', 'ask', 'feedback', 'llm', 'feedback'),
			edge('e-llm-preview', 'llm', 'response', 'preview', 'text'),
		],
	);
};

/**
 * Epic 22 Partial — research fan-out synth + conflict HITL (CI fake path).
 * Axes → Loop → Explorer → merge Preview → Fake synth → HITL conflict → Finish.
 * Demo real-LLM graph: demo-project/.../research-fanout.json (common-review).
 * S4 selective re-run deferred; S5 crawl stays related-only (crawl-research).
 * @see execute-research-fanout.ws.test.ts
 */
export const researchFanoutWorkflow = (): WorkflowSavePayload => {
	return savePayload(
		'research-fanout',
		scenarioMetadata(
			'Research fan-out',
			'Axes → Loop → Explorer → merge → synth → conflict HITL → Finish',
		),
		[
			stringNode(
				'axes',
				[
					'Vendor docs claim',
					'Community reports',
					'Internal wiki',
				].join('\n'),
				{ x: 40, y: 200 },
				'Research axes',
			),
			loopNode('loop', { x: 280, y: 200 }, 'Loop'),
			fakeLlmNode(
				'explorer',
				{ x: 520, y: 200 },
				{
					tokenDelayMs: 0,
					rolePreset: 'explorer',
					maxIterations: 2,
				},
				'Explorer body',
			),
			previewNode('packets', { x: 780, y: 60 }, 'Merged packets'),
			fakeLlmNode(
				'synth',
				{ x: 780, y: 240 },
				{
					tokenDelayMs: 0,
					rolePreset: 'custom',
					maxIterations: 2,
					maxFeedbackTurns: 1,
					scriptedToolTurns: [
						{
							text: 'Reconciled brief: axes agree on scope; conflict flagged on vendor vs community claims. Final: brief ready for conflict gate.',
						},
					],
				},
				'Synthesizer',
			),
			// HITL stand-in for common-review (demo JSON uses real common-review).
			hitlReviewGateNode(
				'conflict',
				{ x: 1060, y: 240 },
				'Conflict HITL',
			),
			finishNode('done', { x: 1320, y: 260 }, 'Done'),
		],
		[
			edge('e-axes-loop', 'axes', 'value', 'loop', 'items'),
			edge('e-loop-item', 'loop', 'item', 'explorer', 'userPrompt'),
			edge(
				'e-explorer-body',
				'explorer',
				'response',
				'loop',
				'bodyResult',
			),
			edge('e-loop-preview', 'loop', 'results', 'packets', 'text'),
			edge('e-loop-synth', 'loop', 'results', 'synth', 'userPrompt'),
			edge('e-synth-conflict', 'synth', 'response', 'conflict', 'result'),
			edge(
				'e-conflict-synth-feedback',
				'conflict',
				'feedback',
				'synth',
				'feedback',
			),
			edge('e-conflict-done', 'conflict', 'response', 'done', 'value'),
		],
	);
};

/**
 * ADR-021 L0 — agent swarm: main Fake LLM spawns Sub-Agent via registration /
 * spawn / subagentResult; Sub-Agent runs in-node chat (scripted in CI).
 * @see execute-agent-swarm.ws.test.ts
 */
export const agentSwarmWorkflow = (): WorkflowSavePayload => {
	return savePayload(
		'agent-swarm',
		scenarioMetadata(
			'Agent swarm',
			'Main spawns Sub-Agent via registration ports (in-node chat)',
		),
		[
			stringNode(
				'brief',
				'Scout the repo and report one finding.',
				{ x: 40, y: 200 },
				'Brief',
			),
			fakeLlmNode(
				'main',
				{ x: 280, y: 180 },
				{
					tokenDelayMs: 0,
					rolePreset: 'custom',
					maxIterations: 4,
					scriptedToolTurns: [
						{
							toolCalls: [
								{
									name: 'spawn_subagent',
									arguments: {
										nodeId: 'explorer',
										skillId: '',
										task: 'Scout and report one finding.',
									},
								},
							],
						},
						{ text: 'Swarm done: explorer reported.' },
					],
				},
				'Main',
			),
			subAgentNode('explorer', { x: 560, y: 40 }, 'Explorer Sub-Agent', {
				name: 'Explorer',
				description: 'Maps the repo',
				rolePreset: 'explorer',
				maxIterations: 2,
				scriptedToolTurns: [
					{
						text: 'Explorer finding: one notable path under packages/.',
					},
				],
			}),
			previewNode('out', { x: 560, y: 320 }, 'Main response'),
		],
		[
			edge('e-brief', 'brief', 'value', 'main', 'userPrompt'),
			edge(
				'e-reg',
				'explorer',
				'registration',
				'main',
				'subagentRegistration',
			),
			edge('e-spawn', 'main', 'subagent', 'explorer', 'task'),
			edge('e-result', 'explorer', 'result', 'main', 'subagentResult'),
			edge('e-out', 'main', 'response', 'out', 'text'),
		],
	);
};
