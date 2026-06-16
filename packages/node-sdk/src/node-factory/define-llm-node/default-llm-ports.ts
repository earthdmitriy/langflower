import type { PortMeta } from '../define-reactive-node/port-meta.js';
import type { StatefulObservable } from '@rx-evo/stateful-observable';
import type { McpHandle } from '../define-mcp/mcp-handle.js';
import { MCP_HANDLE_WIRE_TYPE } from '../define-mcp/mcp-handle.js';
import type { ToolHandle } from '../define-tool-registrations/tool-handle.js';
import { TOOL_HANDLE_WIRE_TYPE } from '../define-tool-registrations/tool-handle.js';
import type {
	configureOutput,
	InputConfig,
	makeInput,
	OutputConfig,
} from '../define-reactive-node/io-helpers.js';
import {
	SUBAGENT_REGISTRATION_WIRE_TYPE,
	SUBAGENT_RESULT_WIRE_TYPE,
	SUBAGENT_SPAWN_WIRE_TYPE,
} from './llm-inventory-wire.js';
import {
	STEER_CONTROL_PORT_ID,
	type SteerControlPayload,
} from './steer-control.js';
import type { LlmRecoveryNotice } from './recovery-notice.js';
import { RECOVERY_PORT_ID } from './recovery-notice.js';

/** Port ids that every LLM-class node must expose (inventory + observability). */
export const LLM_INVENTORY_INPUT_PORT_IDS = [
	'tools',
	'mcp',
	'subagentRegistration',
	'subagentResult',
	STEER_CONTROL_PORT_ID,
] as const;

export const LLM_INVENTORY_OUTPUT_PORT_IDS = [
	'toolLog',
	'recovery',
	'subagent',
] as const;

export type LlmInventoryInputs = {
	readonly tools: InputConfig;
	readonly mcp: InputConfig;
	readonly subagentRegistration: InputConfig;
	readonly subagentResult: InputConfig;
	/** Soft Pause / Steer (ADR-032) — hidden + HITL textarea. */
	readonly steerControl: InputConfig;
	/** Ordered list for `inputs: [...]` spreads. */
	readonly inputs: readonly InputConfig[];
};

export type LlmInventoryOutputStreams = {
	readonly toolLog$: StatefulObservable<
		string,
		unknown,
		PortMeta | undefined
	>;
	readonly recovery$: StatefulObservable<
		LlmRecoveryNotice,
		unknown,
		PortMeta | undefined
	>;
	readonly subagent$: StatefulObservable<
		unknown,
		unknown,
		PortMeta | undefined
	>;
};

/**
 * Create the shared LLM inventory inputs. Authors may extend with role ports
 * but must not omit these.
 */
export const defaultLlmInventoryInputs = (
	make: typeof makeInput,
): LlmInventoryInputs => {
	const tools = make<readonly ToolHandle[]>('tools', {
		name: 'tools',
		wireType: TOOL_HANDLE_WIRE_TYPE,
		multi: 'combine',
		defaultValue: [],
	});
	const mcp = make<readonly McpHandle[]>('mcp', {
		name: 'mcp',
		wireType: MCP_HANDLE_WIRE_TYPE,
		multi: 'combine',
		defaultValue: [],
	});
	const subagentRegistration = make<readonly unknown[]>(
		'subagentRegistration',
		{
			name: 'subagentRegistration',
			wireType: SUBAGENT_REGISTRATION_WIRE_TYPE,
			multi: 'combine',
			defaultValue: [],
		},
	);
	const subagentResult = make<unknown>('subagentResult', {
		name: 'subagentResult',
		wireType: SUBAGENT_RESULT_WIRE_TYPE,
		multi: 'merge',
		defaultValue: null,
		// Protocol payload from Sub-Agent — omit from work log.
		feed: { role: 'none' },
	});
	const steerControl = make<SteerControlPayload>(STEER_CONTROL_PORT_ID, {
		name: 'Steer',
		wireType: 'any',
		hidden: true,
		// Must stay `single` (default): `RuntimeRunner.pushIntoInput` rejects
		// `multi: 'merge'` — ADR-032 Pause/Steer would never reach the tool loop.
		// No defaultValue — `null` breaks StatefulObservable `isSuccess`
		// (`null.state` throw) once the tool loop subscribes to value$.
		hitl: {
			title: 'Steer',
			kind: 'textarea',
			submitLabel: 'Send',
			placeholder: 'Correction for this agent turn…',
		},
	});

	return {
		tools,
		mcp,
		subagentRegistration,
		subagentResult,
		steerControl,
		inputs: [
			tools,
			mcp,
			subagentRegistration,
			subagentResult,
			steerControl,
		],
	};
};

/**
 * Configure the shared LLM inventory outputs (`toolLog`, `recovery`, `subagent`).
 */
export const defaultLlmInventoryOutputs = (
	configure: typeof configureOutput,
	streams: LlmInventoryOutputStreams,
): readonly OutputConfig[] => [
	configure('toolLog', streams.toolLog$, {
		wireType: 'string',
		feed: { role: 'tool', streaming: true },
	}),
	configure(RECOVERY_PORT_ID, streams.recovery$, {
		wireType: 'any',
		hidden: true,
		feed: { role: 'recovery', streaming: true },
	}),
	configure('subagent', streams.subagent$, {
		wireType: SUBAGENT_SPAWN_WIRE_TYPE,
	}),
];
