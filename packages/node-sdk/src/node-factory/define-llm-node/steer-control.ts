/**
 * Soft Pause / Steer on LLM inventory port `steerControl` (ADR-032).
 *
 * Pause button → `{ kind: 'pause' }`. HITL Send → `{ kind: 'steer', text }`.
 * Optional `{ kind: 'resume' }` continues without new text.
 */

export const STEER_CONTROL_PORT_ID = 'steerControl' as const;

export type SteerControlPause = {
	readonly kind: 'pause';
};

export type SteerControlSteer = {
	readonly kind: 'steer';
	readonly text: string;
};

export type SteerControlResume = {
	readonly kind: 'resume';
};

export type SteerControlPayload =
	SteerControlPause | SteerControlSteer | SteerControlResume;

export const isSteerControlPayload = (
	value: unknown,
): value is SteerControlPayload => {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return false;
	}

	const kind = (value as { readonly kind?: unknown }).kind;

	if (kind === 'pause' || kind === 'resume') {
		return true;
	}

	if (kind === 'steer') {
		return typeof (value as { readonly text?: unknown }).text === 'string';
	}

	return false;
};

export const isSteerControlPause = (
	value: unknown,
): value is SteerControlPause =>
	isSteerControlPayload(value) && value.kind === 'pause';

export const isSteerControlContinue = (
	value: unknown,
): value is SteerControlSteer | SteerControlResume =>
	isSteerControlPayload(value) &&
	(value.kind === 'steer' || value.kind === 'resume');
