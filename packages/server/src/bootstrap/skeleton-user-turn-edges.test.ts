import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../../..',
);

const workflowDirs = [
	path.join(repoRoot, 'packages/server/skeleton/workflows'),
	path.join(repoRoot, 'demo-project/.langflower/workflows'),
] as const;

type WorkflowNode = {
	readonly id: string;
	readonly type: string;
};

type WorkflowEdge = {
	readonly edgeId: string;
	readonly fromNodeId: string;
	readonly fromPort: readonly [string, number];
	readonly toPort: readonly [string, number];
};

type WorkflowFile = {
	readonly filePath: string;
	readonly nodes: readonly WorkflowNode[];
	readonly edges: readonly WorkflowEdge[];
};

const loadWorkflows = async (): Promise<readonly WorkflowFile[]> => {
	const files: WorkflowFile[] = [];

	for (const dir of workflowDirs) {
		const names = (await fs.readdir(dir)).filter((name) =>
			name.endsWith('.json'),
		);

		for (const name of names) {
			const filePath = path.join(dir, name);
			const document = JSON.parse(
				await fs.readFile(filePath, 'utf8'),
			) as {
				graph: {
					nodes: readonly WorkflowNode[];
					edges: readonly WorkflowEdge[];
				};
			};
			files.push({
				filePath,
				nodes: document.graph.nodes,
				edges: document.graph.edges,
			});
		}
	}

	return files;
};

const nodeType = (workflow: WorkflowFile, nodeId: string): string | undefined =>
	workflow.nodes.find((node) => node.id === nodeId)?.type;

const sourceLabel = (filePath: string): string => {
	const rootName = filePath.includes(`${path.sep}skeleton${path.sep}`)
		? 'skeleton'
		: 'demo';
	return `${rootName}/${path.basename(filePath)}`;
};

describe('skeleton and demo user-turn edges', () => {
	it('wires Chat Input message to userPrompt and string fan-out from text', async () => {
		const workflows = await loadWorkflows();
		const chatToPrompt: string[] = [];
		const chatTextEdges: string[] = [];
		const chatLoopTargets: string[] = [];
		const reviewTargets: string[] = [];

		for (const workflow of workflows) {
			for (const edge of workflow.edges) {
				const type = nodeType(workflow, edge.fromNodeId);
				const label = `${sourceLabel(workflow.filePath)} ${edge.edgeId}`;

				if (type !== 'common-chat-input') {
					if (
						type === 'common-chat-loop' &&
						edge.fromPort[0] === 'feedback'
					) {
						chatLoopTargets.push(label);
						expect(edge.toPort[0]).toBe('feedback');
					}

					if (
						type === 'common-hitl-review-gate' &&
						edge.fromPort[0] === 'feedback'
					) {
						if (edge.toPort[0] === 'feedback') {
							reviewTargets.push(label);
						}
					}
					continue;
				}

				if (edge.fromPort[0] === 'message') {
					expect(edge.toPort[0]).toBe('userPrompt');
					chatToPrompt.push(label);
					continue;
				}

				expect(edge.fromPort[0]).toBe('text');
				expect(edge.toPort[0]).not.toBe('userPrompt');
				chatTextEdges.push(`${label} -> ${edge.toPort[0]}`);
			}
		}

		expect(chatToPrompt.length).toBeGreaterThan(0);
		expect(chatTextEdges.sort()).toEqual([
			'demo/agents-dialog.json e-chat-critique-assignment -> assignment',
			'demo/checks.json e-goal-plan-review -> task',
			'demo/coding-workflow.json e-goal-redteam-assignment -> assignment',
			'demo/red-team.json e-goal-redteam-assignment -> assignment',
			'skeleton/agents-dialog.json e-chat-critique-assignment -> assignment',
			'skeleton/kb-rag.json e-chat-search -> query',
		]);
		expect(chatLoopTargets.length).toBeGreaterThan(0);
		expect(reviewTargets.length).toBeGreaterThan(0);
	});
});
