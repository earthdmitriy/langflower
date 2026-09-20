import type {
	combineStatefulObservables,
	StatefulConnection,
	StatefulObservable,
} from '@rx-evo/stateful-observable';
import type {
	CapsFor,
	LlmRequiredCapabilityId,
	NodeCapabilityId,
} from './capabilities.js';
import type { ResolveSecret } from './resolve-secret.js';
import type { CtxError } from './ctx-error.js';
import {
	configureOutput,
	InputConfig,
	makeInput,
	OutputConfig,
} from './io-helpers.js';
import type { PortMeta, WireType } from './port-meta.js';
import type {
	AssertConstUISchema,
	ParamsFromUISchema,
	UISchemaConstItem,
} from './ui-schema-inference.js';

type ExecutionContextHostFields<
	UI extends readonly UISchemaConstItem[] = readonly UISchemaConstItem[],
> = {
	readonly projectDir: string;
	readonly runId: string;
	readonly nodeId: string;
	readonly params: ParamsFromUISchema<UI>;
	readonly uiSchema: UI;
	readonly resolveSecret: ResolveSecret;
};

/**
 * Identity + panel + keyed secret lookup. Host I/O (files/kb/crawl/…) is
 * owned by specialized common-nodes internally — not part of the author
 * ExecutionContext API. Declared capabilities arrive via {@link CapsFor}
 * (`requires` on the definition). {@link resolveSecret} looks up one id
 * (`lf_secret:ID` / `env:ID`); authors cannot list the bag.
 * Do not restore `amendInput` or other host-mutation / I/O fields here —
 * keyed by `assertExecutionContextHostKeys` below.
 */
export type ExecutionContext<
	UI extends readonly UISchemaConstItem[] = readonly UISchemaConstItem[],
	Caps extends object = Record<string, never>,
> = ExecutionContextHostFields<UI> & Caps;

type ExecutionContextHostKey =
	'projectDir' | 'runId' | 'nodeId' | 'params' | 'uiSchema' | 'resolveSecret';

type AssertExecutionContextHostKeys =
	keyof ExecutionContextHostFields extends ExecutionContextHostKey
		? ExecutionContextHostKey extends keyof ExecutionContextHostFields
			? true
			: never
		: never;

const assertExecutionContextHostKeys: AssertExecutionContextHostKeys = true;
void assertExecutionContextHostKeys;

/** Caps for {@link defineLlmNode} — LLM set from {@link CapsFor}. */
export type LlmExecutionCaps = CapsFor<readonly LlmRequiredCapabilityId[]>;

type ReactiveNodeBindResult = {
	readonly inputs: InputConfig[];
	readonly outputs: OutputConfig[];
};

/** Author-time config passed to {@link defineReactiveNode}. */
export type DefinedReactiveNodeConfig<
	UI extends readonly UISchemaConstItem[] = readonly UISchemaConstItem[],
	Caps extends object = Record<string, never>,
> = {
	/**
	 * Stable catalog / persisted workflow id (`WorkflowNodePersisted.type`).
	 * Server resolves the definition with
	 * `resolveDefinition({ type, params })` and keys the common-nodes
	 * catalog by `type`.
	 */
	readonly type: string;
	/**
	 * Human label for the palette list / drag preview (sorted
	 * case-sensitively within a category). Not used as a registry key.
	 */
	readonly displayName: string;
	/**
	 * Palette Level-2 group. UI treats missing as `'Other'`. When
	 * {@link paletteSecondary} is true, this is the **subcategory under
	 * Advanced**, not a top-level primary group.
	 */
	readonly category?: string;
	/**
	 * When `true`, palette projection moves the node into the collapsed
	 * **Advanced** Level-2 group (subgrouped by {@link category}); otherwise
	 * it stays under the primary {@link category} list. Omitted/`false` →
	 * primary. See ADR-023.
	 */
	readonly paletteSecondary?: boolean;
	/**
	 * Optional markdown for the palette detail popover and inspector.
	 * Omitted → no description block. Copied onto the definition /
	 * `PaletteNodeDefinition` when set. Write user-facing use cases, not
	 * author internals.
	 */
	readonly description?: string;
	/**
	 * Canvas box used when the node has no persisted width: the editor locks
	 * both axes instead of auto-sizing, so payload cannot grow the node.
	 * Omitted → canvas auto-sizes. Persisted operator resize always wins.
	 */
	readonly defaultCanvasSize?: {
		readonly width: number;
		readonly height: number;
	};
	/**
	 * When `true`, the first work-log frame from this node **closes the
	 * previous visit**, so a delegating node gets its own feed card instead of
	 * continuing the caller's. Omitted/`false` → frames follow the normal
	 * `feed.streaming` visit rules. Used by `common-sub-agent`.
	 */
	readonly feedVisitBoundary?: boolean;
	/**
	 * When `true` on the live instance, the first **value** emission on any
	 * watched output schedules `RuntimeRunner.finishRun` (`done` → `idle`).
	 * Factory default when omitted: `false`. Finish/sink nodes set this.
	 */
	readonly stopsRun?: boolean;
	/**
	 * Author/test contract: at most one output value per input activation
	 * (e.g. constant, delay). Copied onto the definition and instance;
	 * **runtime does not enforce** it (`RuntimeNode.emitOncePerActivation`).
	 * Factory default when omitted: `false` (`defineNode` defaults to `true`).
	 */
	readonly emitOncePerActivation?: boolean;
	/**
	 * When `true` on the live instance, weakly connected clusters containing
	 * this node are **excluded** from `RuntimeRunner.start()`; start them via
	 * `pushIntoInput` (feed composer / HITL). Factory default when omitted:
	 * `false`. Used by `common-chat-input`.
	 */
	readonly chatEntry?: boolean;
	/**
	 * Host capabilities this node needs. Copied onto
	 * {@link ReactiveNodeDefinition.requires} (default `[]`). `bind` sees
	 * {@link CapsFor} fields as non-optional.
	 */
	readonly requires?: readonly NodeCapabilityId[];
	/**
	 * Router bypass base port id → wire type. Runtime materializes each key
	 * as a multi-input base; channel outputs (`ch`, `ch@1`, …) are slot views
	 * over that base (`bypass-ports.ts`). Empty object when omitted.
	 */
	readonly bypassPorts?: Record<string, WireType>;
	/**
	 * Inspector / panel field schema. Pass `as const` so
	 * `ExecutionContext.params` infers from field names. Also attached to the
	 * run-time context (`build-execution-context` copies definition
	 * `uiSchema`). Port inline editors are separate (`makeInput` `inline`).
	 */
	readonly uiSchema: AssertConstUISchema<UI>;
	/**
	 * Declares live ports. Called twice: once on a discarded probe context
	 * (metas for palette / validation) and again inside `getInstance()` for
	 * each canvas node. Keep free of module-level I/O / shared mutable state.
	 */
	readonly bind: (
		ctx: StatefulObservable<ExecutionContext<UI, Caps>, CtxError, PortMeta>,
		helpers: {
			readonly makeInput: typeof makeInput;
			readonly configureOutput: typeof configureOutput;
			readonly combineInputs: typeof combineStatefulObservables;
		},
	) => ReactiveNodeBindResult;
};

/**
 * Live instance from {@link ReactiveNodeDefinition.getInstance}.
 * Structurally assignable to runtime `RuntimeNode` (minus `nodeId` /
 * `bypassConnections`, which the editor materializes).
 */
export type ReactiveNodeInstance<
	UI extends readonly UISchemaConstItem[] = readonly UISchemaConstItem[],
	Caps extends object = Record<string, never>,
> = {
	readonly inputs: Record<
		string | symbol,
		StatefulConnection<unknown, unknown, PortMeta>
	>;
	readonly outputs: Record<
		string | symbol,
		StatefulObservable<unknown, unknown, PortMeta>
	>;
	readonly bypassPorts: Record<string, WireType>;
	readonly stopsRun?: boolean;
	readonly chatEntry?: boolean;
	readonly feedVisitBoundary?: boolean;
	readonly emitOncePerActivation?: boolean;
	readonly ctxConnection: StatefulConnection<
		ExecutionContext<UI, Caps>,
		CtxError,
		PortMeta
	>;
};
