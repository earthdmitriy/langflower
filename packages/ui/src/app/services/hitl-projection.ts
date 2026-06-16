import type { PaletteNodeDefinition } from '@langflower/shared/langflower';
import type { HitlInputConfig } from '@langflower/node-sdk';
import {
	STEER_CONTROL_PORT_ID,
	isSteerControlContinue,
	isSteerControlPause,
} from '@langflower/node-sdk/llm';

/** One HITL control surface rendered in the work-log feed. */
export type HitlControlProjection = {
	readonly nodeId: string;
	readonly portId: string;
	readonly config: HitlInputConfig;
};

type PortInputConfig = PaletteNodeDefinition['inputsConfigs'][number];

/**
 * Every HITL-marked input on a node — rendered together so the user chooses the
 * feedback type. Returns `[]` when the node has no `config.hitl` inputs.
 * Includes ADR-032 `steerControl` (shown only when fold opened via pause).
 */
export const hitlControlsForNode = (
	nodeId: string,
	definition: PaletteNodeDefinition,
): readonly HitlControlProjection[] => {
	return definition.inputsConfigs
		.filter(
			(entry): entry is PortInputConfig & { portId: string } =>
				typeof entry.portId === 'string' && entry.hitl !== undefined,
		)
		.map((entry) => ({
			nodeId,
			portId: entry.portId,
			config: entry.hitl as HitlInputConfig,
		}));
};

/**
 * HITL gate controls only — excludes inventory `steerControl` (ADR-032).
 * Soft Pause opens via payload-aware fold, not via ordinary wired inputs.
 */
export const gateHitlControlsForNode = (
	nodeId: string,
	definition: PaletteNodeDefinition,
): readonly HitlControlProjection[] =>
	hitlControlsForNode(nodeId, definition).filter(
		(control) => control.portId !== STEER_CONTROL_PORT_ID,
	);

/**
 * True when the `input-received` event landed on a **non-HITL** input port of the
 * given node — execution has reached the node and its HITL controls should open.
 *
 * `steerControl` alone must not open the composer (every LLM has it).
 */
export const nonHitlInputReceived = (
	definition: PaletteNodeDefinition,
	nodeId: string,
	portId: string,
): boolean => {
	const input = definition.inputsConfigs.find(
		(entry) => entry.portId === portId,
	);

	if (input === undefined || input.hitl !== undefined) {
		return false;
	}

	return gateHitlControlsForNode(nodeId, definition).length > 0;
};

/**
 * True when the `input-received` event landed on a **HITL** input port — the
 * human reply was delivered and the node's composer should close.
 *
 * ADR-032: `steerControl` is payload-aware — use
 * {@link steerControlHitlTransition} instead of this helper alone.
 */
export const hitlReplyReceived = (
	definition: PaletteNodeDefinition,
	portId: string,
): boolean => {
	const input = definition.inputsConfigs.find(
		(entry) => entry.portId === portId,
	);
	return input !== undefined && input.hitl !== undefined;
};

/**
 * Soft Pause / Steer fold on inventory `steerControl` (ADR-032).
 * `pause` opens awaiting; `steer` / `resume` close; other values ignored.
 */
export const steerControlHitlTransition = (
	portId: string,
	value: unknown,
): 'open' | 'close' | 'ignore' => {
	if (portId !== STEER_CONTROL_PORT_ID) {
		return 'ignore';
	}
	if (isSteerControlPause(value)) {
		return 'open';
	}
	if (isSteerControlContinue(value)) {
		return 'close';
	}
	return 'ignore';
};
