import { STEER_CONTROL_PORT_ID } from '@langflower/node-sdk/llm';
import type { HitlControlProjection } from '../../services/hitl-projection';

/** Empty textarea drafts cannot activate Send/Start; buttons always can. */
export const resolveComposerActionPayload = (
	entry: HitlControlProjection,
	draft: string,
):
	| { readonly ok: true; readonly payload: unknown }
	| { readonly ok: false } => {
	if (entry.config.kind === 'button') {
		return { ok: true, payload: entry.config.payload };
	}
	if (entry.config.kind === 'textarea') {
		const text = draft.trim();
		if (text.length === 0) {
			return { ok: false };
		}
		return { ok: true, payload: text };
	}
	return { ok: false };
};

export const isSteerControlTextarea = (entry: HitlControlProjection): boolean =>
	entry.portId === STEER_CONTROL_PORT_ID && entry.config.kind === 'textarea';

/** Continue on Steer — retry the checkpoint with no new user text. */
export const steerResumePayload = (): { readonly kind: 'resume' } => ({
	kind: 'resume',
});

/**
 * String drafts on `steerControl` become `{ kind: 'steer', text }`.
 * Object payloads (`{ kind: 'resume' }`) pass through unchanged.
 */
export const wrapSteerHitlPayload = (
	portId: string,
	rawPayload: unknown,
): unknown =>
	portId === STEER_CONTROL_PORT_ID && typeof rawPayload === 'string'
		? { kind: 'steer' as const, text: rawPayload }
		: rawPayload;

/**
 * Enter on an empty Steer textarea continues without text.
 * A non-empty draft still Sends; other controls keep their own rules.
 */
export const resolveComposerEnterPayload = (
	entry: HitlControlProjection,
	draft: string,
):
	| { readonly ok: true; readonly payload: unknown }
	| { readonly ok: false } => {
	if (isSteerControlTextarea(entry) && draft.trim().length === 0) {
		return { ok: true, payload: steerResumePayload() };
	}
	return resolveComposerActionPayload(entry, draft);
};
