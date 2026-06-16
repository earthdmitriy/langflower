import { resolveWorkflowNodeDefinition } from '@langflower/common-nodes';
import { ConfigService } from './config/config.service.js';
import { LangflowerConfigService } from './config/langflower-config.service.js';
import { CustomNodeRegistry } from './palette/custom-node-registry.js';
import { CustomPaletteService } from './palette/custom-palette.service.js';
import { PaletteService } from './palette/palette.service.js';
import type { ResolveNodeDefinition } from './workflow/workflow-document.js';
import { WorkflowService } from './workflow/workflow.service.js';

export type ServerContext = {
	readonly projectDir: string;
	readonly resolveDefinition: ResolveNodeDefinition;
	readonly configService: ConfigService;
	readonly langflowerConfigService: LangflowerConfigService;
	readonly workflowService: WorkflowService;
	readonly paletteService: PaletteService;
	readonly customPaletteService: CustomPaletteService;
	readonly customNodeRegistry: CustomNodeRegistry;
};

export const createServerContext = async (
	projectDir: string,
): Promise<ServerContext> => {
	const customNodeRegistry = new CustomNodeRegistry();

	const resolveDefinition: ResolveNodeDefinition = (node) => {
		const custom = customNodeRegistry.get(node.type);

		if (custom !== undefined) {
			return custom;
		}

		return resolveWorkflowNodeDefinition({
			type: node.type,
		});
	};

	return {
		projectDir,
		resolveDefinition,
		configService: new ConfigService(projectDir),
		langflowerConfigService: new LangflowerConfigService(projectDir),
		workflowService: new WorkflowService(projectDir, resolveDefinition),
		paletteService: new PaletteService(),
		customPaletteService: new CustomPaletteService(customNodeRegistry),
		customNodeRegistry,
	};
};
