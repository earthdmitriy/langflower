import {
	combineStatefulObservables,
	StatefulConnection,
	statefulConnection,
	StatefulObservable,
} from '@rx-evo/stateful-observable';
import { configureOutput, InputPortMeta, makeInput } from './io-helpers.js';
import type { CtxError } from './ctx-error.js';
import type { PortMeta, WireType } from './port-meta.js';
import type {
	DefinedReactiveNodeConfig,
	ExecutionContext,
	ReactiveNodeInstance,
} from './types.js';
import type { UISchemaConstItem } from './ui-schema-inference.js';

export type { CtxError } from './ctx-error.js';
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

export const contextSymbol = Symbol('node context');

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
	Caps extends object = Record<string, never>,
>(
	config: DefinedReactiveNodeConfig<UI, Caps>,
) => {
	const {
		bypassPorts,
		type,
		category,
		paletteSecondary,
		icon,
		displayName,
		description,
		uiSchema,
		emitOncePerActivation,
		stopsRun,
		chatEntry,
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

	const res = {
		type,
		displayName,
		category,
		icon,
		...(description !== undefined ? { description } : {}),
		...(paletteSecondary === true
			? { paletteSecondary: true as const }
			: {}),
		emitOncePerActivation: emitOncePerActivation ?? false,
		stopsRun: stopsRun ?? false,
		chatEntry: chatEntry ?? false,
		uiSchema,
		bypassPorts: bypassPorts ?? ({} as Record<string, WireType>),
		inputsConfigs: [contextConfig, ...inputsConfigs.map((x) => x.meta)],
		outputsConfigs: outputsConfigs.map((x) => x.meta),
		getInstance: (): ReactiveNodeInstance<UI, Caps> => {
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
				bypassPorts: bypassPorts ?? ({} as Record<string, WireType>),
				inputs,
				outputs,
			};
		},
	} as const satisfies Record<string, unknown>;

	return res;
};

export type ReactiveNodeDefinition = ReturnType<typeof defineReactiveNode>;

export {
	createResolveSecret,
	emptyResolveSecret,
	type CreateResolveSecretDeps,
	type ResolveSecret,
	type ResolveSecretResult,
} from './resolve-secret.js';
export { defineToolRegistrations } from '../define-tool-registrations/define-tool-registrations.js';
export { defineNode } from '../define-node/define-node.js';
export type {
	DefineNodeConfig,
	DefineNodePortMeta,
} from '../define-node/define-node.js';
