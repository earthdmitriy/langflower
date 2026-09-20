import {
	parseLlmRolePreset,
	resolveEffectiveSkillId,
	resolveEffectiveToolPermissions,
} from '@langflower/common-nodes/ai/llm-role-preset';
import type { LlmRunHostServices } from '@langflower/common-nodes/ai/llm-run-host';
import { attachRunHostServices } from '@langflower/common-nodes/run-host-services';
import type { LangflowerBusRequest } from '@langflower/common-nodes/run-host-services';
import {
	contextSymbol,
	createResolveSecret,
	isNodeCapabilityId,
	type CtxError,
	type ExecutionContext,
	type NodeCapabilityId,
	type ReactiveNodeDefinition,
	type ToolHandle,
	type UISchemaConstItem,
} from '@langflower/node-sdk';
import type { RuntimeSeedPortValue } from '@langflower/runtime';
import { parseDefaultChatModel } from '@langflower/shared/langflower-config/parse-default-chat-model.js';
import type {
	LangflowerConfig,
	RunnerAskUserAskPayload,
	RunnerPermissionAskPayload,
	RunnerPermissionReplyPayload,
} from '@langflower/shared/types/langflower-config.js';
import type { WorkflowNodePersisted } from '@langflower/shared/types/langflower-workflow.js';
import {
	collectEnabledMcpIdsFromNodes,
	createSystemMcpHandles,
	filterMcpFailuresForNode,
	filterSystemMcpToolsByServerIds,
	parseEnabledMcpIds,
	type SystemMcpServerTools,
} from '@langflower/tools/create-system-mcp-handles';
import {
	createProjectHarness,
	wrapBuiltinToolHandles,
	type AskUserRequest,
	type Harness,
} from '@langflower/tools/create-project-harness';
import { createWebFetch } from '@langflower/tools/create-web-fetch';
import {
	mergeProjectAndNodePermissions,
	type PermissionAskRequest,
	type PermissionDecision,
} from '@langflower/tools/permission';
import { throwError } from 'rxjs';
import { bindCreateChatCompletionStream } from './bind-llm-context.js';
import { bindCreateEmbedding } from './bind-embed-context.js';
import { readAgentsMarkdown } from '../skills/read-agents-markdown.js';
import { readSkillMarkdown } from '../skills/read-skill-markdown.js';
import type { ServerContext } from '../server-context.js';
import type { LangflowerSession } from '../session/langflower-session.js';

type ExecutionContextDeps = Pick<
	ServerContext,
	'projectDir' | 'resolveDefinition' | 'langflowerConfigService'
>;

type BuildHarnessHooks = {
	readonly runId: string;
	readonly nodeId: string;
	readonly requestPermission: LangflowerSession['permissionAsks']['requestPermission'];
	readonly emitPermissionAsk: (payload: RunnerPermissionAskPayload) => void;
	readonly emitPermissionAccepted: (
		payload: RunnerPermissionReplyPayload,
	) => void;
	readonly requestAskUser: LangflowerSession['askUserAsks']['requestAskUser'];
	readonly emitAskUserAsk: (payload: RunnerAskUserAskPayload) => void;
	readonly requestLangflowerBus?: LangflowerBusRequest;
	readonly getLiveWiredTools?: (agentNodeId: string) => readonly ToolHandle[];
};

type CapsResult =
	| { readonly ok: true; readonly fields: Record<string, unknown> }
	| { readonly ok: false; readonly error: CtxError };

type NodeToolHandles = ReturnType<typeof buildNodeToolHandles>;

type ExecutionContextRunMemo = {
	chat?: ReturnType<typeof bindCreateChatCompletionStream>;
	embed?: ReturnType<typeof bindCreateEmbedding>;
	readonly skillMarkdown: Map<string, string>;
	readonly nodeTools: Map<string, NodeToolHandles>;
	agentsMarkdown: string;
	agentsMarkdownLoaded: boolean;
};

const createExecutionContextRunMemo = (): ExecutionContextRunMemo => ({
	skillMarkdown: new Map(),
	nodeTools: new Map(),
	agentsMarkdown: '',
	agentsMarkdownLoaded: false,
});

type RunScope = {
	readonly projectDir: string;
	readonly runId: string;
	readonly config: LangflowerConfig;
	readonly secrets: Readonly<Record<string, string>>;
	readonly hooks?: BuildHarnessHooks;
	readonly runMcpHandles: readonly SystemMcpServerTools[];
	readonly langflowerConfigService: ExecutionContextDeps['langflowerConfigService'];
	readonly memo: ExecutionContextRunMemo;
};

const CAPABILITY_REMEDIES: Readonly<Record<NodeCapabilityId, string>> = {
	chat: 'Bind a chat-completion factory on the run host.',
	embed: 'Bind an embedding factory on the run host.',
	tools: 'Start the run through a Langflower server session that can build tool handles.',
	paths: 'Provide harness path policy from project config.',
	hosts: 'Provide harness host policy from project config.',
	secrets: 'Load project secrets on the run host.',
	promptContext: 'Load skill / AGENTS.md context on the run host.',
	permissionAsk:
		'Start the run through a Langflower server session (permission HITL).',
	liveTools:
		'Start the run through a Langflower server session that exposes live wired tools.',
	editorBus:
		'Start the run through a Langflower server session (Langflower Tools / editor bus).',
	authorize:
		'Start the run through a Langflower server session that can authorize tool calls.',
};

const unboundCapabilityError = (
	nodeId: string,
	capability: string,
): CtxError => ({
	message: `Node "${nodeId}" requires capability "${capability}" which is not bound. ${
		isNodeCapabilityId(capability)
			? CAPABILITY_REMEDIES[capability]
			: 'Declare a known capability id on the node definition.'
	}`,
});

const unbound = (nodeId: string, capability: string): CapsResult => ({
	ok: false,
	error: unboundCapabilityError(nodeId, capability),
});

const createToolHarness = (options: {
	readonly projectRoot: string;
	readonly config: LangflowerConfig;
	readonly permission: ReturnType<typeof mergeProjectAndNodePermissions>;
	readonly requestPermission?: (
		request: PermissionAskRequest,
		signal?: AbortSignal,
	) => Promise<PermissionDecision>;
	readonly askUser?: (request: AskUserRequest) => Promise<string>;
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
		...(options.askUser !== undefined ? { askUser: options.askUser } : {}),
	});
};

const nodePermission = (
	run: RunScope,
	node: Pick<WorkflowNodePersisted, 'params'>,
) => {
	const rolePreset = parseLlmRolePreset(node.params.rolePreset);
	const toolPermissions = resolveEffectiveToolPermissions(
		rolePreset,
		node.params.toolPermissions,
	);
	return mergeProjectAndNodePermissions(
		run.config.permission,
		toolPermissions,
	);
};

const buildNodeHarness = (
	run: RunScope,
	node: Pick<WorkflowNodePersisted, 'id' | 'params'>,
) => {
	const permission = nodePermission(run, node);
	const hooks = run.hooks;

	return hooks === undefined
		? createToolHarness({
				projectRoot: run.projectDir,
				config: run.config,
				permission,
			})
		: createToolHarness({
				projectRoot: run.projectDir,
				config: run.config,
				permission,
				requestPermission: (request, signal) =>
					hooks.requestPermission(
						hooks.runId,
						hooks.nodeId,
						request,
						hooks.emitPermissionAsk,
						hooks.emitPermissionAccepted,
						signal,
					),
				askUser: (request) =>
					hooks.requestAskUser(
						hooks.runId,
						hooks.nodeId,
						request,
						hooks.emitAskUserAsk,
					),
			});
};

const buildNodeToolHandles = (
	run: RunScope,
	node: Pick<WorkflowNodePersisted, 'id' | 'params'>,
): {
	readonly toolHandles: readonly ToolHandle[];
	readonly authorize?: Harness['authorize'];
} => {
	const permission = nodePermission(run, node);
	const toolHarness = buildNodeHarness(run, node);
	const webFetch = createWebFetch({
		...(run.config.harness?.allowedHosts !== undefined
			? { allowedHosts: run.config.harness.allowedHosts }
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
	const builtinHandles = wrapBuiltinToolHandles(harness, permission);
	const mcpTools = filterSystemMcpToolsByServerIds(
		run.runMcpHandles,
		parseEnabledMcpIds(node.params.enabledMcpIds),
	).flatMap((entry) => entry.tools);

	return {
		toolHandles: [...builtinHandles, ...mcpTools],
		...(toolHarness.authorize !== undefined
			? { authorize: toolHarness.authorize }
			: {}),
	};
};

const nodeToolHandles = (
	run: RunScope,
	node: Pick<WorkflowNodePersisted, 'id' | 'type' | 'params'>,
): NodeToolHandles => {
	const cached = run.memo.nodeTools.get(node.id);
	if (cached !== undefined) {
		return cached;
	}
	const built = buildNodeToolHandles(run, node);
	run.memo.nodeTools.set(node.id, built);
	return built;
};

const loadSkillMarkdown = async (
	run: RunScope,
	node: Pick<WorkflowNodePersisted, 'params'>,
): Promise<string> => {
	const rolePreset = parseLlmRolePreset(node.params.rolePreset);
	const skillId = resolveEffectiveSkillId(rolePreset, node.params.skillId);
	if (skillId === '') {
		return '';
	}
	const cached = run.memo.skillMarkdown.get(skillId);
	if (cached !== undefined) {
		return cached;
	}
	const text = await readSkillMarkdown(run.projectDir, skillId);
	run.memo.skillMarkdown.set(skillId, text);
	return text;
};

const loadAgentsMarkdown = async (
	run: RunScope,
	node: Pick<WorkflowNodePersisted, 'params'>,
): Promise<string> => {
	if (node.params.includeAgentsMd !== true) {
		return '';
	}
	if (run.memo.agentsMarkdownLoaded) {
		return run.memo.agentsMarkdown;
	}
	const text = await readAgentsMarkdown(run.projectDir);
	run.memo.agentsMarkdown = text;
	run.memo.agentsMarkdownLoaded = true;
	return text;
};

const CAPABILITY_PROVIDERS: {
	readonly [Id in NodeCapabilityId]: (
		run: RunScope,
		node: Pick<WorkflowNodePersisted, 'id' | 'type' | 'params'>,
	) => CapsResult | Promise<CapsResult>;
} = {
	chat: (run) => {
		run.memo.chat ??= bindCreateChatCompletionStream(
			run.langflowerConfigService,
		);
		return { ok: true, fields: { chat: run.memo.chat } };
	},
	embed: (run) => {
		run.memo.embed ??= bindCreateEmbedding(run.langflowerConfigService);
		const defaultEmbedding = parseDefaultChatModel(run.config.embedding);
		return {
			ok: true,
			fields: {
				embed: run.memo.embed,
				...(defaultEmbedding !== null ? { defaultEmbedding } : {}),
			},
		};
	},
	tools: (run, node) => {
		const built = nodeToolHandles(run, node);
		return {
			ok: true,
			fields: { toolHandles: built.toolHandles },
		};
	},
	paths: (run) => ({
		ok: true,
		fields: { denyPaths: run.config.harness?.denyPaths ?? [] },
	}),
	hosts: (run) => ({
		ok: true,
		fields: { allowedHosts: run.config.harness?.allowedHosts ?? [] },
	}),
	secrets: (run) => ({
		ok: true,
		fields: { secrets: run.secrets },
	}),
	promptContext: async (run, node) => {
		const skillMarkdown = await loadSkillMarkdown(run, node);
		const agentsMarkdown = await loadAgentsMarkdown(run, node);
		const defaultChat = parseDefaultChatModel(run.config.model);
		return {
			ok: true,
			fields: {
				skillMarkdown,
				agentsMarkdown,
				...(defaultChat !== null ? { defaultChat } : {}),
			},
		};
	},
	permissionAsk: (run, node) => {
		const hooks = run.hooks;
		if (hooks === undefined) {
			return unbound(node.id, 'permissionAsk');
		}
		return {
			ok: true,
			fields: {
				requestPermission: (request: PermissionAskRequest) =>
					hooks.requestPermission(
						hooks.runId,
						hooks.nodeId,
						request,
						hooks.emitPermissionAsk,
						hooks.emitPermissionAccepted,
					),
			},
		};
	},
	liveTools: (run, node) => {
		const getLiveWiredTools = run.hooks?.getLiveWiredTools;
		if (getLiveWiredTools === undefined) {
			return unbound(node.id, 'liveTools');
		}
		return { ok: true, fields: { getLiveWiredTools } };
	},
	editorBus: (run, node) => {
		const requestLangflowerBus = run.hooks?.requestLangflowerBus;
		if (requestLangflowerBus === undefined) {
			return unbound(node.id, 'editorBus');
		}
		return { ok: true, fields: { requestLangflowerBus } };
	},
	authorize: (run, node) => {
		const built = nodeToolHandles(run, node);
		if (built.authorize === undefined) {
			return unbound(node.id, 'authorize');
		}
		return { ok: true, fields: { authorize: built.authorize } };
	},
};

const capsFor = async (
	definition: ReactiveNodeDefinition | undefined,
	run: RunScope,
	node: Pick<WorkflowNodePersisted, 'id' | 'type' | 'params'>,
): Promise<CapsResult> => {
	const requested = definition?.requires ?? [];
	const fields: Record<string, unknown> = {};

	for (const id of requested) {
		if (!isNodeCapabilityId(id)) {
			return unbound(node.id, id);
		}
		const result = await CAPABILITY_PROVIDERS[id](run, node);
		if (!result.ok) {
			return result;
		}
		Object.assign(fields, result.fields);
	}

	return { ok: true, fields };
};

const bagFromCapFields = (
	fields: Record<string, unknown>,
): LlmRunHostServices => {
	const skillMarkdown =
		typeof fields['skillMarkdown'] === 'string'
			? fields['skillMarkdown']
			: undefined;
	const agentsMarkdown =
		typeof fields['agentsMarkdown'] === 'string'
			? fields['agentsMarkdown']
			: undefined;

	return {
		...(typeof fields['chat'] === 'function'
			? {
					createChatCompletionStream: fields[
						'chat'
					] as LlmRunHostServices['createChatCompletionStream'],
				}
			: {}),
		...(typeof fields['embed'] === 'function'
			? {
					createEmbedding: fields[
						'embed'
					] as LlmRunHostServices['createEmbedding'],
				}
			: {}),
		...(fields['defaultEmbedding'] !== undefined
			? {
					defaultEmbedding: fields[
						'defaultEmbedding'
					] as LlmRunHostServices['defaultEmbedding'],
				}
			: {}),
		...(skillMarkdown !== undefined && skillMarkdown.length > 0
			? { skillMarkdown }
			: {}),
		...(agentsMarkdown !== undefined && agentsMarkdown.length > 0
			? { agentsMarkdown }
			: {}),
		...(fields['defaultChat'] !== undefined
			? {
					defaultChat: fields[
						'defaultChat'
					] as LlmRunHostServices['defaultChat'],
				}
			: {}),
		...(fields['secrets'] !== undefined
			? {
					secrets: fields['secrets'] as LlmRunHostServices['secrets'],
				}
			: {}),
		...(typeof fields['authorize'] === 'function'
			? {
					authorize: fields[
						'authorize'
					] as LlmRunHostServices['authorize'],
				}
			: {}),
		...(typeof fields['requestPermission'] === 'function'
			? {
					requestPermission: fields[
						'requestPermission'
					] as LlmRunHostServices['requestPermission'],
				}
			: {}),
		...(fields['denyPaths'] !== undefined
			? {
					denyPaths: fields[
						'denyPaths'
					] as LlmRunHostServices['denyPaths'],
				}
			: {}),
		...(fields['allowedHosts'] !== undefined
			? {
					allowedHosts: fields[
						'allowedHosts'
					] as LlmRunHostServices['allowedHosts'],
				}
			: {}),
		...(typeof fields['requestLangflowerBus'] === 'function'
			? {
					requestLangflowerBus: fields[
						'requestLangflowerBus'
					] as LlmRunHostServices['requestLangflowerBus'],
				}
			: {}),
		...(typeof fields['getLiveWiredTools'] === 'function'
			? {
					getLiveWiredTools: fields[
						'getLiveWiredTools'
					] as LlmRunHostServices['getLiveWiredTools'],
				}
			: {}),
	} as LlmRunHostServices;
};

const attachCapFields = (
	base: ExecutionContext<readonly UISchemaConstItem[], object>,
	fields: Record<string, unknown>,
): ExecutionContext<readonly UISchemaConstItem[], object> => {
	const { secrets, ...enumerable } = fields;
	const ctx = { ...base, ...enumerable } as ExecutionContext<
		readonly UISchemaConstItem[],
		object
	>;
	if (secrets !== undefined) {
		Object.defineProperty(ctx, 'secrets', {
			value: secrets,
			enumerable: false,
			writable: false,
			configurable: false,
		});
	}
	return attachRunHostServices(ctx, bagFromCapFields(fields));
};

export const buildExecutionContext = async (
	context: ExecutionContextDeps,
	runId: string,
	node: Pick<WorkflowNodePersisted, 'id' | 'type' | 'params'>,
	hooks?: BuildHarnessHooks,
	preloadedConfig?: LangflowerConfig,
	runMcpHandles?: readonly SystemMcpServerTools[],
	preloadedSecrets?: Readonly<Record<string, string>>,
	runMemo?: ExecutionContextRunMemo,
): Promise<ExecutionContext<readonly UISchemaConstItem[], object>> => {
	const config =
		preloadedConfig ?? (await context.langflowerConfigService.read());
	const secrets =
		preloadedSecrets ??
		(await context.langflowerConfigService.readSecrets());
	const memo = runMemo ?? createExecutionContextRunMemo();
	const definition = context.resolveDefinition(node);
	const run: RunScope = {
		projectDir: context.projectDir,
		runId,
		config,
		secrets,
		runMcpHandles: runMcpHandles ?? [],
		langflowerConfigService: context.langflowerConfigService,
		memo,
		...(hooks !== undefined ? { hooks } : {}),
	};

	const resolved = await capsFor(definition, run, node);
	if (!resolved.ok) {
		throw resolved.error;
	}

	const uiSchema =
		definition?.uiSchema ?? ([] as readonly UISchemaConstItem[]);
	const toolHandles = resolved.fields['toolHandles'];
	const base: ExecutionContext<readonly UISchemaConstItem[], object> = {
		projectDir: context.projectDir,
		runId,
		nodeId: node.id,
		params: node.params,
		uiSchema,
		resolveSecret: createResolveSecret({ secrets }),
		...(Array.isArray(toolHandles) ? { toolHandles } : {}),
	};

	return attachCapFields(base, resolved.fields);
};

const ctxErrorFromFailures = (
	failures: ReturnType<typeof filterMcpFailuresForNode>,
): CtxError => ({
	message: failures.map((failure) => failure.message).join('\n'),
});

export const buildContextSeeds = async (
	session: LangflowerSession,
	context: ExecutionContextDeps,
	runId: string,
	emitPermissionAsk: (payload: RunnerPermissionAskPayload) => void,
	emitAskUserAsk: (payload: RunnerAskUserAskPayload) => void,
	emitPermissionAccepted: (payload: RunnerPermissionReplyPayload) => void,
	requestLangflowerBus?: LangflowerBusRequest,
	getLiveWiredTools?: (agentNodeId: string) => readonly ToolHandle[],
): Promise<Record<string, ReadonlyArray<RuntimeSeedPortValue>>> => {
	const workflow = session.activeWorkflow;

	if (workflow === null) {
		return {};
	}

	const config = await context.langflowerConfigService.read();
	const secrets = await context.langflowerConfigService.readSecrets();
	const memo = createExecutionContextRunMemo();
	const needsTools = workflow.graph.nodes.some((node) =>
		(context.resolveDefinition(node)?.requires ?? []).includes('tools'),
	);
	const enabledMcpIds = needsTools
		? collectEnabledMcpIdsFromNodes(workflow.graph.nodes)
		: [];
	const servers = config.mcp?.servers ?? {};
	const runMcp =
		enabledMcpIds.length > 0 && Object.keys(servers).length > 0
			? await createSystemMcpHandles({
					projectRoot: context.projectDir,
					serverIds: enabledMcpIds,
					servers,
					secrets,
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

		const definition = context.resolveDefinition(node);
		const run: RunScope = {
			projectDir: context.projectDir,
			runId,
			config,
			secrets,
			runMcpHandles: runMcp?.handles ?? [],
			langflowerConfigService: context.langflowerConfigService,
			memo,
			hooks: {
				runId,
				nodeId: node.id,
				requestPermission: session.permissionAsks.requestPermission,
				emitPermissionAsk,
				emitPermissionAccepted,
				requestAskUser: session.askUserAsks.requestAskUser,
				emitAskUserAsk,
				...(requestLangflowerBus !== undefined
					? { requestLangflowerBus }
					: {}),
				...(getLiveWiredTools !== undefined
					? { getLiveWiredTools }
					: {}),
			},
		};

		const resolved = await capsFor(definition, run, node);
		if (!resolved.ok) {
			seeds[node.id] = [
				{
					portId: contextSymbol,
					slotIndex: 0,
					value: throwError(() => resolved.error),
				},
			];
			continue;
		}

		const ctx = await buildExecutionContext(
			context,
			runId,
			node,
			run.hooks,
			config,
			runMcp?.handles,
			secrets,
			memo,
		);
		seeds[node.id] = [
			{
				portId: contextSymbol,
				slotIndex: 0,
				value: ctx,
			},
		];
	}

	return seeds;
};
