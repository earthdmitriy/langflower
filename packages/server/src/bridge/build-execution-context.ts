import {
	parseLlmRolePreset,
	resolveEffectiveSkillId,
	resolveEffectiveToolPermissions,
	toolPermissionsToEnabledIds,
} from '@langflower/common-nodes/ai/llm-role-preset';
import { attachRunHostServices } from '@langflower/common-nodes/ai/run-host-services';
import {
	contextSymbol,
	type CtxError,
	type ExecutionContext,
} from '@langflower/node-sdk';
import type { LlmExecutionCaps } from '@langflower/node-sdk/llm';
import type { McpHandle } from '@langflower/node-sdk/mcp';
import type { NodeId, RuntimeSeedPortValue } from '@langflower/runtime';
import {
	parseDefaultChatModel,
	type LangflowerConfig,
	type RunnerPermissionAskPayload,
} from '@langflower/shared/langflower.js';
import {
	collectEnabledMcpIdsFromNodes,
	createSystemMcpHandles,
	filterMcpFailuresForNode,
	filterMcpHandlesByIds,
	parseEnabledMcpIds,
} from '@langflower/tools/create-system-mcp-handles';
import {
	createProjectHarness,
	type Harness,
} from '@langflower/tools/create-project-harness';
import { createWebFetch } from '@langflower/tools/create-web-fetch';
import {
	mergeProjectAndNodePermissions,
	type PermissionAskRequest,
	type PermissionDecision,
} from '@langflower/tools/permission';
import { isObservable, throwError, type Observable } from 'rxjs';
import { bindCreateChatCompletionStream } from './bind-llm-context.js';
import { wrapBuiltinToolHandles } from './wrap-builtin-tool-handles.js';
import { readAgentsMarkdown } from '../skills/read-agents-markdown.js';
import { readSkillMarkdown } from '../skills/read-skill-markdown.js';
import type { ServerContext } from '../server-context.js';
import type { LangflowerSession } from '../session/langflower-session.js';

type WorkflowGraphNode = {
	readonly id: string;
	readonly type: string;
	readonly params: Readonly<Record<string, unknown>>;
};

type ExecutionContextDeps = Pick<
	ServerContext,
	'projectDir' | 'resolveDefinition' | 'langflowerConfigService'
>;

type BuildHarnessHooks = {
	readonly runId: string;
	readonly nodeId: string;
	readonly requestPermission: LangflowerSession['permissionAsks']['requestPermission'];
	readonly emitPermissionAsk: (payload: RunnerPermissionAskPayload) => void;
};

const createToolHarness = (options: {
	readonly projectRoot: string;
	readonly config: LangflowerConfig;
	readonly permission: ReturnType<typeof mergeProjectAndNodePermissions>;
	readonly requestPermission?: (
		request: PermissionAskRequest,
	) => Promise<PermissionDecision>;
}) => {
	const hasPermissionRules = Object.keys(options.permission).length > 0;

	return createProjectHarness({
		projectRoot: options.projectRoot,
		bashEnabled: true,
		...(options.config.harness?.denyPaths !== undefined
			? { denyPaths: options.config.harness.denyPaths }
			: {}),
		...(options.config.harness?.allowedRoots !== undefined
			? { allowedRoots: options.config.harness.allowedRoots }
			: {}),
		...(hasPermissionRules ? { permission: options.permission } : {}),
		...(options.requestPermission !== undefined
			? { requestPermission: options.requestPermission }
			: {}),
	});
};

export const buildExecutionContext = async (
	context: ExecutionContextDeps,
	runId: string,
	node: WorkflowGraphNode,
	hooks?: BuildHarnessHooks,
	preloadedConfig?: LangflowerConfig,
	runMcpHandles?: readonly McpHandle[],
): Promise<ExecutionContext<never, LlmExecutionCaps>> => {
	const rolePreset = parseLlmRolePreset(node.params.rolePreset);
	const skillId = resolveEffectiveSkillId(rolePreset, node.params.skillId);
	const skillMarkdown =
		skillId === ''
			? ''
			: await readSkillMarkdown(context.projectDir, skillId);
	const agentsMarkdown =
		node.params.includeAgentsMd === true
			? await readAgentsMarkdown(context.projectDir)
			: '';
	const config =
		preloadedConfig ?? (await context.langflowerConfigService.read());
	const toolPermissions = resolveEffectiveToolPermissions(
		rolePreset,
		node.params.toolPermissions,
		node.params.enabledToolIds,
	);
	const permission = mergeProjectAndNodePermissions(
		config.permission,
		toolPermissions,
	);

	const toolHarness =
		hooks === undefined
			? createToolHarness({
					projectRoot: context.projectDir,
					config,
					permission,
				})
			: createToolHarness({
					projectRoot: context.projectDir,
					config,
					permission,
					requestPermission: (request) =>
						hooks.requestPermission(
							hooks.runId,
							hooks.nodeId,
							request,
							hooks.emitPermissionAsk,
						),
				});

	const webFetch = createWebFetch({
		...(config.harness?.allowedHosts !== undefined
			? { allowedHosts: config.harness.allowedHosts }
			: {}),
	});

	const harness: Harness = {
		invoke: toolHarness.invoke,
		listBuiltinRegistrations: toolHarness.listBuiltinRegistrations,
		...(toolHarness.authorize !== undefined
			? { authorize: toolHarness.authorize }
			: {}),
		webFetch,
	};

	const enabledToolIds = toolPermissionsToEnabledIds(toolPermissions);
	const toolHandles = wrapBuiltinToolHandles(
		harness,
		enabledToolIds,
		permission,
	);

	const mcpHandles = filterMcpHandlesByIds(
		runMcpHandles ?? [],
		parseEnabledMcpIds(node.params.enabledMcpIds),
	);

	const base: ExecutionContext<never, LlmExecutionCaps> = {
		projectDir: context.projectDir,
		runId,
		nodeId: node.id,
		params: node.params,
		uiSchema: (context.resolveDefinition({
			type: node.type,
			params: node.params,
		})?.uiSchema ?? []) as unknown as ExecutionContext<
			never,
			LlmExecutionCaps
		>['uiSchema'],
		...(toolHandles.length > 0 ? { toolHandles } : {}),
		...(mcpHandles.length > 0 ? { mcpHandles } : {}),
	};

	const defaultChat = parseDefaultChatModel(config.model);

	return attachRunHostServices(base, {
		...(node.type !== 'common-fake-llm'
			? {
					createChatCompletionStream: bindCreateChatCompletionStream(
						context.langflowerConfigService,
					),
				}
			: {}),
		...(defaultChat !== null ? { defaultChat } : {}),
		...(skillMarkdown.length > 0 ? { skillMarkdown } : {}),
		...(agentsMarkdown.length > 0 ? { agentsMarkdown } : {}),
		...(toolHarness.authorize !== undefined
			? { authorize: toolHarness.authorize }
			: {}),
		...(hooks !== undefined
			? {
					requestPermission: (request) =>
						hooks.requestPermission(
							hooks.runId,
							hooks.nodeId,
							request,
							hooks.emitPermissionAsk,
						),
				}
			: {}),
		...(config.harness?.denyPaths !== undefined
			? { denyPaths: config.harness.denyPaths }
			: {}),
		...(config.harness?.allowedHosts !== undefined
			? { allowedHosts: config.harness.allowedHosts }
			: {}),
	});
};

const ctxErrorFromFailures = (
	failures: ReturnType<typeof filterMcpFailuresForNode>,
): CtxError => ({
	message: failures.map((failure) => failure.message).join('\n'),
});

/**
 * Context seeds whose `value` is an Observable (e.g. `throwError` → CtxError)
 * must be `connect`ed directly. Runner `applySeeds` wraps with `of(value)`,
 * which would put the Observable in value$ instead of error$.
 */
export const applyObservableContextSeeds = (
	session: LangflowerSession,
	seeds: Readonly<Record<string, ReadonlyArray<RuntimeSeedPortValue>>>,
): Record<string, ReadonlyArray<RuntimeSeedPortValue>> => {
	const valueSeeds: Record<string, RuntimeSeedPortValue[]> = {};

	for (const [nodeId, list] of Object.entries(seeds)) {
		const kept: RuntimeSeedPortValue[] = [];

		for (const seed of list) {
			if (seed.portId === contextSymbol && isObservable(seed.value)) {
				const node = session.runtime.editor.getNode(nodeId as NodeId);
				const connection =
					node === false ? undefined : node.inputs[contextSymbol];

				if (connection !== undefined) {
					connection.connect(seed.value as Observable<never>);
				}

				continue;
			}

			kept.push(seed);
		}

		if (kept.length > 0) {
			valueSeeds[nodeId] = kept;
		}
	}

	return valueSeeds;
};

export const buildContextSeeds = async (
	session: LangflowerSession,
	context: ExecutionContextDeps,
	runId: string,
	emitPermissionAsk: (payload: RunnerPermissionAskPayload) => void,
): Promise<Record<string, ReadonlyArray<RuntimeSeedPortValue>>> => {
	const workflow = session.activeWorkflow;

	if (workflow === null) {
		return {};
	}

	const config = await context.langflowerConfigService.read();
	const enabledMcpIds = collectEnabledMcpIdsFromNodes(workflow.graph.nodes);
	const servers = config.mcp?.servers ?? {};
	const runMcp =
		enabledMcpIds.length > 0 && Object.keys(servers).length > 0
			? await createSystemMcpHandles({
					projectRoot: context.projectDir,
					serverIds: enabledMcpIds,
					servers,
				})
			: undefined;

	session.setMcpDispose(
		runMcp !== undefined ? () => runMcp.close() : undefined,
	);

	const failures = runMcp?.failures ?? [];
	const seeds: Record<string, ReadonlyArray<RuntimeSeedPortValue>> = {};

	for (const node of workflow.graph.nodes) {
		const enabled = parseEnabledMcpIds(node.params.enabledMcpIds);
		const nodeFailures = filterMcpFailuresForNode(failures, enabled);

		if (nodeFailures.length > 0) {
			const error = ctxErrorFromFailures(nodeFailures);
			seeds[node.id] = [
				{
					portId: contextSymbol,
					slotIndex: 0,
					value: throwError(() => error),
				},
			];
			continue;
		}

		const ctx = await buildExecutionContext(
			context,
			runId,
			node,
			{
				runId,
				nodeId: node.id,
				requestPermission: session.permissionAsks.requestPermission,
				emitPermissionAsk,
			},
			config,
			runMcp?.handles,
		);

		seeds[node.id] = [{ portId: contextSymbol, slotIndex: 0, value: ctx }];
	}

	return seeds;
};
