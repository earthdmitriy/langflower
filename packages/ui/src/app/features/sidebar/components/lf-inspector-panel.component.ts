import { AsyncPipe } from '@angular/common';
import {
	ChangeDetectionStrategy,
	Component,
	computed,
	effect,
	inject,
} from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import type { InlineConfig } from '@langflower/node-sdk';
import type { UISchemaConstItem } from '@langflower/node-sdk/create-typed-ui-schema';
import type { NodeId } from '@langflower/runtime';
import type {
	LangflowerConfig,
	LangflowerProviderModelsCatalog,
	PaletteNodeDefinition,
	ProviderModelEntry,
	WorkflowPersistedGraph,
} from '@langflower/shared/langflower';
import {
	clampToolPermissionForUi,
	isHarnessToolAlwaysDenied,
	mergeToolPermissionsOnNewWires,
	paramsAfterRolePresetApply,
	parseLlmRolePreset,
	resolveEffectiveToolPermissions,
	toolFloorDecisionForUi,
	type ToolPermissionDecision,
} from '@langflower/common-nodes/ai/llm-role-preset';
import {
	defaultChatModelEmptyTitle,
	displayEnabledToolIds,
	mergeProviderModelOptions,
	resolveEnabledToolOptions,
	resolveUiSchemaOptions,
	resolveWiredToolOptions,
} from '@langflower/shared/langflower';
import { combineLatest, map } from 'rxjs';
import { LangflowerBridgeService } from '../../../services/langflower-bridge.service';
import { LangflowerConfigProjectionService } from '../../../services/langflower-config-projection.service';
import { ModelsCatalogProjectionService } from '../../../services/models-catalog-projection.service';
import { SelectedNodeProjectionService } from '../../../services/selected-node-projection.service';
import { WorkflowExecutionService } from '../../../services/workflow-execution.service';
import { LfInlineFieldComponent } from '../../canvas/components/lf-inline-field.component';
import { formatPortValue } from '../format-port-value';
import {
	resolveModelsFieldPresentation,
	type ModelsRefreshState,
} from '../models-field-presentation';
import { withSelectEmptyOption } from '../select-empty-option';
import { numberInlineConfigFromUiSchema } from '../number-inline-config-from-ui-schema';
import {
	buildToolPermissionTableRows,
	LfToolPermissionTableComponent,
	type ToolPermissionTableRow,
} from './lf-tool-permission-table.component';

type InspectorPanelRow = {
	readonly field: string;
	readonly label: string;
	readonly config: InlineConfig;
	readonly value: unknown;
	readonly disabled?: boolean;
	readonly emptyHint?: string;
	readonly fieldError?: string;
	readonly kind?: 'inline' | 'tool-permission-table';
	readonly permissionRows?: readonly ToolPermissionTableRow[];
};

type ModelsCatalogMap = Readonly<
	Record<string, LangflowerProviderModelsCatalog>
>;

type SelectedInspectorNode = NonNullable<
	ReturnType<SelectedNodeProjectionService['selectedNode']>
>;

const WIRED_TOOLS_EMPTY_HINT = 'Wire tool-registration nodes to enable toggles';
const SKILLS_EMPTY_HINT = 'Add skills under .langflower/skills/<id>/SKILL.md';
const PROVIDERS_EMPTY_HINT =
	'Configure providers in .langflower/langflower.jsonc';
const MCP_SERVERS_EMPTY_HINT =
	'Declare MCP servers under mcp.servers in .langflower/langflower.jsonc';
const SELECT_PROVIDER_HINT = 'Select a provider';

/** Non-empty provider id from node params (`""` from skeleton seeds is unset). */
const nonEmptyProviderId = (value: unknown): string | undefined =>
	typeof value === 'string' && value.trim().length > 0 ? value : undefined;

const fetchedModelsFromCatalogs = (
	catalogs: ModelsCatalogMap,
): Readonly<Record<string, readonly ProviderModelEntry[]>> =>
	Object.fromEntries(
		Object.entries(catalogs).map(([providerId, entry]) => [
			providerId,
			entry.models,
		]),
	);

const modelsFieldState = (
	providerId: string,
	catalogs: ModelsCatalogMap,
): ModelsRefreshState | undefined => {
	const entry = catalogs[providerId];

	if (entry === undefined) {
		return undefined;
	}

	return {
		loading: false,
		...(entry.error !== undefined ? { error: entry.error } : {}),
	};
};

/** Resolve panel select/multiselect options for one uiSchema item. */
const resolveInspectorPanelOptions = (
	item: UISchemaConstItem,
	langflowerConfig: LangflowerConfig,
	currentParams: Readonly<Record<string, unknown>>,
	graph: WorkflowPersistedGraph | null,
	nodeId: string | null,
	fetchedModelsByProvider: Readonly<
		Record<string, readonly ProviderModelEntry[]>
	>,
) => {
	if (item.optionsSource === 'node.wiredTools') {
		return graph !== null && nodeId !== null
			? resolveEnabledToolOptions(graph, nodeId)
			: [];
	}

	if (item.optionsSource === 'langflower.models') {
		const providerId = nonEmptyProviderId(
			item.dependsOn !== undefined
				? currentParams[item.dependsOn]
				: undefined,
		);
		const staticIds =
			providerId !== undefined
				? langflowerConfig.provider?.[providerId]?.models
				: undefined;
		const fetched =
			providerId !== undefined
				? fetchedModelsByProvider[providerId]
				: undefined;

		return mergeProviderModelOptions(staticIds, fetched);
	}

	return resolveUiSchemaOptions(langflowerConfig, item, currentParams);
};

type InputPortConfig = PaletteNodeDefinition['inputsConfigs'][number];
type OutputPortConfig = PaletteNodeDefinition['outputsConfigs'][number];

type InputPortRow = {
	readonly portId: string;
	readonly label: string;
	readonly wireType: string;
	readonly hidden: boolean;
	/** `null` when the port has no editable on-node control or is a multi/dynamic slot. */
	readonly inline: InlineConfig | null;
	readonly value: unknown;
};

type OutputPortRow = {
	readonly portId: string;
	readonly label: string;
	readonly wireType: string;
	readonly hidden: boolean;
	readonly cachedValue: unknown;
};

/** Maps a uiSchema field's data `type` to an on-panel `InlineConfig` kind. */
const toInlineConfig = (
	item: UISchemaConstItem,
	langflowerConfig: LangflowerConfig,
	currentParams: Readonly<Record<string, unknown>>,
	graph: WorkflowPersistedGraph | null,
	nodeId: string | null,
	fetchedModelsByProvider: Readonly<
		Record<string, readonly ProviderModelEntry[]>
	>,
	defaultChatEmptyTitle: string | null,
): InlineConfig => {
	const options = resolveInspectorPanelOptions(
		item,
		langflowerConfig,
		currentParams,
		graph,
		nodeId,
		fetchedModelsByProvider,
	);

	switch (item.type) {
		case 'string':
		case 'url':
		case 'file-path':
		case 'phase':
		case 'llm-message':
			return 'text';
		case 'number':
			return numberInlineConfigFromUiSchema(item);
		case 'boolean':
			return 'boolean';
		case 'select':
			return {
				type: 'select',
				options: withSelectEmptyOption(
					item,
					options,
					defaultChatEmptyTitle,
				),
			};
		case 'tool-id-list':
			return {
				type: 'multiselect',
				options,
			};
		default:
			return 'text-multiline';
	}
};

const inputWireType = (config: InputPortConfig): string => {
	if (config.dynamic === true) {
		return 'dynamic';
	}

	return String(config.wireType ?? 'any');
};

const outputWireType = (config: OutputPortConfig): string => {
	if (config.fromInput !== undefined) {
		return `from(${config.fromInput})`;
	}

	return String(config.wireType);
};

const panelUiSchema = (
	definition: PaletteNodeDefinition,
): readonly UISchemaConstItem[] =>
	definition.uiSchema as readonly UISchemaConstItem[];

const buildPanelRows = (
	node: SelectedInspectorNode,
	config: LangflowerConfig,
	graph: WorkflowPersistedGraph | null,
	catalogs: ModelsCatalogMap,
): readonly InspectorPanelRow[] => {
	const fetchedModels = fetchedModelsFromCatalogs(catalogs);

	return panelUiSchema(node.definition)
		.filter((item) => item.placement !== 'inline')
		.map((item) => {
			const options = resolveInspectorPanelOptions(
				item,
				config,
				node.params,
				graph,
				node.id,
				fetchedModels,
			);

			if (item.type === 'tool-permission-table') {
				const rolePreset = parseLlmRolePreset(
					node.params['rolePreset'],
				);
				const toolPermissions = resolveEffectiveToolPermissions(
					rolePreset,
					node.params['toolPermissions'],
					node.params['enabledToolIds'],
				);
				const permissionRows = buildToolPermissionTableRows(
					options,
					toolPermissions,
					config.permission,
				);

				return {
					field: item.field,
					label: item.label ?? item.field,
					config: 'text' as const,
					value: toolPermissions,
					kind: 'tool-permission-table' as const,
					permissionRows,
					...(permissionRows.length === 0
						? {
								emptyHint:
									options.length === 0
										? WIRED_TOOLS_EMPTY_HINT
										: 'All tools are denied by project floor',
							}
						: {}),
				};
			}

			const wiredToolIds = options.map((option) => String(option.value));
			const storedValue = node.params[item.field] ?? item.default;
			const value =
				item.optionsSource === 'node.wiredTools'
					? displayEnabledToolIds(storedValue, wiredToolIds)
					: item.optionsSource === 'langflower.mcpServers'
						? Array.isArray(storedValue)
							? storedValue.map(String)
							: []
						: storedValue;
			const providerId =
				item.optionsSource === 'langflower.models'
					? nonEmptyProviderId(node.params['providerId'])
					: undefined;
			const modelsPresentation =
				item.optionsSource === 'langflower.models'
					? providerId === undefined
						? {
								disabled: false,
								emptyHint: SELECT_PROVIDER_HINT,
							}
						: resolveModelsFieldPresentation(
								options.length,
								modelsFieldState(providerId, catalogs),
							)
					: undefined;

			const catalogEmptyHint =
				options.length === 0
					? item.optionsSource === 'node.wiredTools'
						? WIRED_TOOLS_EMPTY_HINT
						: item.optionsSource === 'langflower.mcpServers'
							? MCP_SERVERS_EMPTY_HINT
							: item.optionsSource === 'langflower.skills'
								? SKILLS_EMPTY_HINT
								: item.optionsSource === 'langflower.providers'
									? PROVIDERS_EMPTY_HINT
									: undefined
					: undefined;

			return {
				field: item.field,
				label: item.label ?? item.field,
				config: toInlineConfig(
					item,
					config,
					node.params,
					graph,
					node.id,
					fetchedModels,
					defaultChatModelEmptyTitle(config.model),
				),
				value,
				...(modelsPresentation !== undefined
					? {
							disabled: modelsPresentation.disabled,
							...(modelsPresentation.fieldError !== undefined
								? {
										fieldError:
											modelsPresentation.fieldError,
									}
								: {}),
							...(modelsPresentation.emptyHint !== undefined
								? {
										emptyHint: modelsPresentation.emptyHint,
									}
								: {}),
						}
					: catalogEmptyHint !== undefined
						? { emptyHint: catalogEmptyHint }
						: {}),
			};
		});
};

@Component({
	selector: 'lf-inspector-panel',
	standalone: true,
	imports: [
		AsyncPipe,
		LfInlineFieldComponent,
		LfToolPermissionTableComponent,
	],
	template: `
		@if (selectedNode(); as node) {
			<div class="flex flex-col gap-4">
				<div>
					<h2
						class="text-sm font-semibold text-zinc-900 dark:text-zinc-100"
					>
						{{ node.ui.label ?? node.definition.displayName }}
					</h2>
					<p
						class="mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-400"
					>
						{{ node.type }} · {{ node.id }}
					</p>
				</div>

				@if (panelRows$ | async; as rows) {
					@if (rows.length > 0) {
						<div class="flex flex-col gap-2">
							@for (row of rows; track row.field) {
								<div class="flex flex-col gap-1">
									<span
										class="text-[10px] font-medium text-zinc-600 dark:text-zinc-300"
									>
										{{ row.label }}
									</span>
									@if (
										row.kind === 'tool-permission-table' &&
										row.permissionRows !== undefined
									) {
										<lf-tool-permission-table
											[rows]="row.permissionRows"
											[disabled]="row.disabled === true"
											(decisionChange)="
												onToolPermissionChange(
													$event.toolId,
													$event.decision
												)
											"
										/>
									} @else {
										<lf-inline-field
											[config]="row.config"
											[value]="row.value"
											[disabled]="row.disabled === true"
											(valueChange)="
												onFieldChange(row.field, $event)
											"
										/>
									}
									@if (row.fieldError !== undefined) {
										<p
											class="text-[10px] text-rose-600 dark:text-rose-400"
										>
											{{ row.fieldError }}
										</p>
									} @else if (row.emptyHint !== undefined) {
										<p
											class="text-[10px] text-zinc-500 dark:text-zinc-400"
										>
											{{ row.emptyHint }}
										</p>
									}
								</div>
							}
						</div>
					}
				}

				<div class="flex flex-col gap-1.5">
					<span
						class="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
					>
						Inputs
					</span>
					@for (row of inputRows(); track row.portId) {
						<div class="flex flex-col gap-1">
							<span
								class="text-[10px] text-zinc-600 dark:text-zinc-300"
							>
								{{ row.label }}
								<span class="text-zinc-400 dark:text-zinc-500"
									>· {{ row.wireType }}</span
								>
								@if (row.hidden) {
									<span
										class="text-zinc-400 dark:text-zinc-500"
										>· hidden</span
									>
								}
							</span>
							@if (row.inline !== null) {
								<lf-inline-field
									[config]="row.inline"
									[value]="row.value"
									(valueChange)="
										onInputChange(row.portId, $event)
									"
								/>
							} @else {
								<pre
									class="lf-scroll max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-zinc-200 bg-zinc-50 p-1.5 text-[11px] leading-4 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400"
									>{{ formatValue(row.value) }}</pre>
							}
						</div>
					} @empty {
						<p class="text-[11px] text-zinc-500 dark:text-zinc-400">
							This node has no input ports.
						</p>
					}
				</div>

				<div class="flex flex-col gap-1.5">
					<span
						class="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
					>
						Outputs (cached)
					</span>
					@for (row of outputRows(); track row.portId) {
						<div class="flex flex-col gap-1">
							<span
								class="text-[10px] text-zinc-600 dark:text-zinc-300"
							>
								{{ row.label }}
								<span class="text-zinc-400 dark:text-zinc-500"
									>· {{ row.wireType }}</span
								>
								@if (row.hidden) {
									<span
										class="text-zinc-400 dark:text-zinc-500"
										>· hidden</span
									>
								}
							</span>
							<pre
								class="lf-scroll max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-zinc-200 bg-zinc-50 p-1.5 text-[11px] leading-4 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400"
								>{{
									row.cachedValue === undefined
										? '—'
										: formatValue(row.cachedValue)
								}}</pre>
						</div>
					} @empty {
						<p class="text-[11px] text-zinc-500 dark:text-zinc-400">
							This node has no output ports.
						</p>
					}
				</div>
			</div>
		} @else {
			<p class="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
				Select a node on the canvas to inspect its details.
			</p>
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LfInspectorPanelComponent {
	private readonly bridge = inject(LangflowerBridgeService);
	private readonly execution = inject(WorkflowExecutionService);
	private readonly configProjection = inject(
		LangflowerConfigProjectionService,
	);
	private readonly modelsCatalogProjection = inject(
		ModelsCatalogProjectionService,
	);
	private readonly selection = inject(SelectedNodeProjectionService);

	readonly selectedNode = this.selection.selectedNode;
	readonly langflowerConfig = this.configProjection.config;
	readonly activeGraph = this.execution.activeGraph;

	/**
	 * Panel param rows from catalogs$ (+ selection / config / graph).
	 * Async pipe waits until the first catalog snapshot; no null handling.
	 */
	readonly panelRows$ = combineLatest({
		catalogs: this.modelsCatalogProjection.catalogs$,
		node: this.selection.selectedNode$,
		config: this.configProjection.config$,
		graph: toObservable(this.activeGraph),
	}).pipe(
		map(({ catalogs, node, config, graph }) =>
			node === null ? [] : buildPanelRows(node, config, graph, catalogs),
		),
	);

	readonly inputRows = computed<readonly InputPortRow[]>(() => {
		const node = this.selectedNode();

		if (node === null) {
			return [];
		}

		return node.definition.inputsConfigs
			.filter(
				(entry): entry is InputPortConfig & { portId: string } =>
					typeof entry.portId === 'string',
			)
			.map((entry) => {
				const portId = entry.portId;
				const value =
					node.inputs[portId] !== undefined
						? node.inputs[portId]
						: entry.defaultValue;

				return {
					portId,
					label: entry.name ?? portId,
					wireType: inputWireType(entry),
					hidden: entry.hidden === true,
					inline:
						entry.multi === undefined
							? (entry.inline ?? null)
							: null,
					value,
				};
			});
	});

	readonly outputRows = computed<readonly OutputPortRow[]>(() => {
		const node = this.selectedNode();

		if (node === null) {
			return [];
		}

		return node.definition.outputsConfigs
			.filter(
				(entry): entry is OutputPortConfig & { portId: string } =>
					entry !== undefined && typeof entry.portId === 'string',
			)
			.map((entry) => {
				const portId = entry.portId;

				return {
					portId,
					label: entry.name ?? portId,
					wireType: outputWireType(entry),
					hidden: entry.hidden === true,
					cachedValue: this.execution.latestOutputValue(
						node.id,
						portId,
					),
				};
			});
	});

	constructor() {
		// Skeleton LLM nodes ship `providerId: ""`. With one configured
		// provider, bind it so Model can resolve against the live catalog
		// (HTML <select> otherwise paints the first label while params stay "").
		effect(() => {
			const node = this.selectedNode();
			const config = this.langflowerConfig();

			if (node === null) {
				return;
			}

			if (nonEmptyProviderId(node.params['providerId']) !== undefined) {
				return;
			}

			const providerIds = Object.keys(config.provider ?? {});

			if (providerIds.length !== 1) {
				return;
			}

			const onlyProviderId = providerIds[0];

			if (onlyProviderId === undefined) {
				return;
			}

			this.bridge.raw['editor.updateNode.requested'].next({
				nodeId: node.id as NodeId,
				params: { ...node.params, providerId: onlyProviderId },
			});
		});

		effect(() => {
			const node = this.selectedNode();
			const graph = this.activeGraph();
			const config = this.langflowerConfig();

			if (node === null || graph === null) {
				return;
			}

			const hasToolPermissionField = panelUiSchema(node.definition).some(
				(item) => item.field === 'toolPermissions',
			);

			if (!hasToolPermissionField) {
				return;
			}

			const rolePreset = parseLlmRolePreset(node.params['rolePreset']);
			const current = resolveEffectiveToolPermissions(
				rolePreset,
				node.params['toolPermissions'],
				node.params['enabledToolIds'],
			);
			const wiredToolIds = resolveWiredToolOptions(graph, node.id)
				.map((option) => String(option.value))
				.filter(
					(toolId) =>
						!isHarnessToolAlwaysDenied(config.permission, toolId),
				);
			const merged = mergeToolPermissionsOnNewWires(
				current,
				wiredToolIds,
			);

			const clamped: Record<string, ToolPermissionDecision> = {};

			for (const [toolId, decision] of Object.entries(merged)) {
				if (isHarnessToolAlwaysDenied(config.permission, toolId)) {
					continue;
				}

				const floor = toolFloorDecisionForUi(config.permission, toolId);
				clamped[toolId] = clampToolPermissionForUi(floor, decision);
			}

			const storedRaw = node.params['toolPermissions'];
			const storedIsObject =
				storedRaw !== null &&
				typeof storedRaw === 'object' &&
				!Array.isArray(storedRaw);
			const hasLegacy = Array.isArray(node.params['enabledToolIds']);
			const stored = storedIsObject
				? (storedRaw as Record<string, unknown>)
				: {};
			const same =
				!hasLegacy &&
				storedIsObject &&
				Object.keys(clamped).length === Object.keys(stored).length &&
				Object.entries(clamped).every(
					([toolId, decision]) => stored[toolId] === decision,
				);

			if (same) {
				return;
			}

			const { enabledToolIds: _legacy, ...rest } = node.params;

			this.bridge.raw['editor.updateNode.requested'].next({
				nodeId: node.id as NodeId,
				params: { ...rest, toolPermissions: clamped },
			});
		});
	}

	readonly formatValue = formatPortValue;

	onToolPermissionChange(
		toolId: string,
		decision: ToolPermissionDecision,
	): void {
		const node = this.selectedNode();

		if (node === null) {
			return;
		}

		const rolePreset = parseLlmRolePreset(node.params['rolePreset']);
		const current = resolveEffectiveToolPermissions(
			rolePreset,
			node.params['toolPermissions'],
			node.params['enabledToolIds'],
		);
		const floor = toolFloorDecisionForUi(
			this.langflowerConfig().permission,
			toolId,
		);
		const nextDecision = clampToolPermissionForUi(floor, decision);
		const { enabledToolIds: _legacy, ...rest } = node.params;

		this.bridge.raw['editor.updateNode.requested'].next({
			nodeId: node.id as NodeId,
			params: {
				...rest,
				toolPermissions: { ...current, [toolId]: nextDecision },
			},
		});
	}

	onFieldChange(field: string, value: unknown): void {
		const node = this.selectedNode();

		if (node === null) {
			return;
		}

		const params =
			field === 'rolePreset'
				? paramsAfterRolePresetApply(
						node.params,
						parseLlmRolePreset(value),
					)
				: { ...node.params, [field]: value };

		this.bridge.raw['editor.updateNode.requested'].next({
			nodeId: node.id as NodeId,
			params,
		});
	}

	onInputChange(portId: string, value: unknown): void {
		const node = this.selectedNode();

		if (node === null) {
			return;
		}

		this.bridge.raw['editor.updateNode.requested'].next({
			nodeId: node.id as NodeId,
			inputs: { ...node.inputs, [portId]: value },
		});
	}
}
