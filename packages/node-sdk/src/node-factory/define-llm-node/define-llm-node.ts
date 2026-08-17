import type { combineStatefulObservables } from '@rx-evo/stateful-observable';
import {
	configureOutput,
	defineReactiveNode,
	makeInput,
	type DefinedReactiveNodeConfig,
	type InputConfig,
	type OutputConfig,
} from '../define-reactive-node/define-reactive-node.js';
import type { LlmExecutionCaps } from '../define-reactive-node/types.js';
import type { UISchemaConstItem } from '../define-reactive-node/ui-schema-inference.js';
import {
	defaultLlmInventoryInputs,
	defaultLlmInventoryOutputs,
	LLM_INVENTORY_INPUT_PORT_IDS,
	LLM_INVENTORY_OUTPUT_PORT_IDS,
	type LlmInventoryInputs,
	type LlmInventoryOutputStreams,
} from './default-llm-ports.js';

type ReactiveBindHelpers = {
	readonly makeInput: typeof makeInput;
	readonly configureOutput: typeof configureOutput;
	readonly combineInputs: typeof combineStatefulObservables;
};

type LlmBindResult = {
	readonly inputs: readonly InputConfig[];
	readonly outputs: readonly OutputConfig[];
	readonly inventoryOutputs: LlmInventoryOutputStreams;
};

type LlmCtx<UI extends readonly UISchemaConstItem[]> = Parameters<
	DefinedReactiveNodeConfig<UI, LlmExecutionCaps>['bind']
>[0];

export type { LlmExecutionCaps };

const portIdOf = (config: InputConfig | OutputConfig): string =>
	String(config.meta.portId);

const assertNoInventoryInputs = (inputs: readonly InputConfig[]): void => {
	const inventoryIds = new Set<string>(LLM_INVENTORY_INPUT_PORT_IDS);
	const duplicates = inputs
		.map(portIdOf)
		.filter((portId) => inventoryIds.has(portId));

	if (duplicates.length > 0) {
		throw new Error(
			`defineLlmNode: do not redeclare inventory inputs (${duplicates.join(', ')}); use the inventory argument`,
		);
	}
};

const assertNoInventoryOutputs = (outputs: readonly OutputConfig[]): void => {
	const inventoryIds = new Set<string>(LLM_INVENTORY_OUTPUT_PORT_IDS);
	const duplicates = outputs
		.map(portIdOf)
		.filter((portId) => inventoryIds.has(portId));

	if (duplicates.length > 0) {
		throw new Error(
			`defineLlmNode: do not configure inventory outputs (${duplicates.join(', ')}); return inventoryOutputs streams`,
		);
	}
};

/**
 * Purpose factory atop {@link defineReactiveNode}: every LLM-class node gets
 * the shared inventory / observability ports (`tools`, `steerControl`,
 * `toolLog`, `recovery`). Authors may extend with role ports but cannot omit
 * the inventory set.
 */
export const defineLlmNode = <UI extends readonly UISchemaConstItem[]>(
	config: Omit<DefinedReactiveNodeConfig<UI, LlmExecutionCaps>, 'bind'> & {
		readonly bind: (
			ctx: LlmCtx<UI>,
			helpers: ReactiveBindHelpers,
			inventory: LlmInventoryInputs,
		) => LlmBindResult;
	},
) => {
	const { bind: authorBind, ...rest } = config;

	return defineReactiveNode<UI, LlmExecutionCaps>({
		...rest,
		bind(ctx, helpers) {
			const inventory = defaultLlmInventoryInputs(helpers.makeInput);
			const result = authorBind(ctx, helpers, inventory);

			assertNoInventoryInputs(result.inputs);
			assertNoInventoryOutputs(result.outputs);

			return {
				inputs: [...result.inputs, ...inventory.inputs],
				outputs: [
					...result.outputs,
					...defaultLlmInventoryOutputs(
						helpers.configureOutput,
						result.inventoryOutputs,
					),
				],
			};
		},
	});
};

export {
	LLM_INVENTORY_INPUT_PORT_IDS,
	LLM_INVENTORY_OUTPUT_PORT_IDS,
	type LlmInventoryInputs,
	type LlmInventoryOutputStreams,
} from './default-llm-ports.js';

export {
	STEER_CONTROL_PORT_ID,
	isSteerControlContinue,
	isSteerControlPause,
	isSteerControlPayload,
	type SteerControlPayload,
	type SteerControlPause,
	type SteerControlResume,
	type SteerControlSteer,
} from './steer-control.js';

export {
	RECOVERY_PORT_ID,
	isLlmRecoveryNotice,
	isLlmRecoverySuspended,
	recoveryNoticeText,
	toLlmRecoveryPortValue,
	type LlmRecoveryNotice,
	type LlmRecoveryNoticeCode,
	type LlmRecoveryRetryReason,
} from './recovery-notice.js';
