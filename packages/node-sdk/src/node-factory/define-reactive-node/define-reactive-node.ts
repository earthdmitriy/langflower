import {
	combineStatefulObservables,
	StatefulConnection,
	statefulConnection,
	StatefulObservable,
} from '@rx-evo/stateful-observable';
import {
	configureOutput,
	InputPortMeta,
	makeInput,
	type OutputPortMeta,
} from './io-helpers.js';
import type { CapsFor, NodeCapabilityId } from './capabilities.js';
import type { CtxError } from './ctx-error.js';
import type { PortMeta, WireType } from './port-meta.js';
import type {
	DefinedReactiveNodeConfig,
	ExecutionContext,
	ReactiveNodeInstance,
} from './types.js';
import type { UISchemaConstItem } from './ui-schema-inference.js';

export type { CtxError } from './ctx-error.js';
export {
	LLM_REQUIRED_CAPABILITIES,
	NODE_CAPABILITY_IDS,
	isNodeCapabilityId,
	uniqueCapabilityIds,
	type CapabilityAuthorize,
	type CapabilityChat,
	type CapabilityEditorBus,
	type CapabilityEmbed,
	type CapabilityFields,
	type CapabilityPermissionAsk,
	type CapsFor,
	type LlmRequiredCapabilityId,
	type NodeCapabilityId,
} from './capabilities.js';
export type {
	HitlButtonControl,
	HitlControl,
	HitlFileControl,
	HitlFileValue,
	HitlInputConfig,
	HitlPayloadTemplate,
	HitlTextareaControl,
	HitlTextValue,
	HitlUploadedFile,
} from './hitl-config.js';
export {
	withLoading,
	configureOutput,
	DEFAULT_MULTILINE_MIN_HEIGHT_PX,
	InlineConfig,
	InlineMarkdownConfig,
	InlineSelectOption,
	InlineTextMultilineConfig,
	InputConfig,
	InputParams,
	InputPortMeta,
	makeInput,
	OutputConfig,
	OutputParams,
	OutputPortMeta,
	resolveMultilineInlineLayout,
	ResolvedMultilineInlineLayout,
} from './io-helpers.js';
export type { FeedPortMeta, FeedRole } from './io-helpers.js';
export type {
	InputPortMode,
	MetaFromStatefulObservable,
	PortMeta,
	WireType,
} from './port-meta.js';
export type {
	ToolHandle,
	ToolHandler,
	ToolHandlerContext,
} from '../define-tool-registrations/tool-handle.js';
export { TOOL_HANDLE_WIRE_TYPE } from '../define-tool-registrations/tool-handle.js';
export type {
	EmbedHandle,
	EmbedTextRole,
	EmbedTextsOptions,
} from '../define-embed/embed-handle.js';
export {
	EMBED_HANDLE_WIRE_TYPE,
	isEmbedHandle,
} from '../define-embed/embed-handle.js';
export type {
	DefinedReactiveNodeConfig,
	ExecutionContext,
	ReactiveNodeInstance,
} from './types.js';
export type { UISchemaConstItem } from './ui-schema-inference.js';

export const contextSymbol = Symbol.for('langflower.node.context');

const bindHelpers = {
	makeInput,
	configureOutput,
	combineInputs: combineStatefulObservables,
};

/**
 * Define a reactive node: probe `bind()` once for port metas (discarded
 * graph), then {@link ReactiveNodeDefinition.getInstance} calls `bind()`
 * again for each live runtime graph. Keep `bind` free of module-level side
 * effects — probe wiring is never used at run time.
 */
export const defineReactiveNode = <
	UI extends readonly UISchemaConstItem[],
	const Requires extends readonly NodeCapabilityId[] = [],
	Caps extends object = CapsFor<Requires>,
>(
	config: DefinedReactiveNodeConfig<UI, Caps> & {
		readonly requires?: Requires;
	},
): ReactiveNodeDefinition => {
	const {
		bypassPorts,
		type,
		category,
		paletteSecondary,
		displayName,
		description,
		defaultCanvasSize,
		feedVisitBoundary,
		uiSchema,
		emitOncePerActivation,
		stopsRun,
		chatEntry,
		requires,
	} = config;

	const probeCtx = statefulConnection<
		ExecutionContext<UI, Caps>,
		CtxError,
		PortMeta
	>();
	const { inputs: inputsConfigs, outputs: outputsConfigs } = config.bind(
		probeCtx,
		bindHelpers,
	);

	const contextConfig: InputPortMeta<ExecutionContext<UI, Caps>> = {
		portId: contextSymbol,
		dir: 'in',
		name: 'context',
		hidden: true,
		wireType: contextSymbol,
		mode: 'single',
	};

	const res: ReactiveNodeDefinition = {
		type,
		displayName,
		...(category !== undefined ? { category } : {}),
		...(description !== undefined ? { description } : {}),
		...(paletteSecondary === true
			? { paletteSecondary: true as const }
			: {}),
		...(defaultCanvasSize !== undefined ? { defaultCanvasSize } : {}),
		...(feedVisitBoundary === true
			? { feedVisitBoundary: true as const }
			: {}),
		emitOncePerActivation: emitOncePerActivation ?? false,
		stopsRun: stopsRun ?? false,
		chatEntry: chatEntry ?? false,
		requires: requires ?? [],
		uiSchema,
		bypassPorts: bypassPorts ?? ({} as Record<string, WireType>),
		inputsConfigs: [contextConfig, ...inputsConfigs.map((x) => x.meta)],
		outputsConfigs: outputsConfigs.map((x) => x.meta),
		getInstance: (): ReactiveNodeInstance<
			readonly UISchemaConstItem[],
			object
		> => {
			const ctxConnection = statefulConnection<
				ExecutionContext<UI, Caps>,
				CtxError,
				PortMeta
			>({
				meta: {
					dir: 'in',
					portId: contextSymbol,
					wireType: contextSymbol,
					mode: 'single',
				},
			});

			const { inputs: instanceInputs, outputs: instanceOutputs } =
				config.bind(ctxConnection, bindHelpers);

			const inputs = instanceInputs.reduce(
				(acc, curr) => ((acc[curr.meta.portId] = curr), acc),
				{ [contextSymbol]: ctxConnection } as Record<
					string | symbol,
					StatefulConnection<unknown, unknown, PortMeta>
				>,
			);

			const outputs = instanceOutputs.reduce(
				(acc, curr) => ((acc[curr.meta.portId] = curr), acc),
				{} as Record<
					string | symbol,
					StatefulObservable<unknown, unknown, PortMeta>
				>,
			);

			return {
				ctxConnection,
				emitOncePerActivation: emitOncePerActivation ?? false,
				stopsRun: stopsRun ?? false,
				chatEntry: chatEntry ?? false,
				...(feedVisitBoundary === true
					? { feedVisitBoundary: true as const }
					: {}),
				bypassPorts: bypassPorts ?? ({} as Record<string, WireType>),
				inputs,
				outputs,
			} as ReactiveNodeInstance<readonly UISchemaConstItem[], object>;
		},
	};

	return res;
};

export type ReactiveNodeDefinition = {
	readonly type: string;
	readonly displayName: string;
	readonly category?: string;
	readonly description?: string;
	readonly paletteSecondary?: true;
	/** Canvas box for a node without persisted width (see config docs). */
	readonly defaultCanvasSize?: {
		readonly width: number;
		readonly height: number;
	};
	/** First work-log frame closes the previous visit (see config docs). */
	readonly feedVisitBoundary?: true;
	readonly emitOncePerActivation: boolean;
	readonly stopsRun: boolean;
	readonly chatEntry: boolean;
	readonly requires: readonly NodeCapabilityId[];
	readonly uiSchema: readonly UISchemaConstItem[];
	readonly bypassPorts: Record<string, WireType>;
	readonly inputsConfigs: readonly InputPortMeta<unknown>[];
	readonly outputsConfigs: readonly OutputPortMeta[];
	readonly getInstance: () => ReactiveNodeInstance<
		readonly UISchemaConstItem[],
		object
	>;
};

export {
	createResolveSecret,
	emptyResolveSecret,
	type CreateResolveSecretDeps,
	type ResolveSecret,
	type ResolveSecretResult,
} from './resolve-secret.js';
export {
	defineToolRegistrations,
	toToolHandles,
} from '../define-tool-registrations/define-tool-registrations.js';
export { defineNode } from '../define-node/define-node.js';
export type {
	DefineNodeConfig,
	DefineNodePortMeta,
} from '../define-node/define-node.js';
