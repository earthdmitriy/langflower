import type { HitlUploadedFile } from '../define-reactive-node/hitl-config.js';
import type { PortMeta } from '../define-reactive-node/port-meta.js';
import type { StatefulObservable } from '@rx-evo/stateful-observable';
import type { ToolHandle } from '../define-tool-registrations/tool-handle.js';
import { TOOL_HANDLE_WIRE_TYPE } from '../define-tool-registrations/tool-handle.js';
import type {
	configureOutput,
	InputConfig,
	makeInput,
	OutputConfig,
} from '../define-reactive-node/io-helpers.js';
import {
	STEER_CONTROL_PORT_ID,
	type SteerControlPayload,
} from './steer-control.js';
import type { LlmRecoveryNotice } from './recovery-notice.js';
import { RECOVERY_PORT_ID } from './recovery-notice.js';

/** Port ids that every LLM-class node must expose (inventory + observability). */
export const LLM_INVENTORY_INPUT_PORT_IDS = [
	'tools',
	STEER_CONTROL_PORT_ID,
] as const;

export const LLM_INVENTORY_OUTPUT_PORT_IDS = ['toolLog', 'recovery'] as const;

/**
 * `toolLog` port value. A string is the text line. When a tool call staged
 * files (`read` of an image, or an `ask_user` reply with attachments), the
 * same line rides on `text` and the refs ride on `files`.
 */
export type ToolLogFeedValue =
	| string
	| {
			readonly text: string;
			readonly files: readonly HitlUploadedFile[];
	  };

export type LlmInventoryInputs = {
	readonly tools: InputConfig;
	/** Soft Pause / Steer (ADR-032) — hidden + HITL textarea. */
	readonly steerControl: InputConfig;
	/** Ordered list for `inputs: [...]` spreads. */
	readonly inputs: readonly InputConfig[];
};

export type LlmInventoryOutputStreams = {
	readonly toolLog$: StatefulObservable<
		ToolLogFeedValue,
		unknown,
		PortMeta | undefined
	>;
	readonly recovery$: StatefulObservable<
		LlmRecoveryNotice,
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
		description:
			'Tools this agent may call. Wire any number of tool nodes, MCP servers, skills or Sub-Agents here; all connected tools are offered to the model together.',
		wireType: TOOL_HANDLE_WIRE_TYPE,
		multi: 'combine',
		defaultValue: [],
	});
	const steerControl = make<SteerControlPayload>(STEER_CONTROL_PORT_ID, {
		name: 'steer',
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
		steerControl,
		inputs: [tools, steerControl],
	};
};

/**
 * Configure the shared LLM inventory outputs (`toolLog`, `recovery`).
 */
export const defaultLlmInventoryOutputs = (
	configure: typeof configureOutput,
	streams: LlmInventoryOutputStreams,
): readonly OutputConfig[] => [
	configure('toolLog', streams.toolLog$, {
		description:
			'Log of tool calls and their results, streamed while the agent works.',
		wireType: 'string',
		feed: { role: 'tool', streaming: true },
	}),
	configure(RECOVERY_PORT_ID, streams.recovery$, {
		wireType: 'any',
		// Feed-only — canvas and palette skip hidden outputs.
		hidden: true,
		feed: { role: 'recovery', streaming: true },
	}),
];
